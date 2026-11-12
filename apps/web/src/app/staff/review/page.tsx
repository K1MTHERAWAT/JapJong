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
import { BookingRequest, BorrowRequest, RequestWithTimeline, canSignRequest } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  Chip,
  OfficialGovFormDocument,
  PinKeypad,
  SignatureBox,
  SignaturePreviewCard,
  SignOtpVerifier,
  StatusChip,
} from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

// ชนิดคำขอที่เจ้าหน้าที่ต้องตรวจ (คำขอจองสถานที่ หรือ ขอยืมอุปกรณ์)
type ReviewRequest = (BookingRequest | BorrowRequest) & RequestWithTimeline;

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
    setErrorMsg('');
  }, [account?.id, account?.signature, current?.id]);

  // ฟังก์ชันกดย้อนกลับไปหน้ารายการคิวงาน
  const handleBackToList = () => {
    setOtpStep(false);
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

  return (
    <AppShell
      title={otpStep ? 'ยืนยัน OTP ก่อนลงนาม' : 'ตรวจคำขอ (สถานที่/อุปกรณ์)'}
      backHref="/staff"
      onBack={otpStep ? () => setOtpStep(false) : current ? handleBackToList : undefined}
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth={current ? 'max-w-[1440px]' : 'max-w-[1100px]'}
      footer={
        current && !otpStep ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            {(() => {
              // ตรวจสอบสิทธิ์การลงนามในคำขอนี้
              const signCheck = canSignRequest(account, current);
              if (!signCheck.allowed) {
                return (
                  <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[13px]">
                    <div className="flex items-center gap-2">
                      <Icon name="info" className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>{signCheck.reason || 'คำขอนี้ไม่ได้อยู่ในสถานะที่เจ้าหน้าที่ตรวจสอบสามารถลงนามได้'}</span>
                    </div>
                    {current.status === 'pending_l2' && (
                      <Link href={`/approver/sign/${current.id}`} className="text-brand font-semibold underline shrink-0">
                        ไปหน้าลงนามระดับปลัด →
                      </Link>
                    )}
                    {current.status === 'pending_l1' && (
                      <Link href={`/approver/sign/${current.id}`} className="text-brand font-semibold underline shrink-0">
                        ไปหน้าลงนามระดับนายก →
                      </Link>
                    )}
                  </div>
                );
              }
              return (
                <>
                  {/* ปุ่มลงนามไม่ผ่าน */}
                  <button
                    type="button"
                    disabled={submitting || !staffSignature.trim()}
                    onClick={() => handleStartDecision('reject')}
                    className="jw-btn-red flex-1 sm:w-44"
                  >
                    ลงนามไม่ผ่าน
                  </button>
                  {/* ปุ่มลงนามเห็นชอบและส่งต่อปลัด */}
                  <button
                    type="button"
                    disabled={submitting || !confirmed || !staffSignature.trim()}
                    onClick={() => handleStartDecision('approve')}
                    className="jw-btn flex-[1.5] sm:w-64"
                  >
                    {submitting
                      ? 'กำลังบันทึก...'
                      : isSessionVerified
                        ? 'ลงนามส่งต่อปลัด (มีผลทันที)'
                        : 'ลงนามและยืนยัน OTP'}
                  </button>
                </>
              );
            })()}
          </div>
        ) : undefined
      }
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
            <span className="text-[12px] text-ink-mute">
              {lastCompleted.status === 'pending_l2'
                ? 'ลงนามระดับที่ 1 (เจ้าหน้าที่) สำเร็จ เอกสารถูกส่งต่อไปยังคิวของปลัด อบต. (ระดับ 2) แล้ว'
                : 'บันทึกผลการพิจารณาคำขอเรียบร้อยแล้ว'}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLastCompleted(null)}
              className="jw-btn-sec jw-btn-sm"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {/* Alert ข้อความแจ้งเตือนข้อผิดพลาด (ถ้ามี) */}
      {errorMsg && !otpStep && (
        <div className="mb-4 jw-card bg-red-50 border border-red-200 p-4 flex items-center justify-between gap-3 text-red-700 text-[13px] rounded-2xl animate-fade-in">
          <div className="flex items-center gap-2.5">
            <Icon name="alert-triangle" className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-500 hover:text-red-800 text-caption font-semibold"
          >
            ปิด
          </button>
        </div>
      )}

      {/* เมื่ออยู่ในขั้นตอนยืนยัน Email OTP */}
      {otpStep && current ? (
        <div className="flex flex-col gap-4 max-w-xl mx-auto">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOtpStep(false)}
              className="text-[13px] font-semibold text-brand hover:underline"
            >
              ← ย้อนกลับไปแก้ไขลายเซ็น
            </button>
            <span className="text-[12px] text-ink-mute">
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
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#F9B4B4] px-3.5 py-2 text-[13px] text-[#7A1010]">
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
              className="text-[13px] font-semibold text-ink inline-flex items-center gap-1 hover:underline"
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
                  <div
                    key={r.id}
                    onClick={() => handleSelectRequest(r.id)}
                    className="jw-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                  >
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-[16px] text-ink">{r.code}</b>
                        <Chip tone={r.type === 'booking' ? 'blue' : 'teal'}>
                          {r.type === 'booking' ? 'ขอใช้สถานที่' : 'ยืมอุปกรณ์'}
                        </Chip>
                        <StatusChip status={r.status} />
                      </div>
                      <span className="text-[14px] font-semibold text-ink truncate">
                        {r.title} {r.subtitle ? `(${r.subtitle})` : ''}
                      </span>
                      <span className="text-[12.5px] text-ink-mute">
                        ผู้ขอ: {r.requesterName} · {r.organization} · วัน-เวลา: {dateInfo}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand shrink-0">
                      <span>ตรวจคำขอ</span>
                      <Icon name="chevron-right" className="w-4 h-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ===================== หน้ารายละเอียดคำขอ (Detail View) ===================== */
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBackToList}
              className="text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1"
            >
              ← กลับไปหน้ารายการคำขอ ({queue.length})
            </button>
          </div>

          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold text-ink">{current.code}</h1>
            <StatusChip status={current.status} />
          </div>

          {/* รายละเอียดข้อมูลคำขอ */}
          <div className="jw-card p-4 sm:p-5 flex flex-col gap-3 text-[14px]">
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">ผู้ยืม/ผู้ขอ</b>
              <span>
                {current.requesterName} · {current.organization}
                {current.requesterPhone ? ` · โทร. ${current.requesterPhone}` : ''}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">วัตถุประสงค์</b>
              <span>
                {current.type === 'booking'
                  ? `${current.activity || current.purposeItems?.[0]?.forWhat || 'ขอใช้สถานที่'} · ${current.attendees} คน`
                  : current.purposeItems?.[0]?.forWhat || current.purpose || 'ขอใช้อุปกรณ์'}
              </span>
            </div>
            {current.type === 'borrow' && current.purpose ? (
              <div className="flex items-start gap-2 bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 text-[13.5px] text-amber-950">
                <b className="w-24 shrink-0 font-semibold text-amber-900">ข้อความถึง จนท.</b>
                <span className="whitespace-pre-wrap">{current.purpose}</span>
              </div>
            ) : null}
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">รายการ</b>
              <span>
                {current.title} {current.subtitle ? `(${current.subtitle})` : ''}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">วัน-เวลา</b>
              <span>
                {current.type === 'booking'
                  ? current.periods.map((p) => formatPeriodRange(p)).join(', ')
                  : `${formatThaiDate(current.pickupDate, false)}–${formatThaiDate(current.returnDate, true)}`}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">ไฟล์และเอกสาร</b>
              <span className="flex flex-wrap items-center gap-2">
                <span>แบบขอใช้สถานที่ราชการ.pdf</span>
                <button
                  type="button"
                  onClick={() => setShowOfficialForm((v) => !v)}
                  className="text-brand font-semibold underline text-[13px]"
                >
                  {showOfficialForm ? 'ซ่อนแบบฟอร์มราชการ' : 'ดูแบบขอใช้สถานที่ราชการ'}
                </button>
                <Link
                  href={`/requests/${current.id}`}
                  className="text-brand font-semibold underline text-[13px]"
                >
                  เปิดดูรายละเอียด / เอกสาร PDF ใบอนุญาต
                </Link>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] gap-4 sm:gap-5 items-start">
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              {/* แบบฟอร์มราชการฉบับเต็ม */}
              {showOfficialForm && <OfficialGovFormDocument req={current} />}

              {/* สถานะลายมือชื่อทั้ง 4 ฝ่าย */}
              <div className="jw-card p-4 flex flex-col gap-2.5">
                <b className="text-[14px] text-ink">สถานะลายมือชื่อบนเอกสารนี้</b>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
                  <SignaturePreviewCard
                    roleLabel="1. ผู้ยื่นคำขอ"
                    signerName={current.requesterName}
                    signature={current.requesterSignature}
                    signedAt={formatThaiDateTime(current.createdAt)}
                    status="signed"
                  />
                  <SignaturePreviewCard
                    roleLabel="2. เจ้าหน้าที่ (ระดับ 1)"
                    signerName={account?.name || 'สุดา มีสุข'}
                    signature={undefined}
                    status="pending"
                  />
                  <SignaturePreviewCard
                    roleLabel="3. ปลัด อบต. (ระดับ 2)"
                    signerName="วิชัย รักถิ่น"
                    signature={undefined}
                    status="pending"
                  />
                  <SignaturePreviewCard
                    roleLabel="4. นายก อบต. (ระดับ 3)"
                    signerName="ประเสริฐ ศรีสุข"
                    signature={undefined}
                    status="pending"
                  />
                </div>
              </div>
            </div>

            {/* แถบขั้นตอนและการลงนามของเจ้าหน้าที่ */}
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((n) => (
                    <i
                      key={n}
                      className={`flex-1 h-1.5 rounded-full block ${
                        n === 1 ? 'bg-brand-hover' : 'bg-line'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[13px] text-ink-mute">
                  ลงนามฝ่ายที่ 2 จาก 4 · เจ้าหน้าที่ตรวจสอบ (ระดับ 1)
                </span>
              </div>

              <div>
                <label className="jw-lbl">เหตุผล / วันที่เสนอแทน (กรณีไม่ผ่าน)</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="พิมพ์ข้อความที่จะส่งให้ผู้จองทาง LINE"
                  className="jw-in h-20 py-2.5"
                />
              </div>

              {/* กล่องลายเซ็นของเจ้าหน้าที่ */}
              <div className="jw-card p-4 flex flex-col gap-3">
                <label className="jw-lbl">
                  ลายเซ็นของคุณ ({account?.name || 'สุดา มีสุข'} · {account?.position || 'เจ้าหน้าที่ธุรการ'})
                </label>
                <SignatureBox
                  value={staffSignature}
                  onChange={setStaffSignature}
                  savedSignature={account?.signature}
                  signerLabel={`${account?.name || 'สุดา มีสุข'} · ${account?.position || 'เจ้าหน้าที่ธุรการ'}`}
                  height={155}
                  skipPinPrompt
                />

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
                    ข้าพเจ้ายืนยันว่าได้ตรวจเอกสารแล้วและลงลายมือชื่อด้วยตนเอง
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ยืนยันรหัส PIN 6 หลักเพื่อลงนาม */}
      {showPinModal && current && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[420px] bg-white rounded-hard p-6 flex flex-col items-center gap-4 shadow-md">
            <div className="w-full flex items-center justify-between">
              <div>
                <b className="text-[16px] text-ink block">ยืนยันรหัส PIN 6 หลักเพื่อลงนาม</b>
                <span className="text-[12px] text-ink-mute">
                  คำขอ {current.code} · {pendingDecision === 'approve' ? 'ลงนามเห็นชอบ (ส่งต่อปลัด อบต.)' : 'ลงนามไม่เห็นชอบ/ไม่ผ่าน'}
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
              subtitle={`กรอกรหัส PIN 6 หลักของ ${account?.name || 'เจ้าหน้าที่'} เพื่อยืนยันการลงนาม`}
              onComplete={(enteredPin) => handleDecision(pendingDecision, enteredPin)}
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
    </AppShell>
  );
}
