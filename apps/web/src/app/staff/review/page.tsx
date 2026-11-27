'use client';

/**
 * =====================================================================
 * หน้าตรวจสอบคำขอใช้สถานที่และอุปกรณ์สำหรับเจ้าหน้าที่ (Staff Review Page)
 * =====================================================================
 * เจ้าหน้าที่ธุรการ/ผู้รับผิดชอบทำการตรวจสอบคำขอ (ฝ่ายที่ 2 จาก 4 ฝ่าย):
 * 1. ตรวจสอบความถูกต้องของข้อมูล ผู้ขอ วัตถุประสงค์ และวัน-เวลา
 * 2. ดูแบบฟอร์มเอกสารราชการฉบับเต็ม (OfficialGovFormDocument)
 * 3. ลงนามเห็นชอบเพื่อส่งต่อให้ปลัด อบต. (ฝ่ายที่ 3) หรือลงนามไม่ผ่านพร้อมระบุเหตุผล
 * 4. ยืนยันความปลอดภัยด้วย Email OTP และรหัส PIN 6 หลัก
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, FileText, PenLine } from 'lucide-react';
import {
  BookingRequest,
  BorrowRequest,
  RequestWithTimeline,
  SIGN_LEVEL_TITLE,
  canSignRequest,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  AttachmentViewer,
  Chip,
  OfficialGovFormDocument,
  PinKeypad,
  RequestTypeChip,
  SignatureBox,
  SigningProgressSpotlight,
  SigningStepStatus,
  SignOtpVerifier,
  StatusChip,
} from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate } from '@/lib/api';
import { triggerDocumentPrint } from '@/lib/print';

// ชนิดคำขอที่เจ้าหน้าที่ต้องตรวจ (คำขอจองสถานที่ หรือ ขอยืมอุปกรณ์)
type ReviewRequest = (BookingRequest | BorrowRequest) & RequestWithTimeline;

function formatSignedAt(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatThaiDate(iso, true)} เวลา ${hh}:${mm} น.`;
}

export default function StaffReviewPage() {
  // ดึงข้อมูลบัญชีเจ้าหน้าที่ปัจจุบัน
  const { account } = useAuth();

  // State รายการคำขอในคิวตรวจของเจ้าหน้าที่
  const [queue, setQueue] = useState<ReviewRequest[]>([]);
  // State id ของคำขอที่กำลังเปิดดู/ตรวจ
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // State กำลังโหลดข้อมูล
  const [loading, setLoading] = useState(true);
  // State ควบคุมการแสดงผลฟอร์มราชการเต็มใบ
  const [showOfficialForm, setShowOfficialForm] = useState(true);
  // State บันทึกความเห็น/เหตุผล (กรณีไม่ผ่านหรือเสนอแนะ)
  const [note, setNote] = useState('');
  // State เปิด/ปิดถาดกรอกเหตุผลกรณีไม่ผ่าน
  const [rejectDrawerOpen, setRejectDrawerOpen] = useState(false);
  // State ข้อมูลลายเซ็นเจ้าหน้าที่ (Base64)
  const [staffSignature, setStaffSignature] = useState('');
  // State ติ๊กถูกรับรองการตรวจสอบ
  const [confirmed, setConfirmed] = useState(true);
  // State แสดงหน้าต่างยืนยัน OTP
  const [otpStep, setOtpStep] = useState(false);
  // State สถานะความปลอดภัยของเซสชัน
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  // State ผลการตัดสินใจ: 'approve' (เห็นชอบส่งต่อ) หรือ 'reject' (ไม่เห็นชอบ)
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject'>('approve');
  // State ควบคุมการเปิด Modal แป้นพิมพ์ PIN 6 หลัก
  const [showPinModal, setShowPinModal] = useState(false);
  // State ค่ารหัส PIN
  const [pin, setPin] = useState('');
  // State ข้อผิดพลาดรหัส PIN
  const [pinError, setPinError] = useState('');
  // State ข้อความแจ้งเตือนข้อผิดพลาดทั่วไป
  const [errorMsg, setErrorMsg] = useState('');
  // State คำขอล่าสุดที่ดำเนินการเสร็จแล้ว (สำหรับแสดงแบนเนอร์แจ้งเตือน)
  const [lastCompleted, setLastCompleted] = useState<RequestWithTimeline | null>(null);
  // State กำลังบันทึกข้อมูลการลงนาม
  const [submitting, setSubmitting] = useState(false);

  // ฟังก์ชันโหลดรายการคิวงานตรวจสอบของเจ้าหน้าที่
  const load = useCallback((preferId?: string | null) => {
    setLoading(true);
    api
      .listRequests({ queue: 'staff' })
      .then(async (list) => {
        // กรองเฉพาะคำขอขอใช้สถานที่และอุปกรณ์ (แยกงานซ่อมออกไปที่ /staff/repairs)
        let combined = list.filter((r): r is ReviewRequest => r.type === 'booking' || r.type === 'borrow');
        // หากส่ง preferId มาแต่ไม่อยู่ในคิว ให้โหลดคำขอนั้นแยกมาเติม
        if (preferId && !combined.some((r) => r.id === preferId || r.code === preferId)) {
          try {
            const single = await api.getRequest(preferId);
            if (single && (single.type === 'booking' || single.type === 'borrow')) {
              combined = [single as ReviewRequest, ...combined];
            }
          } catch {
            // ละเว้นกรณีไม่พบข้อมูล
          }
        }
        setQueue(combined);
        // หากระบุ id มาใน URL ให้เลือกรายการนั้นทันที
        if (preferId) {
          const found = combined.find((r) => r.id === preferId || r.code === preferId);
          setSelectedId(found ? found.id : null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ดึงพารามิเตอร์ ?id= จาก URL เมื่อเปิดหน้า
  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    load(sp?.get('id'));
  }, [load]);

  // ตรวจสอบสถานะ Signing Session (OTP)
  useEffect(() => {
    api
      .getSignSessionStatus()
      .then((res) => setIsSessionVerified(res.isVerified))
      .catch(() => {});
  }, []);

  // คำขอปัจจุบันที่กำลังเลือกดู
  const current = selectedId ? queue.find((r) => r.id === selectedId || r.code === selectedId) ?? null : null;

  // โหลดลายเซ็นของเจ้าหน้าที่ที่บันทึกไว้ในระบบ
  useEffect(() => {
    setStaffSignature(account?.signature || '');
    setOtpStep(false);
    setRejectDrawerOpen(false);
    setErrorMsg('');
  }, [account?.id, account?.signature, current?.id]);

  // ฟังก์ชันกดย้อนกลับไปหน้ารายการคิวงาน
  const handleBackToList = () => {
    setOtpStep(false);
    setRejectDrawerOpen(false);
    setErrorMsg('');
    setSelectedId(null);
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  // ฟังก์ชันเลือกคำขอเพื่อเริ่มการตรวจสอบ
  const handleSelectRequest = (reqId: string) => {
    setLastCompleted(null);
    setErrorMsg('');
    setSelectedId(reqId);
  };

  // ฟังก์ชันส่งคำวินิจฉัยตรวจสอบพร้อมรหัส PIN 6 หลัก
  const handleDecision = async (decision: 'approve' | 'reject', enteredPin?: string) => {
    if (!current || !staffSignature.trim()) return;
    setErrorMsg('');
    setPinError('');
    setSubmitting(true);
    try {
      const updated = await api.signRequest(current.id, {
        decision,
        note: note || undefined,
        signature: staffSignature,
        pin: enteredPin,
      });
      setNote('');
      setOtpStep(false);
      setShowPinModal(false);
      setLastCompleted(updated);
      setSelectedId(null);
      if (typeof window !== 'undefined' && window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงนาม';
      if (msg.includes('PIN')) {
        setPinError(msg);
        setPin('');
      } else if (msg.includes('OTP') || msg.includes('เซสชัน')) {
        setIsSessionVerified(false);
        setShowPinModal(false);
        setOtpStep(true);
        setErrorMsg(msg);
      } else {
        setErrorMsg(msg);
        setPinError(msg);
        setPin('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // เริ่มต้นขั้นตอนการลงนามเห็นชอบ/ไม่เห็นชอบ
  const handleStartDecision = (decision: 'approve' | 'reject') => {
    setPendingDecision(decision);
    setErrorMsg('');
    setPinError('');
    if (!isSessionVerified) {
      setOtpStep(true);
    } else {
      setPin('');
      setShowPinModal(true);
    }
  };

  const isDetailView = Boolean(current && !otpStep);

  return (
    <AppShell
      title={isDetailView ? undefined : otpStep ? 'ยืนยัน OTP ก่อนลงนาม' : 'ตรวจคำขอ (สถานที่/อุปกรณ์)'}
      backHref={isDetailView ? undefined : '/staff'}
      onBack={otpStep ? () => setOtpStep(false) : undefined}
      rightLabel={isDetailView ? undefined : account?.nickname || 'สุดา'}
      maxWidth={current ? 'max-w-[1280px]' : 'max-w-none'}
    >
      {/* แบนเนอร์แจ้งผลการดำเนินการล่าสุด */}
      {lastCompleted && (
        <div className="mb-4 jw-card p-4 bg-brand-mint border border-brand flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <b className="text-[14px] text-ink block">
              ดำเนินการ {lastCompleted.code} เรียบร้อยแล้ว (
              {lastCompleted.status === 'pending_l2'
                ? 'ส่งต่อปลัด อบต. ระดับ 2'
                : lastCompleted.status === 'rejected'
                  ? 'ลงนามไม่ผ่าน'
                  : 'อัปเดตสถานะแล้ว'}
              )
            </b>
            <span className="text-[12px] text-ink-soft">
              {lastCompleted.status === 'pending_l2'
                ? 'ลงนามระดับที่ 1 (เจ้าหน้าที่) สำเร็จ เอกสารถูกส่งต่อไปยังคิวของปลัด อบต. (ระดับ 2) แล้ว'
                : 'บันทึกผลการพิจารณาคำขอเรียบร้อยแล้ว'}
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

      {/* Alert ข้อความแจ้งเตือนข้อผิดพลาด (ถ้ามี) */}
      {errorMsg && !otpStep && (
        <div className="mb-4 jw-card bg-danger-bg border border-danger-border p-4 flex items-center justify-between gap-3 text-danger-fg text-[13px]">
          <div className="flex items-center gap-2.5">
            <Icon name="alert-triangle" className="w-5 h-5 text-danger-fg shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="min-h-[44px] px-2 text-danger-fg hover:underline text-caption font-semibold"
          >
            ปิด
          </button>
        </div>
      )}

      {/* เมื่ออยู่ในขั้นตอนยืนยัน Email OTP */}
      {otpStep && current ? (
        <div className="flex flex-col gap-4 max-w-xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOtpStep(false)}
              className="min-h-[44px] inline-flex items-center text-[13px] font-semibold text-brand hover:underline"
            >
              ← ย้อนกลับไปแก้ไขลายเซ็น
            </button>
            <span className="text-[12px] text-ink-soft">
              ลงนามฝ่ายที่ 2 จาก 4 · เจ้าหน้าที่ตรวจสอบ (ระดับ 1) · เอกสาร {current.code}
            </span>
          </div>

          {/* คอมโพเนนต์ยืนยัน OTP */}
          <SignOtpVerifier
            initialEmail={account?.email}
            onVerified={() => {
              setIsSessionVerified(true);
              setOtpStep(false);
              setPin('');
              setPinError('');
              setShowPinModal(true);
            }}
          />

          {errorMsg && (
            <div className="rounded-control bg-danger-bg border border-danger-border px-3.5 py-2.5 text-[13px] text-danger-fg">
              {errorMsg}
            </div>
          )}
        </div>
      ) : !current ? (
        /* ===================== หน้ารายการคำขอรอตรวจ (List View) ===================== */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <b className="text-[17px] sm:text-[19px] text-ink">รายการคำขอรอตรวจสอบ</b>
              <Chip tone="amber">รอตรวจ {queue.length} รายการ</Chip>
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
              กำลังโหลดรายการคำขอ...
            </div>
          ) : queue.length === 0 ? (
            <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
              </div>
              <b className="text-[17px] text-ink">ไม่มีคำขอรอตรวจในขณะนี้</b>
              <p className="text-[13px] text-ink-mute max-w-md">
                คำขอขอใช้สถานที่และยืมอุปกรณ์ราชการที่รอการตรวจสอบระดับเจ้าหน้าที่จะปรากฏที่นี่
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {queue.map((r) => {
                const dateInfo =
                  r.type === 'booking'
                    ? r.periods.map((p) => formatPeriodRange(p)).join(', ')
                    : `${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(r.returnDate, true)}`;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRequest(r.id)}
                    className="jw-card p-4 sm:p-5 w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                  >
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-[16px] text-ink">{r.code}</b>
                        <RequestTypeChip type={r.type} />
                        <StatusChip status={r.status} />
                      </div>
                      <span className="text-[14px] font-semibold text-ink truncate">
                        {r.title} {r.subtitle ? `(${r.subtitle})` : ''}
                      </span>
                      <span className="text-[12.5px] text-ink-soft">
                        ผู้ขอ: {r.requesterName} · {r.organization} · วัน-เวลา: {dateInfo}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand shrink-0">
                      <span>ตรวจคำขอ</span>
                      <Icon name="chevron-right" className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ===================== หน้ารายละเอียดคำขอสำหรับเจ้าหน้าที่ (Detail View) ===================== */
        (() => {
          const sigStaff = current.signatures.find((s) => s.level === 'staff');
          const sigL2 = current.signatures.find((s) => s.level === 'l2');
          const sigL1 = current.signatures.find((s) => s.level === 'l1');
          const isFullyApproved =
            current.status === 'approved' ||
            current.status === 'borrowing' ||
            current.status === 'returned';
          const signCheck = canSignRequest(account, current);

          const resolveStepStatus = (
            sig: typeof sigStaff,
            targetPendingStatus: 'pending_staff' | 'pending_l2' | 'pending_l1',
          ): SigningStepStatus => {
            if (sig) return sig.decision === 'approve' ? 'signed' : 'rejected';
            if (current.status === 'cancelled') return 'cancelled';
            if (current.status === 'rejected') return 'upcoming';
            if (current.status === targetPendingStatus) return 'current';
            return 'upcoming';
          };

          const signedCount =
            1 +
            (sigStaff?.decision === 'approve' ? 1 : 0) +
            (sigL2?.decision === 'approve' ? 1 : 0) +
            (sigL1?.decision === 'approve' ? 1 : 0);

          const waitingStageText =
            current.status === 'pending_staff'
              ? 'ขณะนี้รอเจ้าหน้าที่'
              : current.status === 'pending_l2'
                ? `ขณะนี้รอ${SIGN_LEVEL_TITLE.l2}`
                : current.status === 'pending_l1'
                  ? `ขณะนี้รอ${SIGN_LEVEL_TITLE.l1}`
                  : current.status === 'cancelled'
                    ? 'คำขอถูกยกเลิกแล้ว'
                    : current.status === 'rejected'
                      ? 'คำขอไม่ได้รับการอนุมัติ'
                      : 'ลงนามครบถ้วนแล้ว';

          return (
            <div className="flex flex-col gap-5 min-w-0">
              {/* ส่วนหัวหน้า: ปุ่มลูกศรกลับ + รหัสคำขอ + ชิปประเภท + ชิปสถานะ อยู่ในแถวเดียวกัน */}
              <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    aria-label="กลับไปหน้ารายการคำขอ"
                    className="min-w-[44px] min-h-[44px] rounded-control bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <h1 className="text-[18px] sm:text-[20px] font-bold text-ink leading-tight tracking-tight">
                    คำขอ {current.code}
                  </h1>
                  <RequestTypeChip type={current.type} />
                  <StatusChip status={current.status} />
                </div>
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="jw-btn-ter min-h-[44px] px-3 text-[13px] text-brand"
                >
                  ← กลับไปหน้ารายการคำขอ ({queue.length})
                </button>
              </div>

              {/* 1) การ์ด "ความคืบหน้าการลงนาม" ไว้บนสุด */}
              <section className="jw-card p-4 sm:p-5 flex flex-col gap-4 print:hidden">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-[16px] font-bold text-ink">ความคืบหน้าการลงนาม</h2>
                    <p className="text-[12.5px] text-ink-soft mt-0.5">
                      คลิกแต่ละลำดับด้านขวาเพื่อดูหลักฐานลายมือชื่อ หรือดูขั้นตอนที่กำลังรอดำเนินการ
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] font-medium bg-surface-muted text-ink-soft border border-line">
                    <b className="font-bold text-brand">ลงนามแล้ว {signedCount} จาก 4 ฝ่าย</b>
                    <span className="text-ink-mute">·</span>
                    <span>{waitingStageText}</span>
                  </span>
                </div>

                <SigningProgressSpotlight
                  requestKey={current.id}
                  steps={[
                    {
                      stepNumber: 1,
                      roleTitle: 'ผู้ยื่นคำขอ',
                      shortRoleTitle: 'ผู้ยื่นคำขอ',
                      status: 'signed',
                      signerName: current.requesterName,
                      signature: current.requesterSignature,
                      signedAtText: formatSignedAt(current.createdAt),
                    },
                    {
                      stepNumber: 2,
                      roleTitle: sigStaff?.title || SIGN_LEVEL_TITLE.staff,
                      shortRoleTitle: 'เจ้าหน้าที่',
                      status: resolveStepStatus(sigStaff, 'pending_staff'),
                      signerName: sigStaff?.signerName || (sigStaff ? account?.name : undefined),
                      signature: sigStaff?.signature,
                      signedAtText: formatSignedAt(sigStaff?.at),
                      hint: 'ตรวจสอบความถูกต้องของข้อมูลคำขอและคิวว่าง',
                      note: sigStaff?.note,
                    },
                    {
                      stepNumber: 3,
                      roleTitle: sigL2?.title || SIGN_LEVEL_TITLE.l2,
                      shortRoleTitle: 'ปลัด อบต.',
                      status: resolveStepStatus(sigL2, 'pending_l2'),
                      signerName: sigL2?.signerName,
                      signature: sigL2?.signature,
                      signedAtText: formatSignedAt(sigL2?.at),
                      hint: 'กลั่นกรองและเสนอความเห็นชอบตามระเบียบราชการ',
                      note: sigL2?.note,
                    },
                    {
                      stepNumber: 4,
                      roleTitle: sigL1?.title || SIGN_LEVEL_TITLE.l1,
                      shortRoleTitle: 'นายก อบต.',
                      status: resolveStepStatus(sigL1, 'pending_l1'),
                      signerName: sigL1?.signerName,
                      signature: sigL1?.signature,
                      signedAtText: formatSignedAt(sigL1?.at),
                      hint: 'พิจารณาอนุมัติคำขอขั้นสุดท้าย',
                      note: sigL1?.note,
                    },
                    {
                      stepNumber: 5,
                      roleTitle: 'ออกเอกสาร PDF และแจ้งผล',
                      shortRoleTitle: 'ออกใบอนุญาต PDF',
                      status: isFullyApproved ? 'system_ready' : 'system_pending',
                      systemNote: 'ออกโดยระบบเมื่อลงนามครบทั้ง 4 ฝ่าย',
                      actionHref: isFullyApproved ? `/approver/permit/${current.id}` : undefined,
                      actionLabel: isFullyApproved ? 'เปิดดูใบอนุญาต (PDF)' : undefined,
                    },
                  ]}
                />
              </section>

              {/* 2) เนื้อหาหลัก 2 คอลัมน์ (มือถือ: ขวาขึ้นก่อนซ้าย) */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start min-w-0">
                {/* คอลัมน์ซ้าย: เอกสารราชการ + รูปภาพ/เอกสารแนบ + ตรวจสอบและลงนาม */}
                <div className="order-2 lg:order-1 min-w-0 flex flex-col gap-5">
                  <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 print:hidden">
                      <h2 className="text-[16px] font-bold text-ink">
                        {current.type === 'booking'
                          ? 'เอกสารราชการ: แบบขอใช้สถานที่ราชการ'
                          : 'เอกสารราชการ: แบบคำขอใช้อุปกรณ์ราชการ'}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {showOfficialForm && (
                          <button
                            type="button"
                            onClick={() => triggerDocumentPrint()}
                            className="jw-btn-sec min-h-[44px] px-3.5 text-[13px]"
                          >
                            พิมพ์แบบฟอร์ม / PDF
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowOfficialForm((v) => !v)}
                          className="jw-btn-ter min-h-[44px] px-3 text-[13px] text-brand"
                        >
                          {showOfficialForm ? 'ซ่อนแบบฟอร์มราชการ' : 'แสดงแบบฟอร์มราชการเต็มใบ'}
                        </button>
                      </div>
                    </div>

                    {showOfficialForm && (
                      <div className="w-full text-[17px] leading-[1.7]">
                        <OfficialGovFormDocument req={current} />
                      </div>
                    )}
                  </section>

                  {/* รูปภาพและเอกสารแนบประกอบคำขอ */}
                  {Array.isArray(current.attachments) && current.attachments.length > 0 && (
                    <section className="jw-card p-4 sm:p-5 flex flex-col gap-2.5 print:hidden">
                      <AttachmentViewer
                        attachments={current.attachments}
                        emptyText=""
                        title="รูปภาพ / เอกสารแนบประกอบคำขอ"
                      />
                    </section>
                  )}

                  {/* การ์ดตรวจสอบและลงนามของเจ้าหน้าที่ (ต่อท้ายรูปภาพ/เอกสารแนบ) */}
                  {!signCheck.allowed ? (
                    <section className="jw-card p-4 sm:p-5 flex flex-col gap-3 print:hidden">
                      <div className="flex items-start gap-2 p-3 bg-warn-bg/60 border border-warn-border rounded-control text-warn-fg text-[13px]">
                        <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{signCheck.reason || 'คำขอนี้ไม่ได้อยู่ในสถานะที่เจ้าหน้าที่ตรวจสอบสามารถลงนามได้'}</span>
                      </div>
                      {current.status === 'pending_l2' && (
                        <Link href={`/approver/sign/${current.id}`} className="jw-btn-sec w-full">
                          ไปหน้าลงนามระดับปลัด →
                        </Link>
                      )}
                      {current.status === 'pending_l1' && (
                        <Link href={`/approver/sign/${current.id}`} className="jw-btn-sec w-full">
                          ไปหน้าลงนามระดับนายก →
                        </Link>
                      )}
                      <button type="button" onClick={handleBackToList} className="jw-btn w-full">
                        กลับ
                      </button>
                    </section>
                  ) : (
                    <section className="jw-card overflow-hidden flex flex-col print:hidden">
                      {/* แถบหัวเรื่องสีเขียวอ่อน (Top Accent Header) */}
                      <div className="px-4 sm:px-5 py-3.5 bg-brand-tint/65 border-b border-brand/20 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PenLine className="size-4 text-brand shrink-0" />
                          <b className="text-[14.5px] sm:text-[15.5px] text-ink truncate">
                            กระดานลงลายมือชื่ออิเล็กทรอนิกส์ · {account?.name || 'สุดา มีสุข'} (
                            {account?.position || 'เจ้าหน้าที่ธุรการ'})
                          </b>
                        </div>
                        <span className="text-[12px] font-semibold text-brand shrink-0">
                          ฝ่ายที่ 2 จาก 4 · ระดับ 1
                        </span>
                      </div>

                      <div className="p-4 sm:p-5 flex flex-col gap-4">
                        {/* Extra-Tall 280px Touchscreen Signature Stage */}
                        <SignatureBox
                          value={staffSignature}
                          onChange={setStaffSignature}
                          savedSignature={account?.signature}
                          signerLabel={`${account?.name || 'สุดา มีสุข'} · ${account?.position || 'เจ้าหน้าที่ธุรการ'}`}
                          height={280}
                          skipPinPrompt
                          floatingToolbar
                          hideTopLabel
                        />

                        {/* เช็คบ็อกซ์ยืนยันความรับผิดชอบ */}
                        <button
                          type="button"
                          onClick={() => setConfirmed((v) => !v)}
                          className="flex items-start gap-2.5 text-left cursor-pointer select-none"
                        >
                          <span
                            className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${
                              confirmed ? 'bg-brand border-brand text-white' : 'bg-surface border-line-input'
                            }`}
                          >
                            {confirmed && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                          </span>
                          <span className="text-[13.5px] text-ink-soft leading-relaxed">
                            ข้าพเจ้ายืนยันว่าได้ตรวจเอกสารแล้วและลงลายมือชื่อด้วยตนเอง
                          </span>
                        </button>

                        {/* ถาดกรอกเหตุผลกรณีไม่ผ่าน (แสดงเฉพาะเมื่อกดปุ่ม "ลงนามไม่ผ่าน...") */}
                        {rejectDrawerOpen && (
                          <div className="rounded-control border border-danger-border bg-danger-bg/35 p-4 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[13px] font-bold text-danger-fg">
                                ระบุเหตุผลที่ไม่ผ่าน / วันที่เสนอแทน (ส่งแจ้งผู้ขอทาง LINE)
                              </label>
                              <button
                                type="button"
                                onClick={() => setRejectDrawerOpen(false)}
                                className="text-[12px] font-medium text-ink-soft hover:text-ink cursor-pointer"
                              >
                                ยกเลิก ✕
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="พิมพ์เหตุผลหรือข้อเสนอแนะที่จะส่งให้ผู้จอง..."
                              className="jw-in h-20 py-2.5 bg-surface"
                            />
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setRejectDrawerOpen(false)}
                                className="jw-btn-sec !min-h-[38px] px-3.5 text-[12.5px]"
                              >
                                ปิดถาดนี้
                              </button>
                              <button
                                type="button"
                                disabled={submitting || !staffSignature.trim()}
                                onClick={() => handleStartDecision('reject')}
                                className="min-h-[38px] px-4 rounded-control bg-danger-solid text-white text-[12.5px] font-semibold hover:opacity-95 disabled:opacity-40 transition cursor-pointer"
                              >
                                ยืนยันลงนามไม่ผ่าน
                              </button>
                            </div>
                          </div>
                        )}

                        {/* แถบปุ่มกดขนาดใหญ่สัดส่วน 3 : 3 : 6 */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={handleBackToList}
                            className="sm:col-span-3 jw-btn-sec w-full text-[13.5px]"
                          >
                            ← กลับหน้ารายการ
                          </button>

                          <button
                            type="button"
                            onClick={() => setRejectDrawerOpen((v) => !v)}
                            className={`sm:col-span-3 min-h-[44px] px-4 rounded-control border text-[13.5px] font-semibold transition cursor-pointer ${
                              rejectDrawerOpen
                                ? 'border-danger-border bg-danger-bg text-danger-fg'
                                : 'border-danger-border/70 bg-surface text-danger-fg hover:bg-danger-bg/40'
                            }`}
                          >
                            ลงนามไม่ผ่าน...
                          </button>

                          <button
                            type="button"
                            disabled={submitting || !confirmed || !staffSignature.trim()}
                            onClick={() => handleStartDecision('approve')}
                            className="sm:col-span-6 jw-btn w-full text-[14px] font-bold inline-flex items-center justify-center gap-2"
                          >
                            <span>
                              {submitting
                                ? 'กำลังบันทึก...'
                                : isSessionVerified
                                  ? 'ลงนามส่งต่อปลัด (มีผลทันที)'
                                  : 'ลงนามและยืนยัน OTP'}
                            </span>
                            <ArrowRight className="size-4 shrink-0" />
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </div>

                {/* คอลัมน์ขวา (กว้างสุด 400px): สรุปคำขอ */}
                <div className="order-1 lg:order-2 min-w-0 flex flex-col gap-4 lg:sticky lg:top-6 print:hidden">
                  {/* การ์ดสรุปคำขอ */}
                  <section className="jw-card p-4 sm:p-5 flex flex-col gap-3.5">
                    <h2 className="text-[16px] font-bold text-ink">สรุปคำขอ</h2>

                    <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2.5 gap-x-3 text-[14px] items-baseline">
                      <dt className="font-semibold text-ink-soft">เลขคำขอ</dt>
                      <dd className="font-semibold text-ink break-words">{current.code}</dd>

                      <dt className="font-semibold text-ink-soft">ประเภท</dt>
                      <dd>
                        <RequestTypeChip type={current.type} />
                      </dd>

                      <dt className="font-semibold text-ink-soft">รายการ</dt>
                      <dd className="font-semibold text-ink break-words">
                        {current.title} {current.subtitle ? `(${current.subtitle})` : ''}
                      </dd>

                      <dt className="font-semibold text-ink-soft">
                        {current.type === 'booking' ? 'วัน-เวลา' : 'ช่วงขอใช้'}
                      </dt>
                      <dd className="text-ink">
                        {current.type === 'booking'
                          ? current.periods.map((p) => formatPeriodRange(p)).join(', ')
                          : `${formatThaiDate(current.pickupDate, false)}–${formatThaiDate(current.returnDate, true)}`}
                      </dd>

                      <dt className="font-semibold text-ink-soft">วัตถุประสงค์</dt>
                      <dd className="text-ink break-words">
                        {current.type === 'booking'
                          ? `${current.activity || current.purposeItems?.[0]?.forWhat || 'ขอใช้สถานที่'} · ${current.attendees} คน`
                          : current.purposeItems?.[0]?.forWhat || current.purpose || 'ขอใช้อุปกรณ์'}
                      </dd>

                      <dt className="font-semibold text-ink-soft">ผู้ยืม/ผู้ขอ</dt>
                      <dd className="text-ink break-words">{current.requesterName}</dd>

                      <dt className="font-semibold text-ink-soft">หน่วยงาน</dt>
                      <dd className="text-ink break-words">{current.organization || '-'}</dd>

                      {current.requesterPhone && (
                        <>
                          <dt className="font-semibold text-ink-soft">โทรศัพท์</dt>
                          <dd>
                            <a
                              href={`tel:${current.requesterPhone}`}
                              className="inline-flex items-center min-h-[44px] -my-2 text-brand font-semibold hover:underline"
                            >
                              {current.requesterPhone}
                            </a>
                          </dd>
                        </>
                      )}
                    </dl>

                    {current.purpose ? (
                      <div className="flex flex-col gap-1 bg-warn-bg/60 border border-warn-border rounded-control p-3 text-[13px] text-warn-fg">
                        <b className="font-semibold">ข้อความถึง จนท.</b>
                        <span className="whitespace-pre-wrap leading-relaxed">{current.purpose}</span>
                      </div>
                    ) : null}

                    <div className="flex items-start gap-2.5 pt-2 border-t border-line text-[13px]">
                      <FileText className="size-4 text-ink-soft shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-semibold text-ink break-all">คำขอ_{current.code}.pdf</span>
                        {isFullyApproved ? (
                          <Link
                            href={`/approver/permit/${current.id}`}
                            className="inline-flex items-center min-h-[44px] -my-1 underline text-brand font-semibold"
                          >
                            เปิดดูใบอนุญาต (PDF)
                          </Link>
                        ) : (
                          <span className="text-ink-soft text-[12px]">(ออกใบอนุญาตเมื่อลงนามครบทั้ง 4 ฝ่าย)</span>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Modal ยืนยันรหัส PIN 6 หลักเพื่อลงนาม */}
      {showPinModal && current && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[420px] bg-surface rounded-card border border-line p-6 flex flex-col items-center gap-4 shadow-pop">
            <div className="w-full flex items-center justify-between">
              <div>
                <b className="text-[16px] text-ink block">ยืนยันรหัส PIN 6 หลักเพื่อลงนาม</b>
                <span className="text-[12px] text-ink-soft">
                  คำขอ {current.code} · {pendingDecision === 'approve' ? 'ลงนามเห็นชอบ (ส่งต่อปลัด อบต.)' : 'ลงนามไม่เห็นชอบ/ไม่ผ่าน'}
                </span>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง PIN"
                onClick={() => setShowPinModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-soft hover:text-ink"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <PinKeypad
              pin={pin}
              onChange={setPin}
              subtitle={`กรอกรหัส PIN 6 หลักของ ${account?.name || 'เจ้าหน้าที่'} เพื่อยืนยันการลงนาม`}
              onComplete={(enteredPin) => handleDecision(pendingDecision, enteredPin)}
            />

            {pinError && (
              <div className="w-full rounded-control bg-danger-bg border border-danger-border px-3.5 py-2 text-[13px] text-danger-fg text-center">
                {pinError}
              </div>
            )}

            {submitting && (
              <div className="text-[13px] text-brand font-medium animate-pulse">
                กำลังตรวจสอบ PIN และบันทึกลายมือชื่อดิจิทัล...
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
