'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ROLE_META,
  RequestType,
  RequestWithTimeline,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, RequestTypeChip, StatusChip, Tabs } from '@/components/ui';
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

export default function RequestHistoryPage() {
  const router = useRouter();
  const { account } = useAuth();
  const [requests, setRequests] = useState<RequestWithTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusGroupFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    api
      .listRequests({ mine: true })
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [account]);

  const filtered = requests.filter((r) => {
    if (account?.id && r.requesterId !== account.id) return false;
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

  const countPending = requests.filter((r) => PENDING_STATUSES.includes(r.status)).length;
  const countApproved = requests.filter((r) => APPROVED_STATUSES.includes(r.status)).length;
  const countRejected = requests.filter((r) => REJECTED_STATUSES.includes(r.status)).length;

  return (
    <AppShell
      title="ประวัติคำขอ"
      backHref={roleHomePath(account?.role)}
      maxWidth="max-w-[1120px]"
    >
      <div className="flex flex-col gap-4">
        {/* ส่วนหัวและสรุปจำนวน */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-ink">
              {account?.role === 'USER' ? 'ประวัติคำขอของฉัน' : 'ประวัติคำขอและงานในความรับผิดชอบ'}
            </h1>
            <p className="text-[13.5px] text-ink-mute">
              {account?.role === 'USER'
                ? `รายการคำขอทั้งหมดของ ${account.name} (${account.position})`
                : `รายการคำขอที่ ${account?.name} (${account?.position}) เป็นผู้ยื่น หรือได้รับมอบหมายและลงนาม`}
            </p>
          </div>
          <Chip tone="green">ทั้งหมด {requests.length} รายการ</Chip>
        </div>

        {/* การ์ดตัวนับสถานะ (กดเพื่อกรองได้ทันที) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(
            [
              { key: 'all', label: 'ทั้งหมด', count: requests.length, tone: 'text-ink' },
              { key: 'pending', label: 'รอดำเนินการ', count: countPending, tone: 'text-[#9A4A08]' },
              { key: 'approved', label: 'อนุมัติ / เสร็จสิ้น', count: countApproved, tone: 'text-brand' },
              { key: 'rejected', label: 'ไม่อนุมัติ / ยกเลิก', count: countRejected, tone: 'text-status-crit' },
            ] as const
          ).map((item) => {
            const active = statusFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key)}
                className={`jw-card p-3.5 text-left transition ${
                  active ? 'ring-2 ring-brand bg-brand-mint/30' : 'hover:bg-soft/40'
                }`}
              >
                <span className="text-[12px] text-ink-mute block">{item.label}</span>
                <b className={`text-[22px] ${item.tone}`}>{item.count}</b>
              </button>
            );
          })}
        </div>

        {/* แผงเมนูฟิลเตอร์ (ค้นหา + ประเภท + สถานะ) */}
        <div className="jw-card p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-ph">
                <Icon name="search" className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาเลขที่คำขอ, ชื่อสถานที่/อุปกรณ์, ผู้ขอ, หน่วยงาน..."
                className="jw-in pl-10 h-10 text-[13.5px]"
              />
            </div>
            {(typeFilter !== 'all' || statusFilter !== 'all' || search.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setSearch('');
                }}
                className="text-[13px] font-semibold text-brand hover:underline shrink-0"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <Tabs<TypeFilter>
              value={typeFilter}
              onChange={setTypeFilter}
              className="w-full sm:w-[420px]"
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
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${
                    statusFilter === val
                      ? 'bg-brand text-white'
                      : 'bg-soft text-ink-mute hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* รายการประวัติคำขอ */}
        <div className="flex flex-col gap-2.5">
          {loading ? (
            <div className="jw-card p-8 text-center text-[14px] text-ink-mute">กำลังโหลดประวัติคำขอ...</div>
          ) : filtered.length === 0 ? (
            <div className="jw-card p-8 text-center text-[14px] text-ink-mute">
              ไม่พบรายการคำขอที่ตรงกับเงื่อนไขตัวกรอง
            </div>
          ) : (
            filtered.map((req) => {
              const dateText =
                req.type === 'booking'
                  ? req.periods.map((p) => formatPeriodRange(p)).join(', ')
                  : req.type === 'borrow'
                  ? `${formatThaiDate(req.pickupDate, false)}–${formatThaiDate(req.returnDate, true)}`
                  : req.subtitle;

              const isApprovedDoc =
                req.type !== 'repair' &&
                (req.status === 'approved' || req.status === 'borrowing' || req.status === 'returned');

              return (
                <div
                  key={req.id}
                  onClick={() =>
                    router.push(
                      req.type === 'repair'
                        ? `/repair?mode=track&id=${req.id}`
                        : `/requests/${req.id}`,
                    )
                  }
                  className="jw-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RequestTypeChip type={req.type} />
                      <b className="text-[14px] text-ink">{req.code}</b>
                      {req.type !== 'repair' &&
                        req.signatures.some((s) => s.signerId === account?.id) && (
                          <span className="text-[11px] font-semibold text-[#085041] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                            ✓ คุณลงนามแล้ว
                          </span>
                        )}
                      {req.requesterId === account?.id && (
                        <span className="text-[11px] font-semibold text-[#1e40af] bg-[#dbeafe] px-2 py-0.5 rounded-full">
                          คำขอที่คุณยื่นเอง
                        </span>
                      )}
                      <span className="text-[12px] text-ink-mute">
                        อัปเดต {formatThaiDateTime(req.updatedAt)}
                      </span>
                    </div>
                    <b className="text-[15.5px] text-ink truncate">
                      {req.title} {req.subtitle && req.type !== 'repair' ? `(${req.subtitle})` : ''}
                    </b>
                    <span className="text-[13px] text-ink-mute">
                      ผู้ขอ: {req.requesterName} ({req.organization}) · {dateText}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {isApprovedDoc && (
                      <Link
                        href={`/approver/permit/${req.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 rounded-full border border-brand text-brand text-[12px] font-semibold hover:bg-brand hover:text-white transition"
                      >
                        ดูใบอนุญาต PDF
                      </Link>
                    )}
                    <StatusChip status={req.status} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
