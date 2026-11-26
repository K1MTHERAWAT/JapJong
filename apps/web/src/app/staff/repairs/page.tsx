'use client';

/**
 * =====================================================================
 * หน้าจัดการงานแจ้งซ่อมบำรุงและปัญหาอาคารสำหรับเจ้าหน้าที่ (Staff Repairs Page)
 * =====================================================================
 * วงจรการทำงานของระบบแจ้งซ่อมบำรุง (3-Step Repair Lifecycle):
 * 1. ผู้แจ้งส่งเรื่อง (repair_submitted)
 *    - เจ้าหน้าที่ตรวจสอบปัญหา รูปภาพ และสถานที่
 *    - กด "รับเรื่องซ่อม" (repair_in_progress) หรือ "ส่งกลับ/ไม่รับเรื่อง" (rejected)
 * 2. เจ้าหน้าที่เข้าซ่อมและบันทึกผลงาน (repair_in_progress -> repair_awaiting_acceptance)
 *    - ช่างพิมพ์บันทึกผลการซ่อม (Resolution note)
 *    - บังคับแนบภาพถ่ายหลังซ่อมเสร็จจริง (After photos) บีบอัดอัตโนมัติ 1-3 รูป
 *    - ยืนยันด้วยรหัส PIN 6 หลัก
 * 3. ผู้แจ้งตรวจรับงาน (repair_awaiting_acceptance -> repair_done)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { RepairRequest, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  Chip,
  ChipTone,
  PinKeypad,
  StatusChip,
  statusToTone,
} from '@/components/ui';
import { api, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

/**
 * เปรียบเทียบข้อความ "ปัญหา/อาการ" กับ "รายละเอียด"
 * - หากเหมือนกัน หรืออันหนึ่งเป็นฉบับตัดย่อของอีกอัน ให้แสดงเฉพาะข้อความที่ครบกว่าเพียงอันเดียว
 * - หากต่างกันจริง ให้แสดงทั้งหัวข้อและรายละเอียดรอง
 */
function resolveProblemAndDetail(title: string, detail?: string): {
  heading: string;
  subDetail: string | null;
} {
  const t = (title || '').trim();
  const d = (detail || '').trim();
  if (!d || d === '-') {
    return { heading: t || '-', subDetail: null };
  }
  if (!t) {
    return { heading: d, subDetail: null };
  }
  if (t === d) {
    return { heading: t, subDetail: null };
  }
  const tBase = t.replace(/(\.\.\.|…)+$/, '').trim();
  const dBase = d.replace(/(\.\.\.|…)+$/, '').trim();
  if (tBase.length >= 4 && d.includes(tBase) && d.length >= t.length) {
    return { heading: d, subDetail: null };
  }
  if (dBase.length >= 4 && t.includes(dBase) && t.length >= d.length) {
    return { heading: t, subDetail: null };
  }
  return { heading: t, subDetail: d };
}

function getOfficerInitial(name?: string): string {
  const cleaned = (name || '')
    .trim()
    .replace(/^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.|ว่าที่\s*ร\.ต\.|จ\.ส\.อ\.|ส\.อ\.)\s*/, '');
  const chars = Array.from(cleaned || name || 'จ');
  return chars[0] || 'จ';
}

