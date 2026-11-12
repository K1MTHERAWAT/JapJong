import React from 'react';
import { REQUEST_TYPE_LABEL, RequestStatus, RequestType, STATUS_META, Tone } from '@japjong/shared';

/**
 * =====================================================================
 * ชิปป้ายสถานะและประเภท (Chip & Status Badge Component)
 * =====================================================================
 * คอมโพเนนต์แสดงแท็กสถานะคำขอและประเภทบริการ:
 * 1. Chip: ป้ายแท็กพื้นฐานรองรับชุดสี TONE_CLASSES หลากหลาย
 * 2. statusToTone: ฟังก์ชันแปลงสถานะคำขอราชการให้เป็นโทนสี (warn / ok / info / danger)
 * 3. StatusChip: ชิปแสดงสถานะของคำขอ (เช่น "รอเจ้าหน้าที่ตรวจสอบ", "อนุมัติแล้ว")
 * 4. RequestTypeChip: ชิปแสดงประเภทคำขอ (ขอใช้สถานที่, ยืมอุปกรณ์, แจ้งซ่อม)
 */

export type ChipTone = 'warn' | 'ok' | 'info' | 'danger' | 'typeBorrow' | 'typeBooking' | 'typeRepair' | Tone;

// ตารางสีพื้นหลังและสีตัวอักษรสำหรับแต่ละ Tone
const TONE_CLASSES: Record<ChipTone, string> = {
  warn: 'bg-warn-bg text-warn-fg',
  ok: 'bg-ok-bg text-ok-fg',
  info: 'bg-info-bg text-info-fg',
  danger: 'bg-danger-bg text-danger-fg',
  // สีเดิมสำหรับความเข้ากันได้ย้อนหลัง (Legacy color mappings)
  amber: 'bg-[#FFF4CC] text-[#765500]',
  green: 'bg-[#ECF5D8] text-[#405D0A]',
  blue: 'bg-[#E8F1FF] text-[#2454A6]',
  red: 'bg-[#FDE7E7] text-[#A32121]',
  gray: 'bg-[#EEF0F3] text-[#4B5563]',
  orange: 'bg-[#FFF0E3] text-[#963F08]',
  purple: 'bg-[#EBDDFB] text-[#5B21B6]',
  teal: 'bg-[#E5F4EF] text-[#176548]',
  cyan: 'bg-[#E3FAFD] text-[#0B6572]',
  indigo: 'bg-[#E2DFFF] text-[#39258C]',
  pink: 'bg-[#FCE7F1] text-[#972454]',
  typeBorrow: 'bg-[#DDF5F2] text-[#11645C]',
  typeBooking: 'bg-[#EEE7FF] text-[#5B3AA7]',
  typeRepair: 'bg-[#F4EBDD] text-[#79552A]',
};

// คอมโพเนนต์ Chip พื้นฐาน
export function Chip({
  tone = 'info',
  className = '',
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        'inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold tracking-tight ring-1 ring-inset ring-black/[0.04]',
        TONE_CLASSES[tone] || TONE_CLASSES.info,
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

// ฟังก์ชันจับคู่สถานะคำขอเป็น Tone สี
export function statusToTone(status: RequestStatus | string): 'warn' | 'ok' | 'info' | 'danger' {
  switch (status) {
    case 'pending_staff':
    case 'pending_l2':
    case 'pending_l1':
    case 'repair_submitted':
    case 'repair_awaiting_acceptance':
      return 'warn';
    case 'approved':
    case 'repair_done':
    case 'returned':
      return 'ok';
    case 'borrowing':
    case 'return_inspect':
    case 'repair_in_progress':
      return 'info';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'info';
  }
}

// คอมโพเนนต์แสดงชิปสถานะคำขออัตโนมัติ
export function StatusChip({ status }: { status: RequestStatus }) {
  const meta = STATUS_META[status];
  const label = meta ? meta.label : status;
  const tone = meta?.tone ?? statusToTone(status);

  return <Chip tone={tone}>{label}</Chip>;
}

// โทนสีประจำแต่ละประเภทบริการ
const REQUEST_TYPE_TONE: Record<RequestType, ChipTone> = {
  borrow: 'typeBorrow',
  booking: 'typeBooking',
  repair: 'typeRepair',
};

// คอมโพเนนต์แสดงชิปประเภทคำขอ (สถานที่/อุปกรณ์/แจ้งซ่อม)
export function RequestTypeChip({ type }: { type: RequestType }) {
  return <Chip tone={REQUEST_TYPE_TONE[type]}>{REQUEST_TYPE_LABEL[type]}</Chip>;
}
