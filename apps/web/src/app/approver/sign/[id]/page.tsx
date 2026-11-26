'use client';

/**
 * =====================================================================
 * หน้าลงนามเอกสารคำขอสำหรับผู้มีอำนาจอนุมัติ (Approver Sign Document Page)
 * =====================================================================
 * รองรับการลงนามตามลำดับชั้นบังคับบัญชา 4 ฝ่าย:
 * 1. ผู้ยื่นคำขอ (Requester)
 * 2. เจ้าหน้าที่ธุรการ (Staff / Reviewer)
 * 3. ปลัด อบต. (Approver L2)
 * 4. นายก อบต. (Approver L1 - ผู้มีอำนาจอนุมัติสูงสุด)
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, ChevronLeft, FileText, PenLine } from 'lucide-react';
import { ROLE_LABEL, RequestWithTimeline, SIGN_LEVEL_TITLE, canSignRequest } from '@japjong/shared';
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

function formatSignedAt(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatThaiDate(iso, true)} เวลา ${hh}:${mm} น.`;
}

export default function ApproverSignDocumentPage() {
  // ดึง ID ของคำขอจาก URL parameter
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // ข้อมูลบัญชีผู้ใช้งานปัจจุบัน และฟังก์ชันออกจากระบบ
  const { account, logout } = useAuth();

  // State ข้อมูลคำขอพร้อมเส้นทางลำดับเวลา (Timeline)
  const [req, setReq] = useState<RequestWithTimeline | null>(null);
  // State ควบคุมการแสดงผลฟอร์มราชการฉบับเต็ม
  const [showOfficialForm, setShowOfficialForm] = useState(true);
  // State ข้อมูลภาพลายเซ็น (Base64 data URL)
  const [signature, setSignature] = useState('');
  // State เหตุผลประกอบกรณีไม่อนุมัติ/ไม่เห็นชอบ
  const [note, setNote] = useState('');
  // State เปิด/ปิดถาดกรอกเหตุผลกรณีไม่อนุมัติ
  const [rejectDrawerOpen, setRejectDrawerOpen] = useState(false);
  // State ติ๊กถูกรับรองว่าได้ตรวจสอบเอกสารแล้ว
  const [confirmed, setConfirmed] = useState(true);
  // State หน้าต่างยืนยัน OTP ก่อนลงนาม
  const [otpStep, setOtpStep] = useState(false);
  // State ตรวจสอบว่าเซสชันการลงนามได้รับการยืนยันความปลอดภัยแล้วหรือไม่
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  // State มติการตัดสินใจ: 'approve' (เห็นชอบ/อนุมัติ) หรือ 'reject' (ไม่เห็นชอบ/ไม่อนุมัติ)
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject'>('approve');
  // State แสดง Modal แป้นพิมพ์ PIN 6 หลัก
  const [showPinModal, setShowPinModal] = useState(false);
  // State ข้อความรหัส PIN ที่กำลังกรอก
  const [pin, setPin] = useState('');
  // State ข้อความแจ้งเตือนเมื่อ PIN ไม่ถูกต้อง
  const [pinError, setPinError] = useState('');
  // State ข้อความแจ้งเตือนหลังลงนามเสร็จสิ้นก่อนเด้งกลับหน้าหลัก
  const [successNotice, setSuccessNotice] = useState('');
  // Timer สำหรับเด้งกลับหน้าหลักอัตโนมัติ
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // State ข้อความข้อผิดพลาดทั่วไป
  const [error, setError] = useState('');
  // State กำลังบันทึกข้อมูลการลงนาม
  const [submitting, setSubmitting] = useState(false);

  // ล้าง timer หากผู้ใช้ออกจากหน้าก่อนครบเวลา
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // ดึงลายเซ็นที่เคยบันทึกไว้ในบัญชีของผู้ใช้อัตโนมัติ
  useEffect(() => {
    setSignature(account?.signature || '');
  }, [account?.id, account?.signature]);

  // โหลดข้อมูลคำขอจาก API ตาม id ที่ส่งมาใน URL
  useEffect(() => {
    if (!params.id) return;
    api
      .getRequest(params.id)
      .then(setReq)
      .catch(() => {});
  }, [params.id]);

  // ตรวจสอบสถานะ Signing Session (OTP) จากเซิร์ฟเวอร์
  useEffect(() => {
    api
      .getSignSessionStatus()
      .then((res) => {
        setIsSessionVerified(res.isVerified);
      })
      .catch(() => {});
  }, []);

  // ฟังก์ชันส่งคำตัดสินการลงนามพร้อมรหัส PIN 6 หลัก
  const submitDecisionWithPin = async (enteredPin: string) => {
    if (!req) return;
    setError('');
    setPinError('');
    setSubmitting(true);
    try {
      const updated = await api.signRequest(req.id, {
        decision: pendingDecision,
        note: note || undefined,
        signature,
        pin: enteredPin,
      });
      setReq(updated);
      setOtpStep(false);
      setShowPinModal(false);

      // แสดงการแจ้งเตือนเมื่อปลัด อบต. / นายก อบต. ลงนามเสร็จ แล้วเด้งกลับไปหน้าหลักผู้มีอำนาจ
      setSuccessNotice(
        pendingDecision === 'reject'
          ? 'ลงนามไม่เห็นชอบเรียบร้อยแล้ว'
          : 'ลงนามเห็นชอบเรียบร้อยแล้ว',
      );
      redirectTimerRef.current = setTimeout(() => {
        router.push('/approver');
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงนาม';
      if (msg.includes('PIN')) {
        setPinError(msg);
        setPin('');
      } else if (msg.includes('OTP') || msg.includes('เซสชัน')) {
        setIsSessionVerified(false);
        setShowPinModal(false);
        setOtpStep(true);
        setError(msg);
      } else {
        setError(msg);
        setShowPinModal(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // เริ่มต้นขั้นตอนลงนาม: เช็คว่าต้องยืนยัน OTP ก่อน หรือเปิด Modal ใส่ PIN ได้เลย
  const handleStartSign = (decision: 'approve' | 'reject') => {
    setPendingDecision(decision);
    setError('');
    setPinError('');
    if (!isSessionVerified) {
      setOtpStep(true);
    } else {
      setPin('');
      setShowPinModal(true);
    }
  };

  // ออกจากระบบและกลับไปหน้าล็อกอิน
  const handleLogoutToLogin = () => {
    logout();
    router.push('/login');
  };

  // กรณีข้อมูลคำขอกำลังโหลด
  if (!req) {
    return (
      <AppShell title="ลงนามเอกสาร" backHref="/approver">
        <div className="jw-card p-8 text-center text-[14px] text-ink-mute">กำลังโหลดเอกสาร...</div>
      </AppShell>
    );
  }

  // ตรวจสอบสิทธิ์ว่าผู้ใช้ปัจจุบันสามารถลงนามในขั้นตอนนี้ได้หรือไม่
  const signCheck = canSignRequest(account, req);

  // คำนวณลำดับขั้นตอนการลงนามปัจจุบัน
  const rawSignedCount = req.type !== 'repair' ? req.signatures.length : 0;
  const currentStepNum = Math.min(3, rawSignedCount + 1);
  const stepDesc =
    currentStepNum === 1
      ? `ลงนามฝ่ายที่ 2 จาก 4 · ${SIGN_LEVEL_TITLE.staff}`
      : currentStepNum === 2
        ? `ลงนามฝ่ายที่ 3 จาก 4 · ${SIGN_LEVEL_TITLE.l2}`
        : `ลงนามฝ่ายที่ 4 จาก 4 · ${SIGN_LEVEL_TITLE.l1}`;

  // ค้นหาข้อมูลลายเซ็นของแต่ละระดับ
  const sigStaff = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'staff') : undefined;
  const sigL2 = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l2') : undefined;
  const sigL1 = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l1') : undefined;

  const isFullyApproved =
    req.status === 'approved' || req.status === 'borrowing' || req.status === 'returned';

  // ตรวจสอบว่าเป็นผู้อนุมัติขั้นสุดท้าย (นายก อบต. / APPROVER_L1) หรือไม่
  const isFinalApprover = account?.role === 'APPROVER_L1';

  const resolveStepStatus = (
    sig: typeof sigStaff,
    targetPendingStatus: 'pending_staff' | 'pending_l2' | 'pending_l1',
  ): SigningStepStatus => {
    if (sig) return sig.decision === 'approve' ? 'signed' : 'rejected';
    if (req.status === 'cancelled') return 'cancelled';
    if (req.status === 'rejected') return 'upcoming';
    if (req.status === targetPendingStatus) return 'current';
    return 'upcoming';
  };

  const approvedPartyCount =
    1 +
    (sigStaff?.decision === 'approve' ? 1 : 0) +
    (sigL2?.decision === 'approve' ? 1 : 0) +
    (sigL1?.decision === 'approve' ? 1 : 0);

  const waitingStageText =
    req.status === 'pending_staff'
      ? 'ขณะนี้รอเจ้าหน้าที่'
      : req.status === 'pending_l2'
        ? `ขณะนี้รอ${SIGN_LEVEL_TITLE.l2}`
        : req.status === 'pending_l1'
          ? `ขณะนี้รอ${SIGN_LEVEL_TITLE.l1}`
          : req.status === 'cancelled'
            ? 'คำขอถูกยกเลิกแล้ว'
            : req.status === 'rejected'
              ? 'คำขอไม่ได้รับการอนุมัติ'
              : 'ลงนามครบถ้วนแล้ว';

  return (
    <AppShell
      title={otpStep ? 'ยืนยัน OTP ก่อนลงนาม' : undefined}
      onBack={otpStep ? () => setOtpStep(false) : undefined}
      rightLabel={otpStep ? account?.position || 'ปลัด อบต.' : undefined}
      maxWidth="max-w-[1280px]"
    >
      {!otpStep ? (
        <div className="flex flex-col gap-5 min-w-0">
          {/* ส่วนหัวหน้า: ปุ่มลูกศรกลับ + รหัสคำขอ + ชิปประเภท + ชิปสถานะ */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <Link
                href="/approver"
                aria-label="ย้อนกลับ"
                className="min-w-[44px] min-h-[44px] rounded-control bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition shrink-0"
              >
                <ChevronLeft className="size-5" />
              </Link>
              <h1 className="text-[18px] sm:text-[20px] font-bold text-ink leading-tight tracking-tight">
                คำขอ {req.code}
              </h1>
              <RequestTypeChip type={req.type} />
              <StatusChip status={req.status} />
            </div>
            {signCheck.allowed && <Chip tone="amber">รอคุณเขียนลายเซ็นลงนาม</Chip>}
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
              {req.type !== 'repair' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] font-medium bg-surface-muted text-ink-soft border border-line">
                  <b className="font-bold text-brand">ลงนามแล้ว {approvedPartyCount} จาก 4 ฝ่าย</b>
                  <span className="text-ink-mute">·</span>
                  <span>{waitingStageText}</span>
                </span>
              )}
            </div>

            {req.type !== 'repair' && (
              <SigningProgressSpotlight
                requestKey={req.id}
                steps={[
                  {
                    stepNumber: 1,
                    roleTitle: 'ผู้ยื่นคำขอ',
                    shortRoleTitle: 'ผู้ยื่นคำขอ',
                    status: 'signed',
                    signerName: req.requesterName,
                    signature: req.requesterSignature,
                    signedAtText: formatSignedAt(req.createdAt),
                  },
                  {
                    stepNumber: 2,
                    roleTitle: sigStaff?.title || SIGN_LEVEL_TITLE.staff,
                    shortRoleTitle: 'เจ้าหน้าที่',
                    status: resolveStepStatus(sigStaff, 'pending_staff'),
                    signerName: sigStaff?.signerName,
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
                    actionHref: isFullyApproved ? `/approver/permit/${req.id}` : undefined,
                    actionLabel: isFullyApproved ? 'เปิดดูใบอนุญาต (PDF)' : undefined,
                  },
                ]}
              />
            )}
          </section>

          {/* 2) เนื้อหาหลัก 2 คอลัมน์ (มือถือ: ขวาขึ้นก่อนซ้าย) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start min-w-0">
            {/* คอลัมน์ซ้าย: เอกสารราชการ + รูปภาพ/เอกสารแนบ */}
            <div className="order-2 lg:order-1 min-w-0 flex flex-col gap-5">
              {req.type !== 'repair' && (
                <section className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 print:hidden">
                    <h2 className="text-[16px] font-bold text-ink">
                      {req.type === 'booking'
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
                      <OfficialGovFormDocument req={req} />
                    </div>
                  )}
                </section>
              )}

              {/* รูปภาพและเอกสารแนบประกอบคำขอ */}
              {'attachments' in req && Array.isArray(req.attachments) && req.attachments.length > 0 && (
                <section className="jw-card p-4 sm:p-5 flex flex-col gap-2.5 print:hidden">
                  <AttachmentViewer
                    attachments={req.attachments}
                    emptyText=""
                    title="รูปภาพ / เอกสารแนบประกอบคำขอ"
                  />
                </section>
              )}

              {/* การ์ดการลงนามของผู้มีอำนาจ (Extra-Tall Touchscreen Stage ต่อท้ายรูปภาพ/เอกสารแนบ) */}
              {!signCheck.allowed ? (
                <section className="jw-card p-5 border-danger-border bg-danger-bg/20 flex flex-col gap-3 print:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[15px] text-danger-fg">ระดับอำนาจการลงนามไม่ตรงกับขั้นตอนปัจจุบัน</b>
                    <Chip tone="red">ต้องลงนามตามลำดับ</Chip>
                  </div>
                  <p className="text-[13.5px] text-ink leading-relaxed">{signCheck.reason}</p>
                  <div className="text-[12.5px] text-ink-soft">
                    บัญชีของคุณขณะนี้: <b>{account ? `${account.name} (${ROLE_LABEL[account.role]})` : '-'}</b>
                  </div>
                  <Link href="/approver" className="jw-btn w-full">
                    กลับ
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogoutToLogin}
                    className="jw-btn-sec w-full"
                  >
                    ออกจากระบบเพื่อเข้าสู่ระบบด้วยบัญชีผู้มีอำนาจขั้นตอนนี้
                  </button>
                </section>
              ) : (
                <section className="jw-card overflow-hidden flex flex-col print:hidden">
                  {/* แถบหัวเรื่องสีเขียวอ่อน (Top Accent Header) */}
                  <div className="px-4 sm:px-5 py-3.5 bg-brand-tint/65 border-b border-brand/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PenLine className="size-4 text-brand shrink-0" />
                      <b className="text-[14.5px] sm:text-[15.5px] text-ink truncate">
                        กระดานลงลายมือชื่ออิเล็กทรอนิกส์ · {account?.name} ({account?.position})
                      </b>
                    </div>
                    <span className="text-[12px] font-semibold text-brand shrink-0">{stepDesc}</span>
                  </div>

                  <div className="p-4 sm:p-5 flex flex-col gap-4">
                    {/* Extra-Tall 280px Touchscreen Signature Stage */}
                    <SignatureBox
                      value={signature}
                      onChange={setSignature}
                      savedSignature={account?.signature}
                      signerLabel={`${account?.name || ''} · ${account?.position || ''}`}
                      height={280}
                      skipPinPrompt
                      floatingToolbar
                      hideTopLabel
                    />

                    {/* เช็คบ็อกซ์ยืนยันความถูกต้อง */}
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
                        ข้าพเจ้ายืนยันว่าได้ตรวจเอกสารแล้วและเขียนลายมือชื่อลงนามด้วยตนเอง (ระบบจะยืนยันตัวตนด้วย OTP ทางอีเมล)
                      </span>
                    </button>

                    {error && (
                      <div className="rounded-control bg-danger-bg border border-danger-border px-3.5 py-2.5 text-[13px] text-danger-fg">
                        {error}
                      </div>
                    )}

                    {/* ถาดกรอกเหตุผลกรณีไม่อนุมัติ/ไม่เห็นชอบ */}
                    {!successNotice && rejectDrawerOpen && (
                      <div className="rounded-control border border-danger-border bg-danger-bg/35 p-4 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[13px] font-bold text-danger-fg">
                            ระบุเหตุผลที่{isFinalApprover ? 'ไม่อนุมัติ' : 'ไม่เห็นชอบ'} (แจ้งผู้ยื่นคำขอ)
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
                          placeholder="พิมพ์เหตุผลหรือข้อเสนอแนะ..."
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
                            disabled={submitting || !signature.trim()}
                            onClick={() => handleStartSign('reject')}
                            className="min-h-[38px] px-4 rounded-control bg-danger-solid text-white text-[12.5px] font-semibold hover:opacity-95 disabled:opacity-40 transition cursor-pointer"
                          >
                            ยืนยันลงนาม{isFinalApprover ? 'ไม่อนุมัติ' : 'ไม่เห็นชอบ'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!successNotice && (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                        <Link
                          href="/approver"
                          className="sm:col-span-3 jw-btn-sec w-full text-[13.5px]"
                        >
                          ← กลับหน้ารายการ
                        </Link>

                        <button
                          type="button"
                          onClick={() => setRejectDrawerOpen((v) => !v)}
                          className={`sm:col-span-3 min-h-[44px] px-4 rounded-control border text-[13.5px] font-semibold transition cursor-pointer ${
                            rejectDrawerOpen
                              ? 'border-danger-border bg-danger-bg text-danger-fg'
                              : 'border-danger-border/70 bg-surface text-danger-fg hover:bg-danger-bg/40'
                          }`}
                        >
                          ลงนาม{isFinalApprover ? 'ไม่อนุมัติ' : 'ไม่เห็นชอบ'}...
                        </button>

                        <button
                          type="button"
                          disabled={!confirmed || !signature.trim() || submitting}
                          onClick={() => handleStartSign('approve')}
                          className="sm:col-span-6 jw-btn w-full text-[14px] font-bold inline-flex items-center justify-center gap-2"
                        >
                          <span>
                            {submitting
                              ? 'กำลังบันทึก...'
                              : isSessionVerified
                                ? `ลงนาม${isFinalApprover ? 'อนุมัติ' : 'เห็นชอบ'} (มีผลทันที)`
                                : 'ลงนามและยืนยัน OTP'}
                          </span>
                          <ArrowRight className="size-4 shrink-0" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* คอลัมน์ขวา (กว้างสุด 400px): เซสชัน OTP + สรุปคำขอ */}
            <div className="order-1 lg:order-2 min-w-0 flex flex-col gap-4 lg:sticky lg:top-6 print:hidden">
              {/* แถบสถานะเซสชัน OTP ยืนยันตัวตน */}
              <SignOtpVerifier
                initialEmail={account?.email}
                onVerified={() => {
                  setIsSessionVerified(true);
                }}
              />

              {/* การ์ดสรุปคำขอ */}
              <section className="jw-card p-4 sm:p-5 flex flex-col gap-3.5">
                <h2 className="text-[16px] font-bold text-ink">สรุปคำขอ</h2>

                <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2.5 gap-x-3 text-[14px] items-baseline">
                  <dt className="font-semibold text-ink-soft">เลขคำขอ</dt>
                  <dd className="font-semibold text-ink break-words">{req.code}</dd>

                  <dt className="font-semibold text-ink-soft">ประเภท</dt>
                  <dd>
                    <RequestTypeChip type={req.type} />
                  </dd>

                  <dt className="font-semibold text-ink-soft">รายการ</dt>
                  <dd className="font-semibold text-ink break-words">
                    {req.title} {req.subtitle ? `(${req.subtitle})` : ''}
                  </dd>

                  <dt className="font-semibold text-ink-soft">
                    {req.type === 'borrow' ? 'ช่วงขอใช้' : 'วัน-เวลา'}
                  </dt>
                  <dd className="text-ink">
                    {req.type === 'booking'
                      ? req.periods.map((p) => formatPeriodRange(p)).join(', ')
                      : req.type === 'borrow'
                        ? `${formatThaiDate(req.pickupDate, false)}–${formatThaiDate(req.returnDate, true)}`
                        : '-'}
                  </dd>

                  <dt className="font-semibold text-ink-soft">ผู้ขอ</dt>
                  <dd className="text-ink break-words">{req.requesterName}</dd>

                  <dt className="font-semibold text-ink-soft">หน่วยงาน</dt>
                  <dd className="text-ink break-words">{req.organization || '-'}</dd>

                  {req.requesterPhone && (
                    <>
                      <dt className="font-semibold text-ink-soft">โทรศัพท์</dt>
                      <dd>
                        <a
                          href={`tel:${req.requesterPhone}`}
                          className="inline-flex items-center min-h-[44px] -my-2 text-brand font-semibold hover:underline"
                        >
                          {req.requesterPhone}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>

                {req.type !== 'repair' && req.purpose ? (
                  <div className="flex flex-col gap-1 bg-warn-bg/60 border border-warn-border rounded-control p-3 text-[13px] text-warn-fg">
                    <b className="font-semibold">ข้อความถึง จนท.</b>
                    <span className="whitespace-pre-wrap leading-relaxed">{req.purpose}</span>
                  </div>
                ) : null}

                <div className="flex items-start gap-2.5 pt-2 border-t border-line text-[13px]">
                  <FileText className="size-4 text-ink-soft shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-semibold text-ink break-all">คำขอ_{req.code}.pdf</span>
                    {isFullyApproved ? (
                      <Link
                        href={`/approver/permit/${req.id}`}
                        className="inline-flex items-center min-h-[44px] -my-2 underline text-brand font-semibold"
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
      ) : (
        /* สเต็ปยืนยัน OTP ก่อนเซ็น */
        <div className="flex flex-col gap-4 max-w-xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOtpStep(false)}
              className="min-h-[44px] text-[13px] text-brand font-semibold hover:underline inline-flex items-center gap-1"
            >
              ← ย้อนกลับไปแก้ไขลายเซ็น
            </button>
            <span className="text-[12px] text-ink-soft">
              {stepDesc} · เอกสาร {req.code}
            </span>
          </div>

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

          {error && (
            <div className="rounded-control bg-danger-bg border border-danger-border px-3.5 py-2.5 text-[13px] text-danger-fg">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Modal แป้นพิมพ์กรอกรหัส PIN 6 หลัก */}
      {showPinModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[420px] bg-surface rounded-card border border-line p-6 flex flex-col items-center gap-4 shadow-pop">
            <div className="w-full flex items-center justify-between">
              <div>
                <b className="text-[16px] text-ink block">ยืนยันรหัส PIN 6 หลักเพื่อลงนาม</b>
                <span className="text-[12px] text-ink-soft">
                  คำขอ {req.code} · {pendingDecision === 'approve' ? 'ลงนามเห็นชอบ/อนุมัติ' : 'ลงนามไม่เห็นชอบ/ไม่อนุมัติ'}
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
              subtitle={`กรอกรหัส PIN 6 หลักประจำตัวของ ${account?.name || 'ผู้อนุมัติ'} เพื่อยืนยันการลงนาม`}
              onComplete={submitDecisionWithPin}
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

      {/* แจ้งเตือนหลังลงนามเสร็จสิ้นก่อนเด้งกลับหน้าหลัก */}
      {successNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-[380px] rounded-card bg-surface border border-ok-border p-6 shadow-pop flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-ok-bg text-ok-fg flex items-center justify-center">
              <Icon name="check" className="w-6 h-6" strokeWidth={3} />
            </div>
            <b className="text-[17px] text-ink">{successNotice}</b>
            <span className="text-[13px] text-ink-soft">กำลังกลับไปหน้าหลัก...</span>
          </div>
        </div>
      )}
    </AppShell>
  );
}
