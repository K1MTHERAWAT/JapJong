'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate } from '@/lib/api';

export default function ApproverHomePage() {
  const router = useRouter();
  const { account } = useAuth();
  const [pending, setPending] = useState<RequestWithTimeline[]>([]);
  const [signedTodayCount, setSignedTodayCount] = useState<number>(0);
  const [rejectedTodayCount, setRejectedTodayCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const queue = account?.role === 'APPROVER_L1' ? 'l1' : 'l2';
    setLoading(true);

    Promise.all([
      api.listRequests({ queue }),
      api.listRequests(),
    ])
      .then(([queueList, allList]) => {
        setPending(queueList);

        // คำนวณสถิติจริงวันนี้จากประวัติคำขอ
        const todayStr = new Date().toISOString().slice(0, 10);
        let signedToday = 0;
        let rejectedToday = 0;

        allList.forEach((r) => {
          const l2Sign = r.timeline?.find((t) => t.key.includes('l2') && t.state === 'done');
          const l1Sign = r.timeline?.find((t) => t.key.includes('l1') && t.state === 'done');
          const currentSign = account?.role === 'APPROVER_L1' ? l1Sign : l2Sign;

          if (currentSign?.at && currentSign.at.slice(0, 10) === todayStr) {
            signedToday += 1;
          }

          if (r.status === 'rejected' && r.updatedAt && r.updatedAt.slice(0, 10) === todayStr) {
            rejectedToday += 1;
          }
        });

        setSignedTodayCount(signedToday);
        setRejectedTodayCount(rejectedToday);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [account?.role]);

  const stepLabel = account?.role === 'APPROVER_L1' ? 'ลงนามที่ 3 (อนุมัติ)' : 'ลงนามที่ 2';

  // คำนวณระยะเวลารอนานที่สุดจากคำขอจริง
  const oldestPendingDays = pending.length > 0
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(pending[0].createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <AppShell title="หน้าหลักผู้มีอำนาจ" maxWidth="max-w-[1000px]">
      <div className="flex flex-col gap-4">
        {/* Banner รอคุณลงนาม */}
        <div className="jw-card p-5 bg-brand-mint flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <b className="text-[19px] sm:text-[22px] text-ink">
              รอคุณลงนาม {pending.length} ฉบับ
            </b>
            <span className="text-[13px] text-ink-mute">
              {pending.length > 0
                ? oldestPendingDays > 0
                  ? `เก่าสุดรอมาแล้ว ${oldestPendingDays} วัน`
                  : 'ได้รับคำขอใหม่วันนี้'
                : 'ไม่มีเอกสารค้างรอการลงนาม'}
            </span>
            {pending.length > 0 && (
              <div className="pt-1">
                <Link href={`/approver/sign/${pending[0].id}`} className="jw-btn jw-btn-sm">
                  ลงนามเอกสาร
                </Link>
              </div>
            )}
          </div>
          <div className="w-12 h-12 rounded-full bg-white text-brand flex items-center justify-center shrink-0">
            <Icon name="file-text" className="w-6 h-6" />
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[13px] text-ink-mute">ลงนามวันนี้</span>
            <b className="text-[28px] text-ink leading-tight">{signedTodayCount}</b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[13px] text-ink-mute">ไม่เห็นชอบ</span>
            <b className="text-[28px] text-ink leading-tight">{rejectedTodayCount}</b>
          </div>
        </div>

        {/* รายการเอกสารรอลงนาม */}
        <div className="flex items-center justify-between">
          <b className="text-[16px] sm:text-[18px]">เอกสารรอลงนาม</b>
          <Link
            href="/history"
            className="text-[13px] text-ink font-semibold inline-flex items-center gap-1 hover:underline"
          >
            ดูทั้งหมด <Icon name="chevron-right" className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="jw-card p-8 text-center text-ink-mute text-[14px]">
            กำลังโหลดรายการเอกสาร...
          </div>
        ) : pending.length === 0 ? (
          <div className="jw-card p-8 text-center flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
              <Icon name="check" className="w-6 h-6" />
            </div>
            <b className="text-[15px] text-ink">ไม่มีเอกสารรอลงนามในขณะนี้</b>
            <span className="text-[13px] text-ink-mute">เมื่อมีคำขอส่งมาถึงขั้นตอนของคุณ รายการจะแสดงที่นี่</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pending.map((r) => {
              const sub =
                r.type === 'booking'
                  ? `${r.title} ${r.subtitle ? `· ${r.subtitle}` : ''} · ${formatPeriodRange(r.periods[0])}`
                  : r.type === 'borrow'
                  ? `${r.title} · ${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(r.returnDate, true)}`
                  : r.title;
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/approver/sign/${r.id}`)}
                  className="jw-card p-4 flex items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                >
                  <div className="min-w-0">
                    <b className="block text-[15px] text-ink">{r.code}</b>
                    <span className="text-[13px] text-ink-mute truncate block">{sub}</span>
                  </div>
                  <Chip tone="amber">{r.status === 'pending_l1' ? 'ลงนามที่ 3' : stepLabel}</Chip>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
