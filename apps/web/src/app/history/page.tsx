'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  RequestType,
  RequestWithTimeline,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import {
  Chip,
  DetailDrawer,
  FilterToolbar,
  PageHeader,
  Pagination,
  RequestTypeChip,
  SearchInput,
  SortableHeader,
  StatusChip,
  Tabs,
  Timeline,
} from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

type TypeFilter = 'all' | RequestType;
type StatusGroupFilter = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES = [
  'pending_staff',
  'pending_l2',
  'pending_l1',
  'borrowing',
  'return_inspect',
  'repair_submitted',
  'repair_in_progress',
  'repair_awaiting_acceptance',
];

const APPROVED_STATUSES = ['approved', 'returned', 'repair_done'];
const REJECTED_STATUSES = ['rejected', 'cancelled'];
const PAGE_SIZE = 10;

export default function RequestHistoryPage() {
  const router = useRouter();
  const { account } = useAuth();
  const [requests, setRequests] = useState<RequestWithTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusGroupFilter>('all');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [drawerRequest, setDrawerRequest] = useState<RequestWithTimeline | null>(null);

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    api
      .listRequests({ mine: true })
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [account]);

  const filtered = useMemo(() => {
    const list = requests.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter === 'pending' && !PENDING_STATUSES.includes(r.status)) return false;
      if (statusFilter === 'approved' && !APPROVED_STATUSES.includes(r.status)) return false;
      if (statusFilter === 'rejected' && !REJECTED_STATUSES.includes(r.status)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.organization.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const tA = new Date(a.updatedAt || a.createdAt).getTime();
      const tB = new Date(b.updatedAt || b.createdAt).getTime();
      return sortDir === 'desc' ? tB - tA : tA - tB;
    });
  }, [requests, typeFilter, statusFilter, search, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, statusFilter, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const countPending = requests.filter((r) => PENDING_STATUSES.includes(r.status)).length;
  const countApproved = requests.filter((r) => APPROVED_STATUSES.includes(r.status)).length;
  const countRejected = requests.filter((r) => REJECTED_STATUSES.includes(r.status)).length;

  return (
    <AppShell
      title="ประวัติคำขอทั้งหมด"
      backHref={roleHomePath(account?.role)}
    >
      <div className="flex flex-col gap-4 w-full">
        {/* 1. Page Header */}
        <PageHeader
          title={
            account?.role === 'USER'
              ? 'ประวัติคำขอของฉัน'
              : 'ประวัติคำขอและงานในความรับผิดชอบ'
          }
          subtitle={
            account?.role === 'USER'
              ? `รายการคำขอทั้งหมดของ ${account.name} (${account.position || 'ประชาชน'})`
              : `รายการคำขอที่ ${account?.name} (${account?.position}) เป็นผู้ยื่น หรือได้รับมอบหมายและลงนาม`
          }
          badge={<Chip tone="green">ทั้งหมด {requests.length} รายการ</Chip>}
        />

        {/* 2. KPI Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { key: 'all', label: 'รายการทั้งหมด', count: requests.length, tone: 'text-ink' },
              { key: 'pending', label: 'รอดำเนินการ', count: countPending, tone: 'text-warn-fg' },
              {
                key: 'approved',
                label: 'อนุมัติ / เสร็จสิ้น',
                count: countApproved,
                tone: 'text-brand',
              },
              {
                key: 'rejected',
                label: 'ไม่อนุมัติ / ยกเลิก',
                count: countRejected,
                tone: 'text-status-crit',
              },
            ] as const
          ).map((item) => {
            const active = statusFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key)}
                className={`rounded-xl border bg-surface p-3.5 text-left transition ${
                  active
                    ? 'border-brand ring-2 ring-brand/15 bg-brand-tint/20'
                    : 'border-line hover:border-brand/40 shadow-xs'
                }`}
              >
                <span className="text-[12px] text-ink-mute block">{item.label}</span>
                <b className={`text-[22px] font-bold ${item.tone}`}>{item.count}</b>
              </button>
            );
          })}
        </div>

        {/* 3. Filter & Search Toolbar */}
        <FilterToolbar
          left={
            <>
              <Tabs<TypeFilter>
                value={typeFilter}
                onChange={setTypeFilter}
                className="w-full sm:w-auto"
                options={[
                  { value: 'all', label: 'ทุกประเภท' },
                  { value: 'booking', label: 'สถานที่' },
                  { value: 'borrow', label: 'อุปกรณ์' },
                  { value: 'repair', label: 'แจ้งซ่อม' },
                ]}
              />
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', 'ทุกสถานะ'],
                    ['pending', 'รอดำเนินการ'],
                    ['approved', 'อนุมัติ/เสร็จสิ้น'],
                    ['rejected', 'ไม่อนุมัติ/ยกเลิก'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition ${
                      statusFilter === val
                        ? 'bg-brand text-white'
                        : 'bg-surface-muted text-ink-soft hover:bg-hover'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          }
          right={
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="ค้นหาเลขที่คำขอ, รายการ, ผู้ยื่น, หน่วยงาน..."
                className="w-full sm:w-72"
              />
              {(typeFilter !== 'all' || statusFilter !== 'all' || search.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setStatusFilter('all');
                    setSearch('');
                  }}
                  className="text-[12px] font-semibold text-brand hover:underline shrink-0"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          }
        />

        {/* 4. Desktop Data Table & Mobile Card List */}
        <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-10 text-center text-[13.5px] text-ink-mute flex flex-col items-center gap-2">
              <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span>กำลังโหลดประวัติคำขอ...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-[13.5px] text-ink-mute">
              ไม่พบรายการคำขอที่ตรงกับเงื่อนไขตัวกรอง
            </div>
          ) : (
            <>
              {/* Desktop Data Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-muted/70 text-ink-soft font-semibold text-[12px]">
                      <th className="py-2.5 px-4 whitespace-nowrap">เลขที่คำขอ</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">ประเภทบริการ</th>
                      <th className="py-2.5 px-3">หัวข้อ / รายการ</th>
                      <th className="py-2.5 px-3">ผู้ยื่นคำขอ / หน่วยงาน</th>
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
                    {paged.map((req) => {
                      const dateText =
                        req.type === 'booking'
                          ? req.periods.map((p) => formatPeriodRange(p)).join(', ')
                          : req.type === 'borrow'
                          ? `${formatThaiDate(req.pickupDate, false)}–${formatThaiDate(
                              req.returnDate,
                              true,
                            )}`
                          : req.subtitle;

                      const isApprovedDoc =
                        req.type !== 'repair' &&
                        (req.status === 'approved' ||
                          req.status === 'borrowing' ||
                          req.status === 'returned');

                      const fullHref =
                        req.type === 'repair'
                          ? `/repair?mode=track&id=${req.id}`
                          : `/requests/${req.id}`;

                      return (
                        <tr
                          key={req.id}
                          onClick={() => setDrawerRequest(req)}
                          className="hover:bg-hover/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-mono font-semibold text-ink whitespace-nowrap">
                            <div>{req.code}</div>
                            {req.type !== 'repair' &&
                              req.signatures?.some((s) => s.signerId === account?.id) && (
                                <span className="inline-block mt-0.5 text-[10.5px] font-semibold text-brand-ink bg-brand-tint px-1.5 py-0.2 rounded">
                                  ✓ คุณลงนามแล้ว
                                </span>
                              )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <RequestTypeChip type={req.type} />
                          </td>
                          <td className="py-3 px-3 max-w-[240px]">
                            <div className="font-semibold text-ink truncate">{req.title}</div>
                            {req.subtitle && req.type !== 'repair' && (
                              <div className="text-[11.5px] text-ink-mute truncate">
                                {req.subtitle}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 max-w-[180px]">
                            <div className="font-medium text-ink truncate">{req.requesterName}</div>
                            <div className="text-[11.5px] text-ink-mute truncate">
                              {req.organization}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-ink-soft whitespace-nowrap max-w-[200px] truncate">
                            {dateText}
                          </td>
                          <td className="py-3 px-3 text-[12px] text-ink-mute whitespace-nowrap">
                            {formatThaiDateTime(req.updatedAt)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <StatusChip status={req.status} />
                          </td>
                          <td
                            className="py-3 px-4 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              {isApprovedDoc && (
                                <Link
                                  href={`/approver/permit/${req.id}`}
                                  className="px-2.5 py-1 rounded-md border border-brand text-brand text-[12px] font-semibold hover:bg-brand hover:text-white transition"
                                >
                                  ใบอนุญาต PDF
                                </Link>
                              )}
                              <Link
                                href={fullHref}
                                className="px-2.5 py-1 rounded-md border border-line bg-surface text-ink-soft text-[12px] font-semibold hover:bg-hover hover:text-ink transition"
                              >
                                เปิดหน้าคำขอ
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Compact Cards (< md) */}
              <div className="md:hidden divide-y divide-line-soft">
                {paged.map((req) => {
                  const dateText =
                    req.type === 'booking'
                      ? req.periods.map((p) => formatPeriodRange(p)).join(', ')
                      : req.type === 'borrow'
                      ? `${formatThaiDate(req.pickupDate, false)}–${formatThaiDate(
                          req.returnDate,
                          true,
                        )}`
                      : req.subtitle;

                  return (
                    <div
                      key={req.id}
                      onClick={() => setDrawerRequest(req)}
                      className="p-3.5 hover:bg-hover transition-colors flex flex-col gap-1.5 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <RequestTypeChip type={req.type} />
                          <b className="font-mono text-[13px] text-ink">{req.code}</b>
                        </div>
                        <StatusChip status={req.status} />
                      </div>
                      <div className="text-[14px] font-semibold text-ink truncate">
                        {req.title}
                      </div>
                      <div className="text-[12px] text-ink-mute">
                        ผู้ขอ: {req.requesterName} ({req.organization}) · {dateText}
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

      {/* Side Detail Drawer for Quick Inspection without leaving the Table */}
      <DetailDrawer
        open={Boolean(drawerRequest)}
        onClose={() => setDrawerRequest(null)}
        title={drawerRequest ? `${drawerRequest.code} · ${drawerRequest.title}` : ''}
        subtitle={
          drawerRequest
            ? `ผู้ยื่นคำขอ: ${drawerRequest.requesterName} (${drawerRequest.organization})`
            : undefined
        }
        badge={drawerRequest ? <StatusChip status={drawerRequest.status} /> : undefined}
        footer={
          drawerRequest ? (
            <>
              <button
                type="button"
                onClick={() => setDrawerRequest(null)}
                className="jw-btn-sec jw-btn-sm"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="button"
                onClick={() => {
                  const target =
                    drawerRequest.type === 'repair'
                      ? `/repair?mode=track&id=${drawerRequest.id}`
                      : `/requests/${drawerRequest.id}`;
                  router.push(target);
                }}
                className="jw-btn jw-btn-sm"
              >
                ดูเอกสารคำขอฉบับเต็ม →
              </button>
            </>
          ) : undefined
        }
      >
        {drawerRequest && (
          <div className="flex flex-col gap-4 text-[13.5px]">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-muted/50 p-3.5">
              <div>
                <span className="text-[12px] text-ink-mute block">ประเภทคำขอ</span>
                <div className="mt-0.5">
                  <RequestTypeChip type={drawerRequest.type} />
                </div>
              </div>
              <div>
                <span className="text-[12px] text-ink-mute block">อัปเดตล่าสุด</span>
                <b className="text-ink font-medium">
                  {formatThaiDateTime(drawerRequest.updatedAt)}
                </b>
              </div>
              <div>
                <span className="text-[12px] text-ink-mute block">ผู้ยื่นคำขอ</span>
                <b className="text-ink font-medium">{drawerRequest.requesterName}</b>
              </div>
              <div>
                <span className="text-[12px] text-ink-mute block">หน่วยงาน</span>
                <b className="text-ink font-medium">{drawerRequest.organization}</b>
              </div>
            </div>

            {drawerRequest.timeline && drawerRequest.timeline.length > 0 && (
              <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-2">
                <b className="text-[14px] text-ink">ลำดับขั้นตอนการดำเนินงาน (Timeline)</b>
                <Timeline steps={drawerRequest.timeline} />
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </AppShell>
  );
}
