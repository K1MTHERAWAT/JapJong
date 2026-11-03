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

  useEffect(() => {
    const queue = account?.role === 'APPROVER_L1' ? 'l1' : 'l2';
    api
      .listRequests({ queue })
      .then((list) => {
        if (list.length > 0) {
          setPending(list);
        } else {
          // ถ้าคิวของระดับนี้ว่าง แสดงรายการที่รอระดับ 2/1 ทั้งหมดเพื่อให้ทดสอบได้สะดวก
          api
            .listRequests()
            .then((all) => setPending(all.filter((r) => r.status === 'pending_l2' || r.status === 'pending_l1')));
        }
      })
      .catch(() => {});
  }, [account?.role]);

  const firstId = pending[0]?.id ?? 'r-bk-0142';
  const stepLabel = account?.role === 'APPROVER_L1' ? 'ลงนามที่ 3 (อนุมัติ)' : 'ลงนามที่ 2';

  return (
    <AppShell title="หน้าหลักผู้มีอำนาจ" maxWidth="max-w-[1000px]">
      <div className="flex flex-col gap-4">
        {/* Banner รอคุณลงนาม */}
        <div className="jw-card p-5 bg-brand-mint flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <b className="text-[19px] sm:text-[22px] text-ink">รอคุณลงนาม {pending.length} ฉบับ</b>
            <span className="text-[13px] text-ink-mute">เก่าสุดรอมาแล้ว 1 วัน</span>
            <div className="pt-1">
              <Link href={`/approver/sign/${firstId}`} className="jw-btn jw-btn-sm">
                ลงนามเอกสาร
              </Link>
            </div>
          </div>
          <div className="w-12 h-12 rounded-full bg-white text-brand flex items-center justify-center shrink-0">
            <Icon name="file-text" className="w-6 h-6" />
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[13px] text-ink-mute">ลงนามวันนี้</span>
            <b className="text-[28px] text-ink leading-tight">5</b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[13px] text-ink-mute">ไม่เห็นชอบ</span>
            <b className="text-[28px] text-ink leading-tight">0</b>
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
      </div>
    </AppShell>
  );
}
