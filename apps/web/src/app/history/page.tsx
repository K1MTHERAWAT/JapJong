'use client';

/**
 * =====================================================================
 * หน้าประวัติคำขอและงานในความรับผิดชอบ (Request History Page)
 * =====================================================================
 * ศูนย์กลางตรวจสอบประวัติคำขอทั้งหมดสำหรับผู้ใช้งานทุกระดับ:
 * 1. แสดงรายการคำขอของตนเอง (ประชาชนทั่วไป) หรือคำขอที่ตนเองมีส่วนร่วมลงนาม/รับผิดชอบ (เจ้าหน้าที่/ผู้บริหาร)
 * 2. การ์ดตัวนับสถานะแบบคลิกกรองได้ทันที (Stat Counters: ทั้งหมด, รอดำเนินการ, อนุมัติ/เสร็จสิ้น, ไม่อนุมัติ/ยกเลิก)
 * 3. แถบค้นหาข้อความอิสระ (Search Bar) ตรวจสอบเลขคำขอ, สถานที่, อุปกรณ์, หรือหน่วยงาน
 * 4. แท็บตัวกรองแยกตามประเภทบริการ (ขอใช้สถานที่, ขอยืมอุปกรณ์, แจ้งซ่อม)
 * 5. ป้ายสถานะระบุคำขอที่ยื่นเอง หรือตนเองได้ลงนามอนุมัติแล้ว
 * 6. ลิงก์ตรงไปยังหน้าตรวจสอบรายละเอียดคำขอ A4 หรือใบอนุญาต PDF
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// โมเดลข้อมูลคำขอและบทบาทจาก Shared Package
import {
  ROLE_META,
  RequestType,
  RequestWithTimeline,
} from '@japjong/shared';
// Context ระบบยืนยันตัวตน
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, RequestTypeChip, StatusChip, Tabs } from '@/components/ui';
// API SDK และฟังก์ชันจัดรูปแบบวันที่ภาษาไทย
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

/** ประเภทตัวกรองตามชนิดของบริการ */
type TypeFilter = 'all' | RequestType;
/** ประเภทตัวกรองตามกลุ่มสถานะ */
type StatusGroupFilter = 'all' | 'pending' | 'approved' | 'rejected';

/** กลุ่มสถานะที่อยู่ในระหว่างดำเนินการ */
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

/** กลุ่มสถานะที่อนุมัติหรือเสร็จสิ้นสมบูรณ์แล้ว */
const APPROVED_STATUSES = ['approved', 'returned', 'repair_done'];
/** กลุ่มสถานะที่ไม่ผ่านการอนุมัติหรือถูกยกเลิก */
const REJECTED_STATUSES = ['rejected', 'cancelled'];

