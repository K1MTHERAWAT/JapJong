'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Package, Wrench } from 'lucide-react';
import { RequestWithTimeline, hasPermission } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, ServiceCard, StatusChip } from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate } from '@/lib/api';

export default function StaffHomePage() {
  const router = useRouter();
  const { account } = useAuth();
  const [queue, setQueue] = useState<RequestWithTimeline[]>([]);

  useEffect(() => {
    api.listRequests({ queue: 'staff' }).then(setQueue).catch(() => {});
  }, [account?.id]);

  const repairCount = queue.filter((r) => r.type === 'repair').length;
  const reviewCount = queue.filter((r) => r.type !== 'repair').length;

  return (
    <AppShell title="หน้าหลักเจ้าหน้าที่" maxWidth="max-w-[1100px]">
      <div className="flex flex-col gap-6">
        {/* บริการหลัก: ขอใช้สถานที่, ยืม-คืนอุปกรณ์ (เจ้าหน้าที่ไม่มีบริการแจ้งซ่อม) */}
        <section aria-label="บริการหลัก">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[17px] font-bold text-ink">บริการระบบสำหรับเจ้าหน้าที่</h2>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <ServiceCard
              href="/booking"
              title="ขอใช้สถานที่"
              description="ห้องประชุม ศาลา สนามกีฬา และพื้นที่จัดกิจกรรมส่วนกลาง"
              icon={Building2}
            />
            <ServiceCard
              href="/borrow"
              title="ยืม–คืนอุปกรณ์"
              description="เครื่องเสียง โปรเจกเตอร์ เต็นท์ โต๊ะ เก้าอี้ และครุภัณฑ์"
              icon={Package}
            />
          </div>
        </section>

        {/* KPI 2 การ์ด (แยกตรวจคำขอ และ งานซ่อม) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Link
            href="/staff/review"
            className="jw-card p-3.5 sm:p-5 flex flex-col gap-1 hover:border-brand transition"
          >
            <span className="text-[12px] sm:text-[13px] text-ink-mute">รอตรวจคำขอ (สถานที่/อุปกรณ์)</span>
            <b className="text-[26px] sm:text-[32px] text-status-crit leading-tight">{reviewCount}</b>
          </Link>
          <Link
            href="/staff/repairs"
            className="jw-card p-3.5 sm:p-5 flex flex-col gap-1 hover:border-brand transition"
          >
            <span className="text-[12px] sm:text-[13px] text-ink-mute">งานแจ้งซ่อมรอจัดการ</span>
            <b className="text-[26px] sm:text-[32px] text-ink leading-tight">{repairCount}</b>
          </Link>
        </div>

        {/* งานของฉัน (ตามสิทธิ์ที่เปิดใช้งาน: แยกตรวจคำขอกับงานซ่อม) */}
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-bold text-ink mb-3">งานเจ้าหน้าที่</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Link
              href="/staff/review"
              className={`jw-card p-4 border-[1.5px] border-brand flex flex-col items-center text-center gap-2 hover:shadow-high transition ${
                !hasPermission(account, 'review') ? 'opacity-50' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center">
                <Icon name="list-details" className="w-6 h-6" />
              </div>
              <b className="text-[14px] sm:text-[15px]">ตรวจคำขอ</b>
              <span className="text-[12px] text-ink-mute">สถานที่/อุปกรณ์ ({reviewCount})</span>
            </Link>

            <Link
              href="/staff/repairs"
              className={`jw-card p-4 border-[1.5px] border-amber-300 flex flex-col items-center text-center gap-2 hover:shadow-high transition ${
                !hasPermission(account, 'review') ? 'opacity-50' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center">
                <Wrench className="w-6 h-6" />
              </div>
              <b className="text-[14px] sm:text-[15px]">จัดการงานซ่อม</b>
              <span className="text-[12px] text-ink-mute">งานแจ้งซ่อม ({repairCount})</span>
            </Link>

            <Link
              href="/staff/resources"
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

        {/* คำขอรอตรวจ (เฉพาะสถานที่และอุปกรณ์) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <b className="text-[16px] sm:text-[18px]">คำขอรอตรวจ (สถานที่และอุปกรณ์)</b>
            <Link
              href="/history"
              className="text-[13px] font-semibold text-ink inline-flex items-center gap-1 hover:underline"
            >
              ดูทั้งหมด <Icon name="chevron-right" className="w-4 h-4" />
            </Link>
          </div>

          {queue.filter((r) => r.type !== 'repair').length === 0 ? (
            <div className="jw-card p-6 text-center text-[14px] text-ink-mute">ไม่มีคำขอรอตรวจในขณะนี้</div>
          ) : (
            queue
              .filter((r) => r.type !== 'repair')
              .map((r) => {
                const sub =
                  r.type === 'booking'
                    ? `${r.title} · ${formatPeriodRange(r.periods[0])} · ${r.requesterName}`
                    : `${r.title} · ${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(r.returnDate, true)}`;
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

          {repairCount > 0 && (
            <Link
              href="/staff/repairs"
              className="jw-card p-4 bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-3 hover:bg-amber-100/70 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <b className="block text-[14.5px] text-amber-950">มีงานแจ้งซ่อมรอจัดการ {repairCount} รายการ</b>
                  <span className="text-[12.5px] text-amber-800">แตะเพื่อเข้าสู่หน้าจัดการงานซ่อม</span>
                </div>
              </div>
              <span className="text-[13px] font-semibold text-amber-900 flex items-center gap-1">
                ไปหน้างานซ่อม <Icon name="chevron-right" className="w-4 h-4" />
              </span>
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
