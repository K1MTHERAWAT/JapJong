'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, FileCheck, XCircle } from 'lucide-react';
import { RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  Chip,
  FilterToolbar,
  PageHeader,
  Pagination,
  RequestTypeChip,
  SearchInput,
  SortableHeader,
  Tabs,
} from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

type TypeFilter = 'all' | 'booking' | 'borrow';
const PAGE_SIZE = 10;

export default function ApproverHomePage() {
  const router = useRouter();
  const { account } = useAuth();
  const [pending, setPending] = useState<RequestWithTimeline[]>([]);
  const [signedTodayCount, setSignedTodayCount] = useState<number>(0);
  const [rejectedTodayCount, setRejectedTodayCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const queue = account?.role === 'APPROVER_L1' ? 'l1' : 'l2';
    setLoading(true);

    Promise.all([api.listRequests({ queue }), api.listRequests()])
      .then(([queueList, allList]) => {
        setPending(queueList);

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

  const stepLabel = account?.role === 'APPROVER_L1' ? 'ลงนามที่ 3 (นายก อบต.)' : 'ลงนามที่ 2 (ปลัด อบต.)';

  const oldestPendingDays =
    pending.length > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(pending[0].createdAt).getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : 0;

  const filtered = useMemo(() => {
    const list = pending.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
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
  }, [pending, typeFilter, search, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  return (
    <AppShell title="คิวลงนามอนุมัติ">
      <div className="flex flex-col gap-5 w-full">
        {/* 1. Page Header */}
        <PageHeader
          title="ศูนย์ลงนามอนุมัติคำขอราชการ (Executive Signing Queue)"
          subtitle={`บัญชีผู้ลงนาม: ${account?.name || ''} (${account?.position || stepLabel})`}
          badge={<Chip tone="amber">รอลงนาม {pending.length} ฉบับ</Chip>}
          actions={
            <div className="flex items-center gap-2">
              {pending.length > 0 && (
                <Link
                  href={`/approver/sign/${pending[0].id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-ink transition"
                >
                  <FileCheck className="size-4" />
                  <span>ลงนามฉบับถัดไปทันที</span>
                </Link>
              )}
              <Link
                href="/history"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-hover transition"
              >
                <span>ประวัติการลงนาม</span>
                <Icon name="chevron-right" className="w-4 h-4" />
              </Link>
            </div>
          }
        />

        {/* 2. 4-KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-brand/40 bg-brand-tint/30 p-3.5 flex items-start justify-between gap-3">
            <div>
              <span className="text-[12px] text-ink-mute block">รอคุณลงนามขณะนี้</span>
              <b className="text-[26px] font-bold text-brand-ink leading-tight block mt-0.5">
                {pending.length}
              </b>
              <span className="text-[11px] text-ink-mute">{stepLabel}</span>
            </div>
            <div className="size-9 rounded-lg bg-brand text-white flex items-center justify-center shrink-0">
              <FileCheck className="size-4" />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3">
            <div>
              <span className="text-[12px] text-ink-mute block">ลงนามอนุมัติวันนี้</span>
              <b className="text-[26px] font-bold text-ink leading-tight block mt-0.5">
                {signedTodayCount}
              </b>
              <span className="text-[11px] text-ink-mute">ดำเนินการเสร็จสิ้นวันนี้</span>
            </div>
            <div className="size-9 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-4" />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3">
            <div>
              <span className="text-[12px] text-ink-mute block">ไม่เห็นชอบวันนี้</span>
              <b className="text-[26px] font-bold text-status-crit leading-tight block mt-0.5">
                {rejectedTodayCount}
              </b>
              <span className="text-[11px] text-ink-mute">รายการที่ไม่อนุมัติวันนี้</span>
            </div>
            <div className="size-9 rounded-lg bg-danger-bg text-danger-fg flex items-center justify-center shrink-0">
              <XCircle className="size-4" />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 flex items-start justify-between gap-3">
            <div>
              <span className="text-[12px] text-ink-mute block">ระยะเวลารอนานที่สุด</span>
              <b className="text-[26px] font-bold text-warn-fg leading-tight block mt-0.5">
                {pending.length > 0 ? `${oldestPendingDays} วัน` : '-'}
              </b>
              <span className="text-[11px] text-ink-mute">
                {pending.length > 0 ? 'นับจากวันที่ยื่นคำขอ' : 'ไม่มีเอกสารค้าง'}
              </span>
            </div>
            <div className="size-9 rounded-lg bg-warn-bg text-warn-fg flex items-center justify-center shrink-0">
              <Clock className="size-4" />
            </div>
          </div>
        </div>

        {/* 3. Filter & Search Toolbar */}
        <FilterToolbar
          left={
            <Tabs<TypeFilter>
              value={typeFilter}
              onChange={setTypeFilter}
              className="w-full sm:w-auto"
              options={[
                { value: 'all', label: `ทั้งหมด (${pending.length})` },
                {
                  value: 'booking',
                  label: `ขอใช้สถานที่ (${pending.filter((r) => r.type === 'booking').length})`,
                },
                {
                  value: 'borrow',
                  label: `ยืมอุปกรณ์ (${pending.filter((r) => r.type === 'borrow').length})`,
                },
              ]}
            />
          }
          right={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="ค้นหาเลขที่คำขอ, เรื่อง, ผู้ยื่นคำขอ..."
              className="w-full sm:w-72"
            />
          }
        />

        {/* 4. Signing Queue Data Table */}
        <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-10 text-center text-ink-mute text-[13.5px]">
              กำลังโหลดรายการเอกสารรอลงนาม...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                <Icon name="check" className="w-6 h-6" />
              </div>
              <b className="text-[15px] text-ink">ไม่มีเอกสารรอลงนามในขณะนี้</b>
              <span className="text-[13px] text-ink-mute">
                เมื่อมีคำขอผ่านการตรวจสอบและส่งมาถึงลำดับของคุณ รายการจะปรากฏในตารางนี้
              </span>
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
                      <th className="py-2.5 px-3">เรื่อง / รายการที่ขออนุญาต</th>
                      <th className="py-2.5 px-3">ผู้ยื่นคำขอ / หน่วยงาน</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">กำหนดการใช้งาน</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">
                        <SortableHeader
                          label="วันที่ยื่น"
                          active
                          direction={sortDir}
                          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                        />
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap">ลำดับลงนาม</th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {paged.map((r) => {
                      const scheduleText =
                        r.type === 'booking'
                          ? formatPeriodRange(r.periods[0])
                          : r.type === 'borrow'
                          ? `${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(
                              r.returnDate,
                              true,
                            )}`
                          : r.subtitle;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => router.push(`/approver/sign/${r.id}`)}
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
                            {r.subtitle && (
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
                            <Chip tone="amber">{stepLabel}</Chip>
                          </td>
                          <td
                            className="py-3 px-4 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={`/approver/sign/${r.id}`}
                              className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-ink transition"
                            >
                              <span>เปิดเอกสารลงนาม</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Compact Cards (< md) */}
              <div className="md:hidden divide-y divide-line-soft">
                {paged.map((r) => {
                  const scheduleText =
                    r.type === 'booking'
                      ? formatPeriodRange(r.periods[0])
                      : r.type === 'borrow'
                      ? `${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(
                          r.returnDate,
                          true,
                        )}`
                      : r.subtitle;
                  return (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/approver/sign/${r.id}`)}
                      className="p-3.5 hover:bg-hover transition-colors flex flex-col gap-1.5 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <RequestTypeChip type={r.type} />
                          <b className="font-mono text-[13px] text-ink">{r.code}</b>
                        </div>
                        <Chip tone="amber">{stepLabel}</Chip>
                      </div>
                      <div className="text-[14px] font-semibold text-ink truncate">{r.title}</div>
                      <div className="text-[12px] text-ink-mute flex items-center justify-between gap-2">
                        <span className="truncate">
                          {r.requesterName} · {scheduleText}
                        </span>
                        <span className="text-brand font-semibold shrink-0">ลงนาม →</span>
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
        </div>
      </div>
    </AppShell>
  );
}
