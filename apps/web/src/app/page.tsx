'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  Wrench,
} from 'lucide-react';
import {
  BorrowRequest,
  ROLE_LABEL,
  RequestType,
  RequestWithTimeline,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import {
  Button,
  Card,
  EmptyState,
  FilterToolbar,
  PageHeader,
  Pagination,
  RequestTypeChip,
  SearchInput,
  SortableHeader,
  StatusChip,
  Tabs,
} from '@/components/ui';
import {
  api,
  formatPeriodRange,
  formatThaiDate,
  formatThaiDateTime,
  getStoredToken,
} from '@/lib/api';
import { resolveLiffTarget } from '@/lib/liff';

type TabFilter = 'all' | RequestType;
type StatusQuickFilter = 'all' | 'pending' | 'approved' | 'action';

export default function HomePage() {
  const router = useRouter();
  const { account, notifications } = useAuth();
  const [requests, setRequests] = useState<RequestWithTimeline[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState<TabFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusQuickFilter>('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  // ดักจับกรณีผู้ใช้เปิดมาจาก LINE LIFF
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.location.search;
    if (!query) return;

    if (query.includes('liff.state') || query.includes('target=') || query.includes('redirect=')) {
      const target = resolveLiffTarget(null, query, '');
      const token = getStoredToken();
      if (target && target !== '/') {
        if (token) {
          router.replace(target);
        } else {
          router.replace(`/liff${query}`);
        }
      } else if (query.includes('liff.state') && !token) {
        router.replace(`/liff${query}`);
      }
    }
  }, [router]);

  // หากเป็น STAFF, APPROVER_L2, APPROVER_L1 หรือ ADMIN ให้เด้งไปยังหน้าหลักของบทบาทตนเองทันที
  useEffect(() => {
    if (account && account.role !== 'USER') {
      router.replace(roleHomePath(account.role));
    }
  }, [account, router]);

  useEffect(() => {
    if (account && account.role !== 'USER') return;
    setLoadingData(true);
    api
      .listRequests({ mine: true })
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [account?.id, account?.role]);

  // Helper checks for summary categories
  const isPendingStatus = (status: RequestWithTimeline['status']) =>
    [
      'pending_staff',
      'pending_l2',
      'pending_l1',
      'return_inspect',
      'repair_submitted',
      'repair_in_progress',
    ].includes(status);

  const isApprovedOrDoneStatus = (status: RequestWithTimeline['status']) =>
    ['approved', 'returned', 'repair_done'].includes(status);

  const isActionRequired = (r: RequestWithTimeline) =>
    (r.type === 'borrow' && (r.status === 'approved' || r.status === 'borrowing')) ||
    (r.type === 'repair' && r.status === 'repair_awaiting_acceptance');

  const summaryCounts = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => isPendingStatus(r.status)).length;
    const approved = requests.filter((r) => isApprovedOrDoneStatus(r.status)).length;
    const action = requests.filter((r) => isActionRequired(r)).length;
    return { total, pending, approved, action };
  }, [requests]);

  const filtered = useMemo(() => {
    const list = requests.filter((r) => {
      if (tab !== 'all' && r.type !== tab) return false;
      if (statusFilter === 'pending' && !isPendingStatus(r.status)) return false;
      if (statusFilter === 'approved' && !isApprovedOrDoneStatus(r.status)) return false;
      if (statusFilter === 'action' && !isActionRequired(r)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const tA = new Date(a.updatedAt || a.createdAt).getTime();
      const tB = new Date(b.updatedAt || b.createdAt).getTime();
      return sortDir === 'desc' ? tB - tA : tA - tB;
    });
  }, [requests, tab, statusFilter, search, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, search]);

  const pagedRequests = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const dueBorrows = useMemo(
    () =>
      requests.filter(
        (r): r is RequestWithTimeline & BorrowRequest =>
          r.type === 'borrow' && (r.status === 'borrowing' || r.status === 'approved'),
      ),
    [requests],
  );

  if (account && account.role !== 'USER') {
    return (
      <AppShell>
        <div className="jw-card p-12 text-center text-ink-mute">
          กำลังนำคุณไปยังหน้าหลัก {ROLE_LABEL[account.role]}...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="หน้าแรกบริการ">
      <div className="flex flex-col gap-5 w-full">
        {/* 1. Compact Enterprise Page Header & Quick Action Buttons */}
        <PageHeader
          title={`สวัสดี, คุณ${account?.nickname || account?.name.split(' ')[0] || 'ผู้ขอรับบริการ'}`}
          subtitle="ระบบบริหารจัดการคำขอใช้สถานที่ราชการ ยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุงออนไลน์"
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
                href="/repair"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-input bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-hover transition"
              >
                <Wrench className="size-4" />
                <span>แจ้งซ่อม</span>
              </Link>
            </div>
          }
        />

        {/* 2. Compact 4-KPI Summary Strip (Clickable Filters) */}
        <section aria-label="สรุปสถานะคำขอของฉัน" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              {
                key: 'all',
                label: 'รายการคำขอทั้งหมด',
                sub: 'คำขอทุกประเภทของคุณ',
                count: summaryCounts.total,
                icon: FileText,
                tone: 'text-ink',
                iconTone: 'bg-surface-muted text-ink-soft',
              },
              {
                key: 'pending',
                label: 'รอดำเนินการ / รออนุมัติ',
                sub: 'อยู่ระหว่างตรวจสอบหรือลงนาม',
                count: summaryCounts.pending,
                icon: Clock,
                tone: 'text-warn-fg',
                iconTone: 'bg-warn-bg text-warn-fg',
              },
              {
                key: 'approved',
                label: 'อนุมัติแล้ว / เสร็จสิ้น',
                sub: 'ผ่านการอนุมัติหรือปิดงานแล้ว',
                count: summaryCounts.approved,
                icon: CheckCircle2,
                tone: 'text-brand',
                iconTone: 'bg-brand-tint text-brand-ink',
              },
              {
                key: 'action',
                label: 'รายการที่ต้องดำเนินการ',
                sub: 'รอรับมอบ / รอส่งคืนครุภัณฑ์',
                count: summaryCounts.action,
                icon: AlertCircle,
                tone: 'text-status-crit',
                iconTone: 'bg-danger-bg text-danger-fg',
              },
            ] as const
          ).map((kpi) => {
            const active = statusFilter === kpi.key;
            const KpiIcon = kpi.icon;
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setStatusFilter(kpi.key)}
                className={`rounded-xl border bg-surface p-3.5 text-left transition-all flex items-start justify-between gap-3 ${
                  active
                    ? 'border-brand ring-2 ring-brand/20 bg-brand-tint/20'
                    : 'border-line hover:border-brand/40 shadow-xs'
                }`}
              >
                <div className="min-w-0">
                  <span className="text-[12px] font-medium text-ink-mute block truncate">
                    {kpi.label}
                  </span>
                  <b className={`text-[24px] font-bold leading-tight block mt-0.5 ${kpi.tone}`}>
                    {kpi.count}
                  </b>
                  <span className="text-[11px] text-ink-mute block truncate mt-0.5">{kpi.sub}</span>
                </div>
                <div
                  className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${kpi.iconTone}`}
                >
                  <KpiIcon className="size-4" />
                </div>
              </button>
            );
          })}
        </section>

        {/* 3. Compact Service Access Bar */}
        <section aria-label="บริการหลัก" className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Link
            href="/booking"
            className="group rounded-xl border border-line bg-surface p-3.5 hover:border-brand/40 hover:bg-brand-tint/15 transition flex items-center gap-3 shadow-xs"
          >
            <div className="size-10 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink group-hover:text-brand">
                ขอใช้สถานที่ราชการ
              </div>
              <div className="text-[12px] text-ink-mute truncate">
                ห้องประชุม ศาลา สนามกีฬา ลานกิจกรรม
              </div>
            </div>
            <ArrowRight className="size-4 text-ink-mute group-hover:text-brand shrink-0" />
          </Link>

          <Link
            href="/borrow"
            className="group rounded-xl border border-line bg-surface p-3.5 hover:border-brand/40 hover:bg-brand-tint/15 transition flex items-center gap-3 shadow-xs"
          >
            <div className="size-10 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <Package className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink group-hover:text-brand">
                ขอยืม–คืนอุปกรณ์
              </div>
              <div className="text-[12px] text-ink-mute truncate">
                เครื่องเสียง โปรเจกเตอร์ เต็นท์ โต๊ะ เก้าอี้
              </div>
            </div>
            <ArrowRight className="size-4 text-ink-mute group-hover:text-brand shrink-0" />
          </Link>

          <Link
            href="/borrow/my"
            className="group rounded-xl border border-line bg-surface p-3.5 hover:border-brand/40 hover:bg-brand-tint/15 transition flex items-center gap-3 shadow-xs"
          >
            <div className="size-10 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink group-hover:text-brand">
                รายการยืม–คืนของฉัน
              </div>
              <div className="text-[12px] text-ink-mute truncate">
                ยืนยันรับมอบ แจ้งส่งคืน และดูรูปหลักฐาน
              </div>
            </div>
            <ArrowRight className="size-4 text-ink-mute group-hover:text-brand shrink-0" />
          </Link>

          <Link
            href="/repair"
            className="group rounded-xl border border-line bg-surface p-3.5 hover:border-brand/40 hover:bg-brand-tint/15 transition flex items-center gap-3 shadow-xs"
          >
            <div className="size-10 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <Wrench className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink group-hover:text-brand">
                แจ้งซ่อมและปัญหา
              </div>
              <div className="text-[12px] text-ink-mute truncate">
                แจ้งครุภัณฑ์ชำรุด อาคารสถานที่เสียหาย
              </div>
            </div>
            <ArrowRight className="size-4 text-ink-mute group-hover:text-brand shrink-0" />
          </Link>
        </section>

        {/* 4. Main Desktop-First Split: My Requests Data Table (Left) + Action & Recent Activity Panel (Right) */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          {/* Left: My Requests Data Table */}
          <section aria-label="คำขอของฉัน" className="flex flex-col gap-3 min-w-0">
            <FilterToolbar
              left={
                <>
                  <Tabs<TabFilter>
                    value={tab}
                    onChange={setTab}
                    className="w-full sm:w-auto"
                    options={[
                      { value: 'all', label: `ทั้งหมด (${requests.length})` },
                      {
                        value: 'booking',
                        label: `สถานที่ (${requests.filter((r) => r.type === 'booking').length})`,
                      },
                      {
                        value: 'borrow',
                        label: `อุปกรณ์ (${requests.filter((r) => r.type === 'borrow').length})`,
                      },
                      {
                        value: 'repair',
                        label: `แจ้งซ่อม (${requests.filter((r) => r.type === 'repair').length})`,
                      },
                    ]}
                  />
                  {statusFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className="text-[12px] font-semibold text-brand hover:underline px-2 py-1"
                    >
                      ล้างตัวกรองสถานะ ×
                    </button>
                  )}
                </>
              }
              right={
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="ค้นหาเลขที่คำขอ หรือชื่อรายการ..."
                  className="w-full sm:w-64"
                />
              }
            />

            <Card padding="none" className="overflow-hidden">
              {loadingData ? (
                <div className="p-10 text-center text-[13.5px] text-ink-mute flex flex-col items-center gap-2">
                  <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  <span>กำลังโหลดรายการคำขอของคุณ...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="ไม่พบรายการคำขอในหมวดนี้"
                    description="คุณสามารถสร้างคำขอใช้สถานที่ ยืมอุปกรณ์ หรือแจ้งซ่อมใหม่ได้จากปุ่มด้านบน"
                    actionLabel="ขอใช้สถานที่"
                    actionHref="/booking"
                  />
                </div>
              ) : (
                <>
                  {/* Desktop Data Table (md+) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-line bg-surface-muted/70 text-ink-soft font-semibold text-[12px]">
                          <th className="py-2.5 px-4 whitespace-nowrap">เลขที่คำขอ</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">ประเภท</th>
                          <th className="py-2.5 px-3">รายการ / หัวข้อคำขอ</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">กำหนดการ / รายละเอียด</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">
                            <SortableHeader
                              label="อัปเดตล่าสุด"
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
                        {pagedRequests.map((req) => {
                          const dateText =
                            req.type === 'booking'
                              ? formatPeriodRange(req.periods[0])
                              : req.type === 'borrow'
                              ? `${formatThaiDate(req.pickupDate, false)} – ${formatThaiDate(
                                  req.returnDate,
                                  true,
                                )}`
                              : req.subtitle;

                          const targetHref =
                            req.type === 'repair'
                              ? `/repair?mode=track&id=${req.id}`
                              : `/requests/${req.id}`;

                          return (
                            <tr
                              key={req.id}
                              onClick={() => router.push(targetHref)}
                              className="hover:bg-hover/70 cursor-pointer transition-colors"
                            >
                              <td className="py-3 px-4 font-mono font-semibold text-ink whitespace-nowrap">
                                {req.code}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <RequestTypeChip type={req.type} />
                              </td>
                              <td className="py-3 px-3 max-w-[260px]">
                                <div className="font-semibold text-ink truncate">{req.title}</div>
                                {req.subtitle && req.type !== 'repair' && (
                                  <div className="text-[11.5px] text-ink-mute truncate">
                                    {req.subtitle}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-ink-soft whitespace-nowrap">
                                {dateText}
                              </td>
                              <td className="py-3 px-3 text-ink-mute text-[12px] whitespace-nowrap">
                                {formatThaiDateTime(req.updatedAt || req.createdAt)}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <StatusChip status={req.status} />
                              </td>
                              <td
                                className="py-3 px-4 text-right whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {req.type === 'borrow' &&
                                (req.status === 'approved' || req.status === 'borrowing') ? (
                                  <Link
                                    href="/borrow/my"
                                    className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-ink transition"
                                  >
                                    <span>
                                      {req.status === 'approved' ? 'ยืนยันรับมอบ' : 'ส่งคืนอุปกรณ์'}
                                    </span>
                                  </Link>
                                ) : (
                                  <Link
                                    href={targetHref}
                                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-soft hover:bg-hover hover:text-ink transition"
                                  >
                                    <span>ดูรายละเอียด</span>
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Compact Card List (< md) */}
                  <div className="md:hidden divide-y divide-line-soft">
                    {pagedRequests.map((req) => {
                      const dateText =
                        req.type === 'booking'
                          ? formatPeriodRange(req.periods[0])
                          : req.type === 'borrow'
                          ? `${formatThaiDate(req.pickupDate, false)} – ${formatThaiDate(
                              req.returnDate,
                              true,
                            )}`
                          : req.subtitle;

                      const targetHref =
                        req.type === 'repair'
                          ? `/repair?mode=track&id=${req.id}`
                          : `/requests/${req.id}`;

                      return (
                        <div
                          key={req.id}
                          onClick={() => router.push(targetHref)}
                          className="p-3.5 hover:bg-hover transition-colors flex flex-col gap-1.5 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <RequestTypeChip type={req.type} />
                              <span className="font-mono text-[12.5px] font-bold text-ink">
                                {req.code}
                              </span>
                            </div>
                            <StatusChip status={req.status} />
                          </div>
                          <div className="text-[14px] font-semibold text-ink truncate">
                            {req.title}
                          </div>
                          <div className="text-[12px] text-ink-mute flex items-center justify-between gap-2">
                            <span className="truncate">{dateText}</span>
                            <span className="text-brand font-semibold shrink-0">ดูรายละเอียด →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    totalItems={filtered.length}
                    onPageChange={setPage}
                  />
                </>
              )}
            </Card>
          </section>

          {/* Right Column: Actionable Borrow Reminders & Recent Notifications */}
          <aside aria-label="งานที่ต้องดำเนินการและแจ้งเตือน" className="flex flex-col gap-4">
            {/* Active / Upcoming Borrow Action Box */}
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-surface-muted/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-brand" />
                  <h2 className="text-[13.5px] font-bold text-ink">อุปกรณ์ที่ต้องดำเนินการ</h2>
                </div>
                <Link
                  href="/borrow/my"
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  ไปหน้ารายการยืม →
                </Link>
              </div>
              <div className="p-3.5 flex flex-col gap-2.5">
                {dueBorrows.length === 0 ? (
                  <div className="py-4 text-center text-[12.5px] text-ink-mute">
                    ไม่มีรายการอุปกรณ์ที่รอรับมอบหรือกำลังยืม
                  </div>
                ) : (
                  dueBorrows.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-line bg-surface-muted/40 p-3 flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11.5px] font-semibold text-brand-ink">
                            {b.code}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-warn-bg text-warn-fg font-semibold">
                            {b.status === 'approved' ? 'รอรับมอบ' : 'กำลังใช้งาน'}
                          </span>
                        </div>
                        <div className="text-[13px] font-semibold text-ink truncate mt-0.5">
                          {b.title}
                        </div>
                        <div className="text-[11.5px] text-ink-mute">
                          กำหนดคืน: {formatThaiDate(b.returnDate)}
                        </div>
                      </div>
                      <Link href="/borrow/my" className="shrink-0">
                        <Button variant="secondary" className="h-8 px-2.5 text-[12px]">
                          {b.status === 'approved' ? 'รับมอบ' : 'ส่งคืน'}
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Recent Notifications */}
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-surface-muted/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-brand" />
                  <h2 className="text-[13.5px] font-bold text-ink">แจ้งเตือนล่าสุด</h2>
                </div>
                <Link
                  href="/notifications"
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  ดูทั้งหมด
                </Link>
              </div>
              <div className="divide-y divide-line-soft">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-[12.5px] text-ink-mute">
                    ไม่มีรายการแจ้งเตือนใหม่
                  </div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      onClick={() => n.link && router.push(n.link)}
                      className={`p-3 cursor-pointer hover:bg-hover transition-colors ${
                        !n.read ? 'bg-brand-tint/25' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink truncate">
                          {n.title}
                        </span>
                        <span className="text-[11px] text-ink-mute shrink-0">
                          {formatThaiDateTime(n.at)}
                        </span>
                      </div>
                      <p className="text-[12px] text-ink-mute mt-0.5 line-clamp-2">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
