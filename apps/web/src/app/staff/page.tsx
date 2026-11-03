'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequestWithTimeline, hasPermission } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, StatusChip } from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate } from '@/lib/api';

export default function StaffHomePage() {
  const router = useRouter();
  const { account } = useAuth();
  const [queue, setQueue] = useState<RequestWithTimeline[]>([]);
  const [handoverQueue, setHandoverQueue] = useState<RequestWithTimeline[]>([]);

  useEffect(() => {
    api.listRequests({ queue: 'staff' }).then(setQueue).catch(() => {});
    api.listRequests({ queue: 'handover' }).then(setHandoverQueue).catch(() => {});
  }, [account?.id]);

  const repairCount = queue.filter((r) => r.type === 'repair').length;
  const reviewCount = queue.filter((r) => r.type !== 'repair').length;

  return (
    <AppShell title="หน้าหลักเจ้าหน้าที่" maxWidth="max-w-[1100px]">
      <div className="flex flex-col gap-5">
        {/* KPI 3 การ์ด */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="jw-card p-3.5 sm:p-5 flex flex-col gap-1">
            <span className="text-[12px] sm:text-[13px] text-ink-mute">รอตรวจคำขอ</span>
            <b className="text-[26px] sm:text-[32px] text-status-crit leading-tight">{reviewCount || queue.length}</b>
          </div>
          <div className="jw-card p-3.5 sm:p-5 flex flex-col gap-1">
            <span className="text-[12px] sm:text-[13px] text-ink-mute">รับมอบ-คืนวันนี้</span>
            <b className="text-[26px] sm:text-[32px] text-ink leading-tight">{handoverQueue.length}</b>
          </div>
          <div className="jw-card p-3.5 sm:p-5 flex flex-col gap-1">
            <span className="text-[12px] sm:text-[13px] text-ink-mute">แจ้งซ่อมใหม่</span>
            <b className="text-[26px] sm:text-[32px] text-ink leading-tight">{repairCount}</b>
          </div>
        </div>

        {/* งานของฉัน (ตามสิทธิ์ที่เปิดใช้งาน) */}
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-bold text-ink mb-3">งานของฉัน</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Link
              href="/staff/review"
              className={`jw-card p-4 border-[1.5px] border-brand flex flex-col items-center text-center gap-2 hover:shadow-high transition ${
                !hasPermission(account, 'review') ? 'opacity-50' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center">
                <Icon name="list-details" className="w-6 h-6" />
              </div>
              <b className="text-[14px] sm:text-[15px]">ตรวจคำขอ & งานซ่อม</b>
              <span className="text-[12px] text-ink-mute">รอ {queue.length} รายการ</span>
            </Link>

            <Link
              href="/staff/handover"
              className={`jw-card p-4 flex flex-col items-center text-center gap-2 hover:shadow-high transition ${
                !hasPermission(account, 'handover') ? 'opacity-50' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                <Icon name="package" className="w-6 h-6" />
              </div>
              <b className="text-[14px] sm:text-[15px]">รับมอบ-คืน</b>
              <span className="text-[12px] text-ink-mute">เช็คลิสต์ ({handoverQueue.length})</span>
            </Link>

            <Link
              href="/staff/walk-in"
              className={`jw-card p-4 flex flex-col items-center text-center gap-2 hover:shadow-high transition ${
                !hasPermission(account, 'walkIn') ? 'opacity-50' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                <Icon name="user-circle" className="w-6 h-6" />
              </div>
              <b className="text-[14px] sm:text-[15px]">กรอกคำขอแทน</b>
              <span className="text-[12px] text-ink-mute">หน้าเคาน์เตอร์</span>
            </Link>

            <Link
              href="/admin/resources"
              className={`jw-card p-4 flex flex-col items-center text-center gap-2 hover:shadow-high transition ${
                !hasPermission(account, 'manageResources') ? 'opacity-50' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                <Icon name="building-community" className="w-6 h-6" />
              </div>
              <b className="text-[14px] sm:text-[15px]">จัดการทรัพยากร</b>
              <span className="text-[12px] text-ink-mute">สถานที่ / อุปกรณ์</span>
            </Link>
          </div>
        </div>

        {/* คำขอรอตรวจ */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <b className="text-[16px] sm:text-[18px]">คำขอรอตรวจ</b>
            <Link
              href="/history"
              className="text-[13px] font-semibold text-ink inline-flex items-center gap-1 hover:underline"
            >
              ดูทั้งหมด <Icon name="chevron-right" className="w-4 h-4" />
            </Link>
          </div>

          {queue.length === 0 ? (
            <div className="jw-card p-6 text-center text-[14px] text-ink-mute">ไม่มีคำขอรอตรวจ</div>
          ) : (
            queue.map((r) => {
              const sub =
                r.type === 'booking'
                  ? `${r.title} · ${formatPeriodRange(r.periods[0])} · ${r.requesterName}`
                  : r.type === 'borrow'
                  ? `${r.title} · ${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(r.returnDate, true)}`
                  : `${r.title} · ${r.location}`;
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/staff/review?id=${r.id}`)}
                  className="jw-card p-4 flex items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                >
                  <div className="min-w-0">
                    <b className="block text-[15px] text-ink">{r.code}</b>
                    <span className="text-[13px] text-ink-mute truncate block">{sub}</span>
                  </div>
                  <StatusChip status={r.status} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
