'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ClipboardCheck,
  FileCheck2,
  Package,
  QrCode,
  Shield,
  Wrench,
} from 'lucide-react';
import { RequestWithTimeline, hasPermission } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import {
  FilterToolbar,
  PageHeader,
  Pagination,
  RequestTypeChip,
  SearchInput,
  SortableHeader,
  StatusChip,
  Tabs,
} from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

type QueueFilter = 'all' | 'review' | 'repair';
const PAGE_SIZE = 10;

export default function StaffHomePage() {
  const router = useRouter();
  const { account } = useAuth();
  const [queue, setQueue] = useState<RequestWithTimeline[]>([]);
  const [returnInspectCount, setReturnInspectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.listRequests({ queue: 'staff' }).catch(() => [] as RequestWithTimeline[]),
      api.listRequests({ type: 'borrow', queue: 'handover' }).catch(() => [] as RequestWithTimeline[]),
    ])
      .then(([staffQueue, inspectList]) => {
        setQueue(staffQueue);
        setReturnInspectCount(inspectList.filter((r) => r.status === 'return_inspect').length);
      })
      .finally(() => setLoading(false));
  }, [account?.id]);

  const repairCount = queue.filter((r) => r.type === 'repair').length;
  const reviewCount = queue.filter((r) => r.type !== 'repair').length;

  const filteredQueue = useMemo(() => {
    const list = queue.filter((r) => {
      if (queueFilter === 'review' && r.type === 'repair') return false;
      if (queueFilter === 'repair' && r.type !== 'repair') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.organization.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return sortDir === 'desc' ? tB - tA : tA - tB;
    });
  }, [queue, queueFilter, search, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [queueFilter, search]);

  const pagedQueue = useMemo(
    () => filteredQueue.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredQueue, page],
  );

  return (
    <AppShell title="แดชบอร์ดเจ้าหน้าที่">
      <div className="flex flex-col gap-5 w-full">
        {/* 1. Enterprise Page Header & Quick Service Actions */}
        <PageHeader
          title="ศูนย์ปฏิบัติงานเจ้าหน้าที่ (Staff Operations)"
          subtitle="บริหารจัดการคิวตรวจสอบคำขอใช้สถานที่ ยืม–คืนครุภัณฑ์ และงานแจ้งซ่อมบำรุง"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/booking"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-ink transition"
              >
                <Building2 className="size-4" />
                <span>ขอใช้สถานที่</span>
              </Link>
              <Link
                href="/borrow"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand bg-brand-tint px-3.5 text-[13px] font-semibold text-brand-ink hover:bg-brand hover:text-white transition"
              >
                <Package className="size-4" />
                <span>ยืม–คืนอุปกรณ์</span>
              </Link>
              <Link
                href="/staff/verify"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-input bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-hover transition"
              >
                <QrCode className="size-4 text-brand" />
                <span>สแกน QR ตรวจใบอนุญาต</span>
              </Link>
            </div>
          }
        />

        {/* 2. 4-KPI Operations Summary Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/staff/review"
            className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3 hover:border-brand/50 transition shadow-xs"
          >
            <div>
              <span className="text-[12px] text-ink-mute block">รอตรวจคำขอ (สถานที่/อุปกรณ์)</span>
              <b className="text-[26px] font-bold text-status-crit leading-tight block mt-0.5">
                {reviewCount}
              </b>
              <span className="text-[11px] text-ink-mute">รอลงนามระดับที่ 1 (เจ้าหน้าที่)</span>
            </div>
            <div className="size-9 rounded-lg bg-danger-bg text-danger-fg flex items-center justify-center shrink-0">
              <ClipboardCheck className="size-4" />
            </div>
          </Link>

          <Link
            href="/staff/repairs"
            className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3 hover:border-brand/50 transition shadow-xs"
          >
            <div>
              <span className="text-[12px] text-ink-mute block">งานแจ้งซ่อมรอจัดการ</span>
              <b className="text-[26px] font-bold text-warn-fg leading-tight block mt-0.5">
                {repairCount}
              </b>
              <span className="text-[11px] text-ink-mute">รอรับเรื่อง / บันทึกผลซ่อม</span>
            </div>
            <div className="size-9 rounded-lg bg-warn-bg text-warn-fg flex items-center justify-center shrink-0">
              <Wrench className="size-4" />
            </div>
          </Link>

          <Link
            href="/borrow/my"
            className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3 hover:border-brand/50 transition shadow-xs"
          >
            <div>
              <span className="text-[12px] text-ink-mute block">รอตรวจสภาพรับคืนอุปกรณ์</span>
              <b className="text-[26px] font-bold text-brand leading-tight block mt-0.5">
                {returnInspectCount}
              </b>
              <span className="text-[11px] text-ink-mute">ถ่ายรูปหลังส่งคืน & ปิดงาน</span>
            </div>
            <div className="size-9 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <FileCheck2 className="size-4" />
            </div>
          </Link>

          <Link
            href="/admin/resources"
            className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3 hover:border-brand/50 transition shadow-xs"
          >
            <div>
              <span className="text-[12px] text-ink-mute block">จัดการทรัพยากรและแบบฟอร์ม</span>
              <b className="text-[17px] font-bold text-ink leading-tight block mt-1.5">
                สถานที่ / ครุภัณฑ์
              </b>
              <span className="text-[11px] text-ink-mute">เปิด–ปิดบริการและสต็อก</span>
            </div>
            <div className="size-9 rounded-lg bg-surface-muted text-ink-soft flex items-center justify-center shrink-0">
              <Shield className="size-4" />
            </div>
          </Link>
        </div>

        {/* 3. Quick Module Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/staff/review"
            className={`rounded-xl border border-brand/40 bg-surface p-4 flex items-center gap-3.5 hover:bg-brand-tint/20 transition shadow-xs ${
              !hasPermission(account, 'review') ? 'opacity-50' : ''
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-brand text-white flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <b className="text-[14.5px] text-ink block">ตรวจคำขอสถานที่และอุปกรณ์</b>
              <span className="text-[12px] text-ink-mute">
                ตรวจสอบเอกสารและลงนามส่งต่อปลัด ({reviewCount} รายการ)
              </span>
            </div>
          </Link>

          <Link
            href="/staff/repairs"
            className={`rounded-xl border border-line bg-surface p-4 flex items-center gap-3.5 hover:border-brand/40 transition shadow-xs ${
              !hasPermission(account, 'review') ? 'opacity-50' : ''
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <b className="text-[14.5px] text-ink block">จัดการงานแจ้งซ่อม</b>
              <span className="text-[12px] text-ink-mute">
                รับเรื่องซ่อมและแนบรูปหลังซ่อม ({repairCount} รายการ)
              </span>
            </div>
          </Link>

          <Link
            href="/admin/resources"
            className={`rounded-xl border border-line bg-surface p-4 flex items-center gap-3.5 hover:border-brand/40 transition shadow-xs ${
              !hasPermission(account, 'manageResources') ? 'opacity-50' : ''
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <b className="text-[14.5px] text-ink block">จัดการทรัพยากรและแบบฟอร์ม</b>
              <span className="text-[12px] text-ink-mute">
                ตั้งค่าห้องประชุม ครุภัณฑ์ และแบบฟอร์มคำขอ
              </span>
            </div>
          </Link>
        </div>

        {/* 4. Unified Staff Work Queue Data Table */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">
              คิวงานรอดำเนินการทั้งหมด ({filteredQueue.length})
            </h2>
            <Link
              href="/history"
              className="text-[12.5px] font-semibold text-brand hover:underline"
            >
              ดูประวัติคำขอทั้งหมด →
            </Link>
          </div>

          <FilterToolbar
            left={
              <Tabs<QueueFilter>
                value={queueFilter}
                onChange={setQueueFilter}
                className="w-full sm:w-auto"
                options={[
                  { value: 'all', label: `ทั้งหมด (${queue.length})` },
                  { value: 'review', label: `สถานที่/อุปกรณ์ (${reviewCount})` },
                  { value: 'repair', label: `งานแจ้งซ่อม (${repairCount})` },
                ]}
              />
            }
            right={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="ค้นหาเลขที่คำขอ, ผู้ยื่น, หน่วยงาน..."
                className="w-full sm:w-72"
              />
            }
          />

          <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-xs">
            {loading ? (
              <div className="p-10 text-center text-[13.5px] text-ink-mute">
                กำลังโหลดคิวงานเจ้าหน้าที่...
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="p-10 text-center text-[13.5px] text-ink-mute">
                ไม่มีรายการคำขอรอดำเนินการในหมวดนี้
              </div>
            ) : (
              <>
                {/* Desktop Data Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-surface-muted/70 text-ink-soft font-semibold text-[12px]">
                        <th className="py-2.5 px-4 whitespace-nowrap">เลขที่คำขอ</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ประเภทบริการ</th>
                        <th className="py-2.5 px-3">รายการ / หัวข้อคำขอ</th>
                        <th className="py-2.5 px-3">ผู้ยื่นคำขอ / หน่วยงาน</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">กำหนดการ / สถานที่</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">
                          <SortableHeader
                            label="วันที่ยื่น"
                            active
                            direction={sortDir}
                            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                          />
                        </th>
                        <th className="py-2.5 px-3 whitespace-nowrap">สถานะ</th>
                        <th className="py-2.5 px-4 text-right whitespace-nowrap">การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {pagedQueue.map((r) => {
                        const scheduleText =
                          r.type === 'booking'
                            ? formatPeriodRange(r.periods[0])
                            : r.type === 'borrow'
                            ? `${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(
                                r.returnDate,
                                true,
                              )}`
                            : r.subtitle;

                        const actionHref =
                          r.type === 'repair'
                            ? `/staff/repairs?id=${r.id}`
                            : `/staff/review?id=${r.id}`;

                        return (
                          <tr
                            key={r.id}
                            onClick={() => router.push(actionHref)}
                            className="hover:bg-hover/70 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-mono font-semibold text-ink whitespace-nowrap">
                              {r.code}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <RequestTypeChip type={r.type} />
                            </td>
                            <td className="py-3 px-3 max-w-[240px]">
                              <div className="font-semibold text-ink truncate">{r.title}</div>
                              {r.subtitle && r.type !== 'repair' && (
                                <div className="text-[11.5px] text-ink-mute truncate">
                                  {r.subtitle}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 max-w-[180px]">
                              <div className="font-medium text-ink truncate">{r.requesterName}</div>
                              <div className="text-[11.5px] text-ink-mute truncate">
                                {r.organization}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-ink-soft whitespace-nowrap max-w-[200px] truncate">
                              {scheduleText}
                            </td>
                            <td className="py-3 px-3 text-[12px] text-ink-mute whitespace-nowrap">
                              {formatThaiDateTime(r.createdAt)}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <StatusChip status={r.status} />
                            </td>
                            <td
                              className="py-3 px-4 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                href={actionHref}
                                className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-ink transition"
                              >
                                <span>
                                  {r.type === 'repair' ? 'จัดการงานซ่อม' : 'ตรวจสอบ/ลงนาม'}
                                </span>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Compact List (< md) */}
                <div className="md:hidden divide-y divide-line-soft">
                  {pagedQueue.map((r) => {
                    const actionHref =
                      r.type === 'repair'
                        ? `/staff/repairs?id=${r.id}`
                        : `/staff/review?id=${r.id}`;
                    return (
                      <div
                        key={r.id}
                        onClick={() => router.push(actionHref)}
                        className="p-3.5 hover:bg-hover transition-colors flex flex-col gap-1.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <RequestTypeChip type={r.type} />
                            <b className="font-mono text-[13px] text-ink">{r.code}</b>
                          </div>
                          <StatusChip status={r.status} />
                        </div>
                        <div className="text-[14px] font-semibold text-ink truncate">{r.title}</div>
                        <div className="text-[12px] text-ink-mute flex items-center justify-between">
                          <span className="truncate">
                            {r.requesterName} ({r.organization})
                          </span>
                          <span className="text-brand font-semibold shrink-0">ดำเนินการ →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={filteredQueue.length}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