export default function StaffRepairsPage() {
  // ดึงข้อมูลบัญชีเจ้าหน้าที่ผู้ใช้งาน
  const { account } = useAuth();

  // State เก็บรายการคำขอแจ้งซ่อมทั้งหมดในคิว
  const [queue, setQueue] = useState<(RequestWithTimeline & RepairRequest)[]>([]);
  // State id คำขอแจ้งซ่อมที่เลือกเปิดดู
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // State กำลังโหลดข้อมูล
  const [loading, setLoading] = useState(true);
  // State บันทึกผลการซ่อมบำรุง
  const [resolution, setResolution] = useState('');
  // State ภาพถ่ายหลังซ่อมเสร็จ (Base64 data URLs)
  const [afterPhotos, setAfterPhotos] = useState<string[]>([]);
  // State ติ๊กถูกรับรองการตรวจสอบ
  const [confirmed, setConfirmed] = useState(true);
  // State เปิด/ปิด Modal รหัส PIN 6 หลัก
  const [showPinModal, setShowPinModal] = useState(false);
  // State การกระทำที่รอยืนยัน: 'accept' (รับเรื่อง) | 'finish' (ซ่อมเสร็จ) | 'reject' (ไม่รับเรื่อง)
  const [pendingAction, setPendingAction] = useState<'accept' | 'finish' | 'reject'>('accept');
  // State ค่ารหัส PIN
  const [pin, setPin] = useState('');
  // State ข้อผิดพลาด PIN
  const [pinError, setPinError] = useState('');
  // State ข้อความแจ้งเตือนข้อผิดพลาดทั่วไป
  const [errorMsg, setErrorMsg] = useState('');
  // State งานซ่อมล่าสุดที่ดำเนินการเสร็จแล้ว
  const [lastCompleted, setLastCompleted] = useState<RequestWithTimeline | null>(null);
  // State กำลังบันทึกข้อมูล
  const [submitting, setSubmitting] = useState(false);
  // Ref สำหรับช่องเลือกไฟล์รูปภาพ
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ฟังก์ชันโหลดรายการคิวงานแจ้งซ่อม
  const load = useCallback((preferId?: string | null) => {
    setLoading(true);
    api
      .listRequests({ queue: 'staff', type: 'repair' })
      .then(async (list) => {
        let combined = list as (RequestWithTimeline & RepairRequest)[];
        if (preferId && !combined.some((r) => r.id === preferId || r.code === preferId)) {
          try {
            const single = await api.getRequest(preferId);
            if (single && single.type === 'repair') {
              combined = [single as (RequestWithTimeline & RepairRequest), ...combined];
            }
          } catch {
            // ละเว้นกรณีไม่พบ
          }
        }
        setQueue(combined);
        if (preferId) {
          const found = combined.find((r) => r.id === preferId || r.code === preferId);
          setSelectedId(found ? found.id : null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ดึง param id จาก URL query string
  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    load(sp?.get('id'));
  }, [load]);

  // คำขอปัจจุบันที่กำลังเลือกดู
  const current = selectedId ? queue.find((r) => r.id === selectedId || r.code === selectedId) ?? null : null;

  // รีเซ็ตฟิลด์บันทึกผลการซ่อมและภาพเมื่อเปลี่ยนรายการ
  useEffect(() => {
    setErrorMsg('');
    setResolution(current?.resolution || '');
    setAfterPhotos(current?.afterPhotos || []);
  }, [current?.id, current?.resolution, current?.afterPhotos]);

  // ฟังก์ชันย้อนกลับไปหน้ารายการงานซ่อม
  const handleBackToList = () => {
    setErrorMsg('');
    setSelectedId(null);
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  // เลือกรายการงานซ่อม
  const handleSelectRepair = (reqId: string) => {
    setLastCompleted(null);
    setErrorMsg('');
    setSelectedId(reqId);
  };

  // อัปโหลดและบีบอัดรูปภาพหลังซ่อม
  const handleSelectPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const remaining = Math.max(0, 3 - afterPhotos.length);
    if (remaining === 0) return;
    const newDataUrls = await readAndCompressImages(e.target.files, remaining);
    if (newDataUrls.length) {
      setAfterPhotos((prev) => [...prev, ...newDataUrls].slice(0, 3));
      setErrorMsg('');
    }
    e.target.value = '';
  };

  // ลบรูปภาพหลังซ่อมที่เลือกไว้
  const removePhoto = (idx: number) => {
    setAfterPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // ฟังก์ชันยิง API อัปเดตสถานะงานแจ้งซ่อม
  const handleExecuteAction = async (action: 'accept' | 'finish' | 'reject', enteredPin?: string) => {
    if (!current) return;
    setErrorMsg('');
    setPinError('');

    // กรณีซ่อมเสร็จ บังคับกรอกรายละเอียดและแนบรูปหลังซ่อม
    if (action === 'finish') {
      if (!resolution.trim()) {
        setErrorMsg('กรุณาระบุข้อมูลใน "บันทึกผลการซ่อม"');
        return;
      }
      if (afterPhotos.length === 0) {
        setErrorMsg('กรุณาแนบรูปหลังซ่อมอย่างน้อย 1 รูป');
        return;
      }
    }

    setSubmitting(true);
    try {
      let updated: RequestWithTimeline;
      if (action === 'accept') {
        updated = await api.updateRepairStatus(current.id, {
          action: 'accept',
          pin: enteredPin,
        });
      } else if (action === 'finish') {
        updated = await api.updateRepairStatus(current.id, {
          action: 'finish',
          resolution: resolution.trim(),
          afterPhotos,
          pin: enteredPin,
        });
      } else {
        updated = await api.updateRepairStatus(current.id, {
          action: 'reject',
          pin: enteredPin,
        });
      }
      setShowPinModal(false);
      setPin('');
      setLastCompleted(updated);
      setSelectedId(null);
      if (typeof window !== 'undefined' && window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกงานซ่อม';
      if (msg.includes('PIN')) {
        setPinError(msg);
        setPin('');
      } else {
        setErrorMsg(msg);
        setShowPinModal(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // เริ่มต้นขั้นตอนดำเนินการ (ตรวจเงื่อนไขก่อนเปิด Modal PIN)
  const handleStartAction = (action: 'accept' | 'finish' | 'reject') => {
    if (action === 'finish') {
      if (!resolution.trim()) {
        setErrorMsg('กรุณาระบุข้อมูลใน "บันทึกผลการซ่อม"');
        return;
      }
      if (afterPhotos.length === 0) {
        setErrorMsg('กรุณาแนบรูปหลังซ่อมอย่างน้อย 1 รูป');
        return;
      }
    }
    setPendingAction(action);
    setErrorMsg('');
    setPinError('');
    if (account?.hasPin) {
      setPin('');
      setShowPinModal(true);
    } else {
      handleExecuteAction(action);
    }
  };

  const userDisplayChip = account?.nickname || account?.name || 'เจ้าหน้าที่';

  return (
    <AppShell
      title={current ? undefined : 'จัดการงานซ่อมและปัญหา'}
      backHref={current ? undefined : '/staff'}
      rightLabel={current ? undefined : userDisplayChip}
      maxWidth={current ? 'max-w-[1080px]' : 'max-w-[1100px]'}
    >
      {/* แบนเนอร์แจ้งผลการดำเนินการล่าสุด */}
      {lastCompleted && (
        <div className="mb-4 jw-card p-4 bg-brand-mint border border-brand flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <b className="text-[14px] text-ink block">
              บันทึกงานซ่อม {lastCompleted.code} เรียบร้อยแล้ว
            </b>
            <span className="text-[12px] text-ink-soft">
              {lastCompleted.status === 'repair_in_progress'
                ? 'รับเรื่องเรียบร้อย สถานะเปลี่ยนเป็น "กำลังดำเนินการ"'
                : lastCompleted.status === 'repair_awaiting_acceptance'
                  ? 'บันทึกผลการซ่อมเรียบร้อย ส่งเรื่องให้ผู้แจ้งเข้าตรวจรับงานแล้ว'
                  : lastCompleted.status === 'rejected'
                    ? 'ส่งกลับ / ไม่รับเรื่องซ่อมเรียบร้อยแล้ว'
                    : 'อัปเดตสถานะเรียบร้อย'}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLastCompleted(null)}
              className="jw-btn-sec min-h-[44px] px-4 text-[13px]"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 rounded-control bg-danger-bg border border-danger-border px-4 py-3 text-[13px] text-danger-fg font-medium">
          {errorMsg}
        </div>
      )}

      {!current ? (
        /* ===================== หน้ารายการงานซ่อม (List View) ===================== */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <b className="text-[17px] sm:text-[19px] text-ink">รายการงานซ่อมรอจัดการ</b>
              <Chip tone="amber">รอจัดการ {queue.length} รายการ</Chip>
            </div>
            <Link
              href="/history"
              className="min-h-[44px] text-[13px] font-semibold text-ink inline-flex items-center gap-1 hover:underline"
            >
              ดูประวัติทั้งหมด <Icon name="chevron-right" className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="jw-card p-10 text-center text-[14px] text-ink-mute">
              กำลังโหลดรายการงานซ่อม...
            </div>
          ) : queue.length === 0 ? (
            <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
              </div>
              <b className="text-[17px] text-ink">ไม่มีงานแจ้งซ่อมรอจัดการในขณะนี้</b>
              <p className="text-[13px] text-ink-mute max-w-md">
                เมื่อมีประชาชนหรือเจ้าหน้าที่แจ้งอุปกรณ์ชำรุดหรือปัญหาอาคารสถานที่ รายการจะปรากฏที่นี่
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {queue.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRepair(r.id)}
                  className="jw-card p-4 sm:p-5 w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                >
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[16px] text-ink">{r.code}</b>
                      <Chip tone="orange">{r.category || 'แจ้งซ่อม'}</Chip>
                      <StatusChip status={r.status} />
                    </div>
                    <span className="text-[14px] font-semibold text-ink truncate">
                      {r.building} · {r.floor} · {r.location} — {r.title}
                    </span>
                    <span className="text-[12.5px] text-ink-soft">
                      ผู้แจ้ง: {r.requesterName} · {r.organization} · แจ้งเมื่อ {formatThaiDateTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand shrink-0">
                    <span>{r.status === 'repair_in_progress' ? 'บันทึกผลการซ่อม' : 'จัดการงานซ่อม'}</span>
                    <Icon name="chevron-right" className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ===================== หน้ารายละเอียดงานซ่อม แบบ B (Detail View) ===================== */
        (() => {
          const officerName = current.staffSignerName || account?.name || 'เจ้าหน้าที่';
          const officerRole = account?.role || 'STAFF';
          const officerInitial = getOfficerInitial(officerName);

          const heroHeading =
            current.status === 'repair_submitted'
              ? 'รอช่างรับเรื่อง'
              : current.status === 'repair_in_progress'
                ? 'กำลังดำเนินการ'
                : current.status === 'repair_awaiting_acceptance'
                  ? 'รอผู้แจ้งตรวจรับงาน'
                  : current.status === 'repair_done'
                    ? 'ตรวจรับเรียบร้อย'
                    : current.status === 'rejected'
                      ? 'ส่งกลับ / ไม่รับเรื่อง'
                      : 'ยกเลิกแล้ว';

          // ขั้นตอน 3 ขั้นจากข้อมูลจริง อ้างอิงโทนสีผ่าน statusToTone() ของโปรเจกต์
          type StepNodeState = 'done' | 'current' | 'upcoming' | 'rejected';
          const step2State: StepNodeState = current.finishedAt
            ? 'done'
            : current.status === 'rejected'
              ? 'rejected'
              : current.status === 'cancelled'
                ? 'upcoming'
                : 'current';

          const step2Tone: ChipTone = current.finishedAt
            ? statusToTone('repair_done')
            : current.status === 'rejected'
              ? statusToTone('rejected')
              : current.acceptedAt
                ? statusToTone('repair_in_progress')
                : statusToTone('repair_submitted');

          const step3State: StepNodeState =
            current.status === 'repair_done'
              ? 'done'
              : current.status === 'repair_awaiting_acceptance'
                ? 'current'
                : 'upcoming';

          const step3Tone: ChipTone =
            current.status === 'repair_done'
              ? statusToTone('repair_done')
              : current.status === 'repair_awaiting_acceptance'
                ? statusToTone('repair_awaiting_acceptance')
                : 'gray';

          const steps: {
            num: number;
            roleLabel: string;
            personName: string;
            dateText: string;
            statusText: string;
            nodeState: StepNodeState;
            tone: ChipTone;
          }[] = [
            {
              num: 1,
              roleLabel: '1. ผู้แจ้งส่งเรื่อง',
              personName: current.requesterName,
              dateText: formatThaiDateTime(current.createdAt),
              statusText: '✓ ส่งเรื่องแล้ว',
              nodeState: 'done',
              tone: statusToTone('repair_done'),
            },
            {
              num: 2,
              roleLabel: '2. เจ้าหน้าที่รับเรื่อง & ซ่อม',
              personName: current.staffSignerName || account?.name || 'ฝ่ายช่างซ่อมบำรุง',
              dateText: current.finishedAt
                ? `เสร็จ: ${formatThaiDateTime(current.finishedAt)}`
                : current.acceptedAt
                  ? `รับเรื่อง: ${formatThaiDateTime(current.acceptedAt)}`
                  : 'รอดำเนินการ',
              statusText: current.finishedAt
                ? '✓ ซ่อมเสร็จแล้ว'
                : current.status === 'rejected'
                  ? '✕ ส่งกลับ / ไม่รับเรื่อง'
                  : current.acceptedAt
                    ? '● กำลังดำเนินการ'
                    : '● รอช่างรับเรื่อง',
              nodeState: step2State,
              tone: step2Tone,
            },
            {
              num: 3,
              roleLabel: '3. ผู้แจ้งตรวจรับงาน',
              personName: current.requesterName,
              dateText: current.acceptedByRequesterAt
                ? formatThaiDateTime(current.acceptedByRequesterAt)
                : '-',
              statusText:
                current.status === 'repair_done'
                  ? '✓ ตรวจรับเรียบร้อย'
                  : current.status === 'repair_awaiting_acceptance'
                    ? '● รอคุณตรวจรับ'
                    : '○ รอซ่อมเสร็จ',
              nodeState: step3State,
              tone: step3Tone,
            },
          ];

          const nodeClasses = (state: StepNodeState, tone: ChipTone) => {
            if (state === 'done') {
              return 'bg-ok-bg text-ok-fg ring-2 ring-ok-border';
            }
            if (state === 'rejected') {
              return 'bg-danger-bg text-danger-fg ring-2 ring-danger-border';
            }
            if (state === 'current') {
              return tone === 'info'
                ? 'bg-info-bg text-info-fg ring-2 ring-info-border'
                : 'bg-warn-bg text-warn-fg ring-2 ring-warn-border';
            }
            return 'bg-transparent text-white border-2 border-white/70';
          };

          const { heading: problemHeading, subDetail: problemSubDetail } = resolveProblemAndDetail(
            current.title,
            current.detail,
          );
          const attachments = Array.isArray(current.attachments) ? current.attachments : [];
          const locationFull = [current.building, current.floor, current.location]
            .filter(Boolean)
            .join(' · ');

          return (
            <div className="flex flex-col gap-5 min-w-0">
              {/* 1) แถวหัวหน้า (ใช้ div เพื่อไม่ให้ชนกฎ .gov-brand-shell header) */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    aria-label="กลับไปหน้ารายการงานซ่อม"
                    className="min-w-[44px] min-h-[44px] rounded-control bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer shrink-0 mt-0.5"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <div className="flex flex-col min-w-0">
                    <h1 className="text-[18px] sm:text-[21px] font-bold text-ink leading-tight tracking-tight">
                      จัดการงานซ่อมและปัญหา
                    </h1>
                    <button
                      type="button"
                      onClick={handleBackToList}
                      className="min-h-[44px] -my-1.5 w-fit inline-flex items-center text-[13px] font-semibold text-brand hover:underline cursor-pointer"
                    >
                      ← กลับไปหน้ารายการงานซ่อม ({queue.length})
                    </button>
                  </div>
                </div>

                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-brand bg-brand-mint border border-brand/20 shrink-0">
                  {userDisplayChip}
                </span>
              </div>

              {/* 2) การ์ดสถานะปัจจุบัน (Hero) พื้นเขียวเข้ม ตัวอักษรขาว มุมโค้งใหญ่ rounded-card (20px) */}
              <section className="rounded-card bg-brand-deep text-white p-4 sm:p-6 shadow-high flex flex-col gap-5 min-w-0">
                {/* แถวบน: รหัสงาน + ชิปสถานะ + หัวข้อสถานะใหญ่ + คำแนะนำ | ขวา: แคปซูลผู้รับผิดชอบ */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold tracking-wide text-white">
                        {current.code}
                      </span>
                      {current.category && <Chip tone="orange">{current.category}</Chip>}
                      <StatusChip status={current.status} />
                    </div>

                    <h2 className="text-[22px] sm:text-[26px] font-bold text-white leading-tight tracking-tight">
                      {heroHeading}
                    </h2>

                    {current.status === 'repair_submitted' ? (
                      <p className="text-[13.5px] text-white/95 leading-relaxed max-w-2xl">
                        ตรวจสอบรายละเอียดปัญหาและกดปุ่ม{' '}
                        <b className="font-bold text-white">&quot;รับเรื่องซ่อม (เริ่มดำเนินการ)&quot;</b>{' '}
                        ด้านล่างเพื่อเริ่มงาน
                      </p>
                    ) : current.status === 'repair_in_progress' ? (
                      <p className="text-[13.5px] text-white/95 leading-relaxed max-w-2xl">
                        ระบุรายละเอียดการแก้ไขและแนบรูปภาพหลังซ่อม จากนั้นกดปุ่ม{' '}
                        <b className="font-bold text-white">&quot;บันทึกซ่อมเสร็จ (ส่งตรวจรับ)&quot;</b>{' '}
                        เพื่อส่งงานให้ผู้แจ้งตรวจรับ
                      </p>
                    ) : (
                      <p className="text-[13.5px] text-white/95 leading-relaxed">
                        งานซ่อมนี้ดำเนินการเรียบร้อยแล้ว (
                        {current.status === 'repair_done'
                          ? 'ตรวจรับเสร็จสิ้น'
                          : current.status === 'rejected'
                            ? 'ส่งกลับ / ไม่รับเรื่อง'
                            : 'รอผู้แจ้งตรวจรับงาน'}
                        )
                      </p>
                    )}
                  </div>

                  {/* แคปซูลผู้รับผิดชอบ */}
                  <div className="inline-flex items-center gap-3 px-3.5 py-2 rounded-full bg-white/15 border border-white/25 self-start shrink-0">
                    <span className="size-9 rounded-full bg-white text-brand-deep font-bold text-[14px] flex items-center justify-center shrink-0">
                      {officerInitial}
                    </span>
                    <div className="flex flex-col pr-1">
                      <span className="text-[11.5px] text-white/90 leading-tight">
                        ผู้รับผิดชอบงาน
                      </span>
                      <span className="text-[13px] font-bold text-white leading-snug">
                        {officerName} ({officerRole})
                      </span>
                    </div>
                  </div>
                </div>

                {/* แถวกลาง: ความคืบหน้า 3 ขั้นตอน เรียงแนวนอน เชื่อมด้วยเส้น */}
                <div className="rounded-control bg-white/10 border border-white/15 p-3.5 sm:p-4">
                  <div className="text-[12px] font-semibold text-white/90 mb-3">
                    ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-3">
                    {steps.map((st, idx) => {
                      const prevDone = idx > 0 && steps[idx - 1].nodeState === 'done';
                      return (
                        <div key={st.num} className="relative flex sm:flex-col gap-3 sm:gap-2 min-w-0">
                          <div className="flex sm:w-full items-center gap-2">
                            <span
                              className={`size-8 rounded-full flex items-center justify-center shrink-0 font-bold text-[13px] ${nodeClasses(st.nodeState, st.tone)}`}
                            >
                              {st.nodeState === 'done' ? (
                                <Icon name="check" className="w-4 h-4" strokeWidth={3} />
                              ) : st.nodeState === 'rejected' ? (
                                <Icon name="x" className="w-4 h-4" strokeWidth={3} />
                              ) : st.nodeState === 'current' ? (
                                <span
                                  className={`size-2.5 rounded-full block ${
                                    st.tone === 'info' ? 'bg-info-fg' : 'bg-warn-fg'
                                  }`}
                                />
                              ) : (
                                <span className="text-[12px] font-bold">{st.num}</span>
                              )}
                            </span>

                            {/* เส้นเชื่อมแนวนอนบนจอ sm ขึ้นไป */}
                            {idx < steps.length - 1 && (
                              <span
                                aria-hidden="true"
                                className={`hidden sm:block h-[2px] flex-1 rounded-full ${
                                  st.nodeState === 'done' || prevDone ? 'bg-ok-border' : 'bg-white/30'
                                }`}
                              />
                            )}
                          </div>

                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[12px] font-semibold text-white/90 leading-snug">
                              {st.roleLabel}
                            </span>
                            <b className="text-[14px] font-bold text-white leading-snug break-words">
                              {st.personName}
                            </b>
                            <span className="text-[12px] text-white/90 leading-snug">
                              {st.dateText}
                            </span>
                            <div className="pt-0.5">
                              <Chip tone={st.tone}>{st.statusText}</Chip>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ฟอร์มบันทึกผลการซ่อมและรูปหลังซ่อม (แสดงเมื่ออยู่ในสถานะกำลังดำเนินการ) */}
                {current.status === 'repair_in_progress' && (
                  <div className="rounded-control bg-surface text-ink p-4 sm:p-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                      <b className="text-[15px] text-ink">บันทึกผลการซ่อมและส่งตรวจรับ</b>
                      <span className="text-[12px] text-ink-soft">
                        {account?.name || 'ช่างซ่อมบำรุง'}
                      </span>
                    </div>

                    <div>
                      <label htmlFor="repair-resolution" className="jw-lbl">
                        บันทึกผลการซ่อม <span className="text-danger-fg font-bold">*</span>
                        <span className="text-[12px] font-normal text-ink-soft ml-1">
                          (ระบุรายละเอียดการแก้ไข)
                        </span>
                      </label>
                      <textarea
                        id="repair-resolution"
                        rows={3}
                        value={resolution}
                        onChange={(e) => {
                          setResolution(e.target.value);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="ระบุรายละเอียดการแก้ไข เช่น เปลี่ยนหลอดไฟ LED ใหม่ 2 หลอด, ซ่อมท่อน้ำรั่วและทดสอบระบบเรียบร้อย"
                        className={`jw-in min-h-20 py-2.5 ${!resolution.trim() ? 'border-warn-border' : ''}`}
                      />
                      {!resolution.trim() && (
                        <p className="mt-1 text-[12px] text-danger-fg font-medium">
                          * จำเป็นต้องระบุข้อมูลในบันทึกผลการซ่อม
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="jw-lbl mb-0">
                          แนบรูปหลังซ่อม <span className="text-danger-fg font-bold">*</span>
                          <span className="text-[12px] font-normal text-ink-soft ml-1">
                            (ไม่เกิน 3 รูป)
                          </span>
                        </label>
                        <span className="text-[12px] text-ink-soft">
                          {afterPhotos.length === 0 ? (
                            <span className="text-danger-fg font-semibold">บังคับแนบรูป</span>
                          ) : (
                            `แนบแล้ว ${afterPhotos.length}/3 รูป`
                          )}
                        </span>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleSelectPhotos}
                        className="hidden"
                      />

                      <div className="flex flex-wrap gap-2.5">
                        {afterPhotos.map((src, idx) => (
                          <div
                            key={idx}
                            className="w-20 h-20 rounded-control border border-line bg-brand-mint overflow-hidden relative shadow-xs"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt={`รูปหลังซ่อม ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              aria-label={`ลบรูปหลังซ่อมที่ ${idx + 1}`}
                              onClick={() => removePhoto(idx)}
                              className="w-7 h-7 rounded-full bg-ink text-white absolute top-1 right-1 flex items-center justify-center shadow-xs hover:bg-danger-solid transition cursor-pointer"
                            >
                              <Icon name="x" className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {afterPhotos.length < 3 && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={`w-20 h-20 rounded-control border-[1.5px] border-dashed text-[12px] font-medium flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                              afterPhotos.length === 0
                                ? 'border-danger-border bg-danger-bg/50 text-danger-fg hover:bg-danger-bg'
                                : 'border-line-input bg-surface text-ink-soft hover:border-brand hover:text-brand'
                            }`}
                          >
                            <Icon name="photo" className="w-5 h-5" />
                            <span>+ เพิ่มรูป</span>
                          </button>
                        )}
                      </div>

                      {afterPhotos.length === 0 ? (
                        <p className="mt-1 text-[12px] text-danger-fg font-medium">
                          * จำเป็นต้องแนบรูปหลังซ่อมอย่างน้อย 1 รูป
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* แถวล่าง: Checkbox ซ้าย | ปุ่มดำเนินการ ขวา (มือถือ: Checkbox อยู่บน ปุ่มเรียงเต็มกว้างโดยปุ่มหลักอยู่บนสุด) */}
                {(current.status === 'repair_submitted' ||
                  current.status === 'repair_in_progress') && (
                  <div className="pt-4 border-t border-white/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="staff-repair-confirm"
                        className="min-h-[44px] inline-flex items-center gap-2.5 text-[13.5px] font-medium text-white cursor-pointer select-none"
                      >
                        <input
                          id="staff-repair-confirm"
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                          className="size-5 rounded accent-brand cursor-pointer shrink-0"
                        />
                        <span>ข้าพเจ้าได้ตรวจสอบรายละเอียดและข้อมูลถูกต้อง</span>
                      </label>
                      {!confirmed && (
                        <span className="inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-warn-bg text-warn-fg border border-warn-border">
                          ติ๊กยืนยันก่อน จึงจะรับเรื่องได้
                        </span>
                      )}
                    </div>

                    {current.status === 'repair_submitted' ? (
                      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
                        {/* ปุ่มรอง: ส่งกลับ / ไม่รับเรื่อง (destructive outline ตาม token เดิม) */}
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleStartAction('reject')}
                          className="min-h-[44px] px-4 py-2 rounded-control border border-danger-border bg-danger-bg text-danger-fg font-semibold text-[14px] hover:opacity-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ส่งกลับ / ไม่รับเรื่อง
                        </button>

                        {/* ปุ่มหลักบนพื้นเขียวเข้ม: พื้นขาวตัวอักษรเขียวเข้ม */}
                        <button
                          type="button"
                          disabled={submitting || !confirmed}
                          onClick={() => handleStartAction('accept')}
                          className="min-h-[44px] px-5 py-2 rounded-control bg-white text-brand-deep font-bold text-[14px] shadow-xs hover:bg-brand-tint transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? 'กำลังบันทึก...' : 'รับเรื่องซ่อม (เริ่มดำเนินการ)'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
                        <button
                          type="button"
                          disabled={
                            submitting || !confirmed || !resolution.trim() || afterPhotos.length === 0
                          }
                          onClick={() => handleStartAction('finish')}
                          className="min-h-[44px] px-5 py-2 rounded-control bg-white text-brand-deep font-bold text-[14px] shadow-xs hover:bg-brand-tint transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? 'กำลังบันทึก...' : 'บันทึกซ่อมเสร็จ (ส่งตรวจรับ)'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* 3) การ์ดรายละเอียด (พื้นขาว, border + มุมโค้งเหมือนการ์ดอื่นในระบบ) */}
              <section className="jw-card p-4 sm:p-6 flex flex-col gap-5 min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-[192px_minmax(0,1fr)] gap-5 sm:gap-6 items-start">
                  {/* ซ้าย: รูปภาพประกอบ ขนาด 192x192 */}
                  <div className="flex flex-col gap-2.5">
                    {attachments.length > 0 ? (
                      <>
                        <a
                          href={attachments[0]}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="เปิดรูปภาพประกอบการแจ้งซ่อมขนาดเต็ม"
                          className="block w-[192px] h-[192px] rounded-control border border-line overflow-hidden bg-surface-muted hover:opacity-90 transition"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={attachments[0]}
                            alt="รูปปัญหาที่ 1"
                            className="w-full h-full object-cover"
                          />
                        </a>

                        {attachments.length > 1 && (
                          <div className="flex flex-wrap gap-2">
                            {attachments.slice(1).map((url, idx) => (
                              <a
                                key={idx + 1}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`เปิดรูปปัญหาที่ ${idx + 2} ขนาดเต็ม`}
                                className="block w-14 h-14 rounded-lg border border-line overflow-hidden bg-surface-muted hover:opacity-90 transition"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={`รูปปัญหาที่ ${idx + 2}`}
                                  className="w-full h-full object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        <span className="text-[12.5px] font-medium text-ink-soft">
                          รูปภาพประกอบการแจ้งซ่อม ({attachments.length} รูป)
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-[192px] h-[192px] rounded-control border border-dashed border-line bg-surface-muted flex flex-col items-center justify-center gap-1.5 text-ink-mute">
                          <Icon name="photo" className="w-7 h-7" />
                          <span className="text-[12px] text-ink-soft">ไม่มีรูปภาพแนบ</span>
                        </div>
                        <span className="text-[12.5px] font-medium text-ink-soft">
                          รูปภาพประกอบการแจ้งซ่อม (0 รูป)
                        </span>
                      </>
                    )}
                  </div>

                  {/* ขวา: ปัญหา/อาการ + รายละเอียด + ตารางข้อมูลคั่นเส้นบาง */}
                  <div className="flex flex-col gap-3 min-w-0">
                    <div className="flex flex-col gap-1">
                      <span className="text-[12.5px] font-semibold text-ink-soft">
                        ปัญหา/อาการ
                      </span>
                      <h3 className="text-[20px] sm:text-[22px] font-bold text-ink leading-snug break-words">
                        {problemHeading}
                      </h3>
                      {problemSubDetail && (
                        <p className="text-[14px] text-ink-soft whitespace-pre-wrap leading-relaxed mt-1">
                          {problemSubDetail}
                        </p>
                      )}
                    </div>

                    <dl className="divide-y divide-line-soft border-t border-line mt-1 text-[14px]">
                      <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                        <dt className="font-semibold text-ink-soft">ผู้แจ้งซ่อม</dt>
                        <dd className="text-ink break-words">
                          {current.requesterName}
                          {current.organization ? ` · ${current.organization}` : ''}
                        </dd>
                      </div>

                      <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                        <dt className="font-semibold text-ink-soft">โทรศัพท์</dt>
                        <dd className="text-ink">
                          {current.requesterPhone ? (
                            <a
                              href={`tel:${current.requesterPhone}`}
                              className="inline-flex items-center min-h-[44px] -my-2 text-brand font-semibold hover:underline"
                            >
                              {current.requesterPhone}
                            </a>
                          ) : (
                            '-'
                          )}
                        </dd>
                      </div>

                      <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                        <dt className="font-semibold text-ink-soft">สถานที่/อาคาร</dt>
                        <dd className="text-ink break-words">{locationFull || '-'}</dd>
                      </div>

                      <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                        <dt className="font-semibold text-ink-soft">วันที่แจ้ง</dt>
                        <dd className="text-ink">{formatThaiDateTime(current.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* แสดงบันทึกผลการซ่อมและรูปหลังซ่อม (กรณีดำเนินการซ่อมเสร็จแล้ว) */}
                {(current.resolution ||
                  (current.afterPhotos && current.afterPhotos.length > 0)) &&
                  current.status !== 'repair_in_progress' && (
                    <div className="pt-4 border-t border-line flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-[15px] text-ink">บันทึกผลการซ่อมบำรุง</b>
                        <span className="text-[12.5px] text-ink-soft">
                          {current.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-control bg-surface-muted border border-line text-[13.5px] flex flex-col gap-3">
                        <div>
                          <span className="text-[12px] font-semibold text-ink-soft block mb-0.5">
                            รายละเอียดผลการซ่อม
                          </span>
                          <span className="text-ink font-medium whitespace-pre-wrap">
                            {current.resolution || '-'}
                          </span>
                        </div>
                        {current.afterPhotos && current.afterPhotos.length > 0 && (
                          <div>
                            <span className="text-[12px] font-semibold text-ink-soft block mb-1.5">
                              รูปภาพหลังซ่อม ({current.afterPhotos.length} รูป)
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {current.afterPhotos.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`เปิดรูปหลังซ่อมที่ ${i + 1} ขนาดเต็ม`}
                                  className="block w-20 h-20 rounded-control border border-line overflow-hidden hover:opacity-90 transition shadow-xs"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`รูปหลังซ่อมที่ ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
              </section>
            </div>
          );
        })()
      )}

      {/* Modal ยืนยัน PIN สำหรับเจ้าหน้าที่ */}
      {showPinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setShowPinModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-card bg-surface border border-line p-6 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <b className="text-[18px] text-ink block">ยืนยัน PIN 6 หลัก</b>
              <span className="text-[13px] text-ink-soft">
                กรอกรหัส PIN ของ {account?.name || 'เจ้าหน้าที่'} เพื่อยืนยันการ
                {pendingAction === 'accept'
                  ? 'รับเรื่องซ่อม'
                  : pendingAction === 'finish'
                    ? 'บันทึกซ่อมเสร็จ'
                    : 'ปฏิเสธ/ส่งกลับ'}
              </span>
            </div>
            <PinKeypad
              pin={pin}
              onChange={setPin}
              subtitle={`กรอกรหัส PIN 6 หลักของ ${account?.name || 'เจ้าหน้าที่'} เพื่อยืนยัน`}
              onComplete={(enteredPin) => handleExecuteAction(pendingAction, enteredPin)}
            />
            {pinError && (
              <div className="mt-2 text-center text-[13px] text-danger-fg font-medium">
                {pinError}
              </div>
            )}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="min-h-[44px] px-4 text-[13px] text-ink-soft font-semibold hover:underline cursor-pointer"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