export default function RequestHistoryPage() {
  const router = useRouter();
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบัน
  const { account } = useAuth();
  // รายการคำขอทั้งหมด
  const [requests, setRequests] = useState<RequestWithTimeline[]>([]);
  // สถานะการโหลดข้อมูลจากเซิร์ฟเวอร์
  const [loading, setLoading] = useState(true);
  // ตัวกรองตามประเภทบริการ (all, booking, borrow, repair)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  // ตัวกรองตามกลุ่มสถานะ (all, pending, approved, rejected)
  const [statusFilter, setStatusFilter] = useState<StatusGroupFilter>('all');
  // ข้อความค้นหาในช่อง Search
  const [search, setSearch] = useState('');

  /**
   * ดึงรายการประวัติคำขอจาก Backend API ตามบทบาทของผู้ใช้งาน
   * - USER: ดึงเฉพาะคำขอของตนเอง (mine=true)
   * - APPROVER_L2 / APPROVER_L1: ดึงคำขอที่ตนเองเป็นผู้ยื่น, ลงนามแล้ว, หรือรอลงนาม
   * - STAFF / ADMIN: ดึงคำขอทั้งหมดในความรับผิดชอบ
   */
  useEffect(() => {
    if (!account) return;
    setLoading(true);
    const isUser = account.role === 'USER';
    api
      .listRequests(isUser ? { mine: true } : undefined)
      .then((list) => {
        if (isUser) {
          setRequests(list.filter((r) => r.requesterId === account.id));
        } else if (account.role === 'APPROVER_L2' || account.role === 'APPROVER_L1') {
          const relevant = list.filter((r) => {
            if (r.requesterId === account.id) return true;
            if (r.type !== 'repair' && r.signatures?.some((s) => s.signerId === account.id)) return true;
            if (account.role === 'APPROVER_L2' && r.status === 'pending_l2') return true;
            if (account.role === 'APPROVER_L1' && r.status === 'pending_l1') return true;
            return false;
          });
          setRequests(relevant);
        } else {
          setRequests(list);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [account]);

  /**
   * กรองรายการคำขอตามเงื่อนไขที่เลือก (ประเภท, สถานะ, และคำค้นหา)
   */
  const filtered = requests.filter((r) => {
    // กรองตามประเภทบริการ
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    // กรองตามกลุ่มสถานะ
    if (statusFilter === 'pending' && !PENDING_STATUSES.includes(r.status)) return false;
    if (statusFilter === 'approved' && !APPROVED_STATUSES.includes(r.status)) return false;
    if (statusFilter === 'rejected' && !REJECTED_STATUSES.includes(r.status)) return false;
    // กรองตามคำค้นหา (Case-insensitive)
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

  // คำนวณจำนวนคำขอในแต่ละกลุ่มสถานะ
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
        {/* ส่วนหัวและสรุปจำนวนรายการ */}
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
          {/* ป้ายแสดงจำนวนคำขอทั้งหมด */}
          <Chip tone="green">ทั้งหมด {requests.length} รายการ</Chip>
        </div>

        {/* การ์ดตัวนับสถานะ 4 ช่อง (สามารถคลิกเพื่อกรองได้ทันที) */}
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
                className={`jw-card p-3.5 text-left transition cursor-pointer ${
                  active ? 'ring-2 ring-brand bg-brand-mint/30' : 'hover:bg-soft/40'
                }`}
              >
                <span className="text-[12px] text-ink-mute block">{item.label}</span>
                <b className={`text-[22px] ${item.tone}`}>{item.count}</b>
              </button>
            );
          })}
        </div>

        {/* แผงควบคุมตัวกรอง (ช่องค้นหา + แท็บประเภท + ปุ่มสถานะ) */}
        <div className="jw-card p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* ช่องกรอกข้อความค้นหา */}
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
            {/* ปุ่มล้างตัวกรองทั้งหมด (แสดงเมื่อมีการตั้งค่าตัวกรอง) */}
            {(typeFilter !== 'all' || statusFilter !== 'all' || search.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setSearch('');
                }}
                className="text-[13px] font-semibold text-brand hover:underline shrink-0 cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* แท็บเลือกประเภทบริการ */}
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

            {/* ปุ่มแคปซูลเลือกสถานะ */}
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
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition cursor-pointer ${
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

        {/* รายการแสดงผลประวัติคำขอ */}
        <div className="flex flex-col gap-2.5">
          {loading ? (
            <div className="jw-card p-8 text-center text-[14px] text-ink-mute">กำลังโหลดประวัติคำขอ...</div>
          ) : filtered.length === 0 ? (
            <div className="jw-card p-8 text-center text-[14px] text-ink-mute">
              ไม่พบรายการคำขอที่ตรงกับเงื่อนไขตัวกรอง
            </div>
          ) : (
            filtered.map((req) => {
              // จัดรูปแบบวันที่ตามประเภทคำขอ
              const dateText =
                req.type === 'booking'
                  ? req.periods.map((p) => formatPeriodRange(p)).join(', ')
                  : req.type === 'borrow'
                  ? `${formatThaiDate(req.pickupDate, false)}–${formatThaiDate(req.returnDate, true)}`
                  : req.subtitle;

              // ตรวจสอบว่ามีเอกสารใบอนุญาตที่อนุมัติแล้วหรือไม่
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
                  {/* ข้อมูลคำขอฝั่งซ้าย */}
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RequestTypeChip type={req.type} />
                      <b className="text-[14px] text-ink">{req.code}</b>
                      {/* ป้ายกำกับว่าคุณได้ลงนามในคำขอนี้แล้ว */}
                      {req.type !== 'repair' &&
                        req.signatures.some((s) => s.signerId === account?.id) && (
                          <span className="text-[11px] font-semibold text-[#085041] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                            ✓ คุณลงนามแล้ว
                          </span>
                        )}
                      {/* ป้ายกำกับว่าเป็นคำขอที่คุณยื่นเอง */}
                      {req.requesterId === account?.id && (
                        <span className="text-[11px] font-semibold text-[#1e40af] bg-[#dbeafe] px-2 py-0.5 rounded-full">
                          คำขอที่คุณยื่นเอง
                        </span>
                      )}
                      <span className="text-[12px] text-ink-mute">
                        อัปเดต {formatThaiDateTime(req.updatedAt)}
                      </span>
                    </div>
                    {/* หัวข้อคำขอและสถานที่/อุปกรณ์ */}
                    <b className="text-[15.5px] text-ink truncate">
                      {req.title} {req.subtitle && req.type !== 'repair' ? `(${req.subtitle})` : ''}
                    </b>
                    <span className="text-[13px] text-ink-mute">
                      ผู้ขอ: {req.requesterName} ({req.organization}) · {dateText}
                    </span>
                  </div>

                  {/* ฝั่งขวา: ปุ่มดูใบอนุญาต และชิปสถานะคำขอ */}
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

