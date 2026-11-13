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
 *
 * ฟีเจอร์ความปลอดภัย:
 * - ตรวจสอบ Signing Session (OTP ยืนยันตัวตนผ่านอีเมล)
 * - การยืนยันด้วยรหัส PIN ดิจิทัล 6 หลัก (PinKeypad)
 * - แสดงสถานะและลายมือชื่อของแต่ละระดับชั้น (SignaturePreviewCard)
 * - แสดงเอกสารแบบฟอร์มราชการแบบเต็มใบ (OfficialGovFormDocument)
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ROLE_LABEL, RequestWithTimeline, SIGN_LEVEL_TITLE, canSignRequest } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, OfficialGovFormDocument, PinKeypad, SignatureBox, SignaturePreviewCard, SignOtpVerifier } from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

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
  const signedCount = req.type !== 'repair' ? req.signatures.length : 0;
  const currentStepNum = Math.min(3, signedCount + 1);
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

  // ตรวจสอบว่าเป็นผู้อนุมัติขั้นสุดท้าย (นายก อบต. / APPROVER_L1) หรือไม่
  const isFinalApprover = account?.role === 'APPROVER_L1';

  return (
    <AppShell
      title={otpStep ? 'ยืนยัน OTP ก่อนลงนาม' : 'ลงนามเอกสาร'}
      backHref="/approver"
      onBack={otpStep ? () => setOtpStep(false) : undefined}
      rightLabel={account?.position || 'ปลัด อบต.'}
      maxWidth="max-w-[960px]"
      footer={
        !otpStep && !successNotice && signCheck.allowed ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            {/* ปุ่มลงนามไม่อนุมัติ / ไม่เห็นชอบ */}
            <button
              type="button"
              disabled={submitting || !signature.trim()}
              onClick={() => handleStartSign('reject')}
              className="jw-btn-red flex-1 sm:w-40"
            >
              ลงนาม{isFinalApprover ? 'ไม่อนุมัติ' : 'ไม่เห็นชอบ'}
            </button>
            {/* ปุ่มลงนามอนุมัติ / เห็นชอบ */}
            <button
              type="button"
              disabled={!confirmed || !signature.trim() || submitting}
              onClick={() => handleStartSign('approve')}
              className="jw-btn flex-[1.5] sm:w-64"
            >
              {submitting
                ? 'กำลังบันทึก...'
                : isSessionVerified
                ? `ลงนาม${isFinalApprover ? 'อนุมัติ' : 'เห็นชอบ'} (มีผลทันที)`
                : `ลงนามและยืนยัน OTP`}
            </button>
          </div>
        ) : undefined
      }
    >
      {!otpStep ? (
        <div className="flex flex-col gap-4">
          {/* ส่วนหัวรหัสคำขอและป้ายสถานะ */}
          <div className="flex items-center justify-between">
            <b className="text-[16px]">{req.code}</b>
            <Chip tone="amber">รอคุณเขียนลายเซ็นลงนาม</Chip>
          </div>

          {/* แถบสถานะเซสชัน OTP ยืนยันตัวตน */}
          <SignOtpVerifier
            initialEmail={account?.email}
            onVerified={() => {
              setIsSessionVerified(true);
            }}
          />

          {/* สรุปข้อมูลคำขอเบื้องต้น */}
          <div className="jw-card p-4 flex flex-col gap-2 text-[14px]">
            <div className="flex gap-2">
              <b className="w-20 shrink-0 text-ink-mute">ผู้ขอ</b>
              <span>
                {req.requesterName} · {req.organization}
              </span>
            </div>
            <div className="flex gap-2">
              <b className="w-20 shrink-0 text-ink-mute">รายการ</b>
              <span>
                {req.title} {req.subtitle ? `(${req.subtitle})` : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <b className="w-20 shrink-0 text-ink-mute">วัน-เวลา</b>
              <span>
                {req.type === 'booking'
                  ? req.periods.map((p) => formatPeriodRange(p)).join(', ')
                  : req.type === 'borrow'
                  ? `${formatThaiDate(req.pickupDate, false)}–${formatThaiDate(req.returnDate, true)}`
                  : '-'}
              </span>
            </div>
            {req.type !== 'repair' && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowOfficialForm((v) => !v)}
                  className="text-[12.5px] font-semibold text-brand hover:underline"
                >
                  {showOfficialForm ? 'ซ่อนแบบขอใช้สถานที่ราชการ' : 'ดูแบบขอใช้สถานที่ราชการเต็มใบ'}
                </button>
              </div>
            )}
          </div>

          {/* เอกสารแบบฟอร์มราชการขนาด A4 จำลอง */}
          {req.type !== 'repair' && showOfficialForm && <OfficialGovFormDocument req={req} />}

          {/* การ์ดแสดงลายเซ็น 4 ฝ่าย */}
          <div className="jw-card p-4 flex flex-col gap-2.5">
            <b className="text-[14px] text-ink">สถานะลายมือชื่อบนเอกสารนี้</b>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
              <SignaturePreviewCard
                roleLabel="1. ผู้ยื่นคำขอ"
                signerName={req.requesterName}
                signature={req.requesterSignature}
                signedAt={formatThaiDateTime(req.createdAt)}
                status="signed"
              />
              <SignaturePreviewCard
                roleLabel="2. เจ้าหน้าที่ (ระดับ 1)"
                signerName={sigStaff?.signerName}
                signature={sigStaff?.signature}
                signedAt={sigStaff?.at ? formatThaiDateTime(sigStaff.at) : undefined}
                decision={sigStaff?.decision}
                status={sigStaff ? (sigStaff.decision === 'reject' ? 'rejected' : 'signed') : 'pending'}
              />
              <SignaturePreviewCard
                roleLabel="3. ปลัด อบต. (ระดับ 2)"
                signerName={sigL2?.signerName}
                signature={sigL2?.signature}
                signedAt={sigL2?.at ? formatThaiDateTime(sigL2.at) : undefined}
                decision={sigL2?.decision}
                status={sigL2 ? (sigL2.decision === 'reject' ? 'rejected' : 'signed') : 'pending'}
              />
              <SignaturePreviewCard
                roleLabel="4. นายก อบต. (ระดับ 3)"
                signerName={sigL1?.signerName}
                signature={sigL1?.signature}
                signedAt={sigL1?.at ? formatThaiDateTime(sigL1.at) : undefined}
                decision={sigL1?.decision}
                status={sigL1 ? (sigL1.decision === 'reject' ? 'rejected' : 'signed') : 'pending'}
              />
            </div>
          </div>

          {/* แถบสเต็ปลำดับการลงนาม */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              {[1, 2, 3].map((n) => (
                <i
                  key={n}
                  className={`flex-1 h-1.5 rounded-full block ${
                    n < currentStepNum
                      ? 'bg-brand'
                      : n === currentStepNum
                      ? 'bg-brand-hover'
                      : 'bg-line'
                  }`}
                />
              ))}
            </div>
            <span className="text-[13px] text-ink-mute">{stepDesc}</span>
          </div>

          {/* ตรวจสอบอำนาจการลงนาม หากไม่ตรงสเต็ปจะแจ้งเตือนและปิดช่องลงนาม */}
          {!signCheck.allowed ? (
            <div className="jw-card p-5 border-[#F5B7B1] bg-[#FFFDFD] flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[15px] text-status-crit">ระดับอำนาจการลงนามไม่ตรงกับขั้นตอนปัจจุบัน</b>
                <Chip tone="red">ต้องลงนามตามลำดับ</Chip>
              </div>
              <p className="text-[13.5px] text-ink leading-relaxed">{signCheck.reason}</p>
              <div className="text-[12.5px] text-ink-mute">
                บัญชีของคุณขณะนี้: <b>{account ? `${account.name} (${ROLE_LABEL[account.role]})` : '-'}</b>
              </div>
              <button
                type="button"
                onClick={handleLogoutToLogin}
                className="jw-btn w-full mt-1"
              >
                ออกจากระบบเพื่อเข้าสู่ระบบด้วยบัญชีผู้มีอำนาจขั้นตอนนี้
              </button>
            </div>
          ) : (
            /* กล่องวาดลายเซ็นดิจิทัล */
            <div className="jw-card p-4 flex flex-col gap-3">
              <label className="jw-lbl">
                เขียนลายเซ็นของคุณบนหน้าจอ ({account?.name} · {account?.position})
              </label>
              <SignatureBox
                value={signature}
                onChange={setSignature}
                savedSignature={account?.signature}
                signerLabel={`${account?.name || ''} · ${account?.position || ''}`}
                height={155}
                skipPinPrompt
              />

              {/* เช็คบ็อกซ์ยืนยันความถูกต้อง */}
              <div
                onClick={() => setConfirmed((v) => !v)}
                className="flex items-start gap-2.5 cursor-pointer select-none pt-1"
              >
                <div
                  className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${
                    confirmed ? 'bg-brand border-brand text-white' : 'bg-white border-[#7A7A7A]'
                  }`}
                >
                  {confirmed && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                </div>
                <span className="text-[13px] text-ink-mute leading-relaxed">
                  ข้าพเจ้ายืนยันว่าได้ตรวจเอกสารแล้วและเขียนลายมือชื่อลงนามด้วยตนเอง (ระบบจะยืนยันตัวตนด้วย OTP ทางอีเมล)
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#F9B4B4] px-3.5 py-2 text-[13px] text-[#7A1010]">
              {error}
            </div>
          )}
        </div>
      ) : (
        /* สเต็ปยืนยัน OTP ก่อนเซ็น */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOtpStep(false)}
              className="text-[13px] text-brand font-semibold hover:underline flex items-center gap-1"
            >
              ← ย้อนกลับไปแก้ไขลายเซ็น
            </button>
            <span className="text-[12px] text-ink-mute">
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
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#F9B4B4] px-3.5 py-2 text-[13px] text-[#7A1010]">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Modal แป้นพิมพ์กรอกรหัส PIN 6 หลัก */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[420px] bg-white rounded-hard p-6 flex flex-col items-center gap-4 shadow-md">
            <div className="w-full flex items-center justify-between">
              <div>
                <b className="text-[16px] text-ink block">ยืนยันรหัส PIN 6 หลักเพื่อลงนาม</b>
                <span className="text-[12px] text-ink-mute">
                  คำขอ {req.code} · {pendingDecision === 'approve' ? 'ลงนามเห็นชอบ/อนุมัติ' : 'ลงนามไม่เห็นชอบ/ไม่อนุมัติ'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="text-ink-mute hover:text-ink"
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
              <div className="w-full rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2 text-[13px] text-[#7a1010] text-center">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-[380px] rounded-2xl bg-surface border border-emerald-500/30 p-6 shadow-xl flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
              <Icon name="check" className="w-6 h-6" strokeWidth={3} />
            </div>
            <b className="text-[17px] text-ink">{successNotice}</b>
            <span className="text-[13px] text-ink-mute">กำลังกลับไปหน้าหลัก...</span>
          </div>
        </div>
      )}
    </AppShell>
  );
}
