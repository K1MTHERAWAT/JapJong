'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RequestWithTimeline } from '@japjong/shared';
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

const DEFAULT_CHECKS = [
  'เบอร์โทรและข้อมูลผู้ยื่นคำขอครบถ้วน',
  'ไม่มีช่วงเวลาซ้อนทับกับการใช้งานอื่น',
  'วัตถุประสงค์การใช้งานชัดเจนตามระเบียบ',
  'เอกสารหลักฐานและข้อมูลประกอบถูกต้อง',
];

export default function StaffReviewPage() {
  const { account } = useAuth();
  const [queue, setQueue] = useState<RequestWithTimeline[]>([]);
  const [index, setIndex] = useState(0);
  const [showOfficialForm, setShowOfficialForm] = useState(true);
  const [checks, setChecks] = useState<boolean[]>([true, true, true, true]);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [afterPhotos, setAfterPhotos] = useState(0);
  const [staffSignature, setStaffSignature] = useState('');
  const [confirmed, setConfirmed] = useState(true);
  const [otpStep, setOtpStep] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject'>('approve');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastCompleted, setLastCompleted] = useState<RequestWithTimeline | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback((preferId?: string | null) => {
    api
      .listRequests({ queue: 'staff' })
      .then((list) => {
        setQueue(list);
        if (preferId) {
          const foundIdx = list.findIndex((r) => r.id === preferId || r.code === preferId);
          setIndex(foundIdx >= 0 ? foundIdx : 0);
        } else {
          setIndex(0);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    load(sp?.get('id'));
  }, [load]);

  // ตรวจสอบสถานะ Signing Session (OTP)
  useEffect(() => {
    api
      .getSignSessionStatus()
      .then((res) => setIsSessionVerified(res.isVerified))
      .catch(() => { });
  }, []);

  const current = queue[index];

  useEffect(() => {
    setStaffSignature(account?.signature || '');
    setOtpStep(false);
    setErrorMsg('');
  }, [account?.id, account?.signature, current?.id]);

  const handleDecision = async (decision: 'approve' | 'reject', enteredPin?: string) => {
    if (!current) return;
    if (current.type !== 'repair' && !staffSignature.trim()) return;
    setErrorMsg('');
    setPinError('');
    setSubmitting(true);
    try {
      let updated: RequestWithTimeline;
      if (current.type === 'repair') {
        if (current.status === 'repair_submitted') {
          updated = await api.updateRepairStatus(current.id, {
            action: decision === 'approve' ? 'accept' : 'reopen',
            signature: staffSignature,
          });
        } else {
          updated = await api.updateRepairStatus(current.id, {
            action: 'finish',
            resolution,
            signature: staffSignature,
          });
        }
      } else {
        updated = await api.signRequest(current.id, {
          decision,
          note: note || undefined,
          signature: staffSignature,
          pin: enteredPin,
        });
      }
      setNote('');
      setOtpStep(false);
      setShowPinModal(false);
      setLastCompleted(updated);
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
        setShowPinModal(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartDecision = (decision: 'approve' | 'reject') => {
    setPendingDecision(decision);
    setErrorMsg('');
    setPinError('');
    if (current?.type === 'repair') {
      handleDecision(decision);
    } else if (!isSessionVerified) {
      setOtpStep(true);
    } else {
      setPin('');
      setShowPinModal(true);
    }
  };

  return (
    <AppShell
      title={otpStep ? 'ยืนยัน OTP ก่อนลงนาม' : 'คำขอรอตรวจ'}
      backHref="/staff"
      onBack={otpStep ? () => setOtpStep(false) : undefined}
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth="max-w-[1440px]"
      footer={
        current && !otpStep ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            {current.type === 'repair' ? (
              current.status === 'repair_in_progress' ? (
                <button
                  type="button"
                  disabled={submitting || !confirmed}
                  onClick={() => handleDecision('approve')}
                  className="jw-btn w-full sm:w-72"
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกซ่อมเสร็จ'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDecision('reject')}
                    className="jw-btn-red flex-1 sm:w-44"
                  >
                    ส่งกลับ / ไม่รับเรื่อง
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !confirmed}
                    onClick={() => handleDecision('approve')}
                    className="jw-btn flex-[1.5] sm:w-64"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'รับเรื่องซ่อม'}
                  </button>
                </>
              )
            ) : current.status === 'repair_in_progress' ? (
              <button
                type="button"
                disabled={submitting || !confirmed || !staffSignature.trim()}
                onClick={() => handleStartDecision('approve')}
                className="jw-btn w-full sm:w-72"
              >
                ลงนามซ่อมเสร็จ
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={submitting || !staffSignature.trim()}
                  onClick={() => handleStartDecision('reject')}
                  className="jw-btn-red flex-1 sm:w-44"
                >
                  ลงนามไม่ผ่าน
                </button>
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
            )}
          </div>
        ) : undefined
      }
    >
      {/* แบนเนอร์แจ้งผลการดำเนินการล่าสุด */}
      {lastCompleted && (
        <div className="mb-4 jw-card p-4 bg-brand-mint border border-brand flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <b className="text-[14px] text-ink block">
              ดำเนินการ {lastCompleted.code} เรียบร้อยแล้ว ({lastCompleted.status === 'pending_l2' ? 'ส่งต่อปลัด อบต. ระดับ 2' : 'อัปเดตสถานะแล้ว'})
            </b>
            <span className="text-[12px] text-ink-mute">
              ลงนามระดับที่ 1 (เจ้าหน้าที่) สำเร็จ เอกสารถูกส่งต่อไปยังคิวของปลัด อบต. (ระดับ 2) แล้ว
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

      {!current ? (
        <div className="jw-card p-8 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
            <Icon name="check" className="w-6 h-6" strokeWidth={3} />
          </div>
          <b className="text-[16px]">ตรวจคำขอครบทุกรายการแล้ว</b>
          <Link href="/staff" className="jw-btn jw-btn-sm">
            กลับหน้าหลักเจ้าหน้าที่
          </Link>
        </div>
      ) : otpStep ? (
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
              ลงนามฝ่ายที่ 2 จาก 4 · เจ้าหน้าที่ตรวจสอบ (ระดับ 1) · เอกสาร {current.code}
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

          {errorMsg && (
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#F9B4B4] px-3.5 py-2 text-[13px] text-[#7A1010]">
              {errorMsg}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between">
            <Chip tone="amber">
              รอตรวจ {queue.length} · รายการที่ {index + 1}
            </Chip>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={index <= 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="w-8 h-8 rounded-full border-[1.5px] border-ink flex items-center justify-center disabled:opacity-40"
              >
                <Icon name="chevron-left" className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={index >= queue.length - 1}
                onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))}
                className="w-8 h-8 rounded-full border-[1.5px] border-ink flex items-center justify-center disabled:opacity-40"
              >
                <Icon name="chevron-right" className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold text-ink">{current.code}</h1>
            <StatusChip status={current.status} />
          </div>

          {current.type !== 'repair' && (
            <SignOtpVerifier
              initialEmail={account?.email}
              onVerified={() => setIsSessionVerified(true)}
            />
          )}

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
                  ? `${current.purpose} · ${current.attendees} คน`
                  : current.type === 'borrow'
                    ? current.purpose
                    : current.detail}
              </span>
            </div>
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
                  : current.type === 'borrow'
                    ? `${formatThaiDate(current.pickupDate, false)}–${formatThaiDate(current.returnDate, true)}`
                    : `${current.building} · ${current.floor}`}
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
              {current.type !== 'repair' && showOfficialForm && <OfficialGovFormDocument req={current} />}

              {/* สถานะลายมือชื่อทั้ง 4 ฝ่าย / ความคืบหน้าแจ้งซ่อม */}
              <div className="jw-card p-4 flex flex-col gap-2.5">
                <b className="text-[14px] text-ink">
                  {current.type === 'repair' ? 'ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)' : 'สถานะลายมือชื่อบนเอกสารนี้'}
                </b>
                {current.type === 'repair' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">1. ผู้แจ้งส่งเรื่อง</span>
                      <span className="text-[13.5px] font-bold text-ink">{current.requesterName}</span>
                      <span className="text-[12px] text-ink-mute">{formatThaiDateTime(current.createdAt)}</span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand mt-1">✓ ส่งเรื่องแล้ว</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">2. เจ้าหน้าที่รับเรื่อง & ซ่อม</span>
                      <span className="text-[13.5px] font-bold text-ink">{current.staffSignerName || account?.name || 'ฝ่ายช่างซ่อมบำรุง'}</span>
                      <span className="text-[12px] text-ink-mute">
                        {current.finishedAt
                          ? `เสร็จ: ${formatThaiDateTime(current.finishedAt)}`
                          : current.acceptedAt
                            ? `รับเรื่อง: ${formatThaiDateTime(current.acceptedAt)}`
                            : 'รอดำเนินการ'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${current.finishedAt ? 'text-brand' : current.acceptedAt ? 'text-amber-600' : 'text-ink-mute'
                        }`}>
                        {current.finishedAt ? '✓ ซ่อมเสร็จแล้ว' : current.acceptedAt ? '⟳ กำลังดำเนินการ' : '○ รอช่างรับเรื่อง'}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">3. ผู้แจ้งตรวจรับงาน</span>
                      <span className="text-[13.5px] font-bold text-ink">{current.requesterName}</span>
                      <span className="text-[12px] text-ink-mute">
                        {current.acceptedByRequesterAt ? formatThaiDateTime(current.acceptedByRequesterAt) : '-'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${current.status === 'repair_done' ? 'text-brand' : current.status === 'repair_awaiting_acceptance' ? 'text-amber-600' : 'text-ink-mute'
                        }`}>
                        {current.status === 'repair_done' ? '✓ ตรวจรับเรียบร้อย' : current.status === 'repair_awaiting_acceptance' ? '⟳ รอคุณตรวจรับ' : '○ รอซ่อมเสร็จ'}
                      </span>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>

            {/* แถบขั้นตอนเหมือนผู้อนุมัติ L2/L1 */}
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((n) => (
                    <i
                      key={n}
                      className={`flex-1 h-1.5 rounded-full block ${n === 1 ? 'bg-brand-hover' : 'bg-line'
                        }`}
                    />
                  ))}
                </div>
                <span className="text-[13px] text-ink-mute">
                  ลงนามฝ่ายที่ 2 จาก 4 · เจ้าหน้าที่ตรวจสอบ (ระดับ 1)
                </span>
              </div>

              {current.type === 'repair' && current.status === 'repair_in_progress' ? (
                <div className="jw-card p-4 flex flex-col gap-3">
                  <div>
                    <label className="jw-lbl">บันทึกผลการซ่อม (ก่อนส่งให้ผู้แจ้งตรวจรับงาน)</label>
                    <textarea
                      rows={2}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      className="jw-in h-20 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="jw-lbl">แนบรูปหลังซ่อม (ไม่เกิน 3 รูป)</label>
                    <div className="flex gap-3">
                      {Array.from({ length: afterPhotos }).map((_, idx) => (
                        <div
                          key={idx}
                          className="w-16 h-16 rounded-2xl bg-brand-mint text-brand flex items-center justify-center relative"
                        >
                          <Icon name="photo" className="w-6 h-6" strokeWidth={1.6} />
                          <button
                            type="button"
                            onClick={() => setAfterPhotos((p) => Math.max(0, p - 1))}
                            className="w-5 h-5 rounded-full bg-ink text-white absolute -top-1.5 -right-1.5 flex items-center justify-center"
                          >
                            <Icon name="x" className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {afterPhotos < 3 && (
                        <button
                          type="button"
                          onClick={() => setAfterPhotos((p) => Math.min(3, p + 1))}
                          className="w-16 h-16 rounded-2xl bg-white border-[1.5px] border-dashed border-[#7A7A7A] text-ink-mute text-[12px] flex flex-col items-center justify-center gap-0.5 hover:border-brand"
                        >
                          <Icon name="plus" className="w-4 h-4" />
                          <span>+ รูป</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* เช็คลิสต์ 4 ข้อ */}
                  <div className="jw-card px-4 divide-y divide-line">
                    {DEFAULT_CHECKS.map((label, i) => {
                      const checked = checks[i];
                      return (
                        <div
                          key={label}
                          onClick={() => setChecks((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                          className="py-3 flex items-center gap-2.5 cursor-pointer select-none"
                        >
                          <div
                            className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 ${checked ? 'bg-brand border-brand text-white' : 'bg-white border-[#7A7A7A]'
                              }`}
                          >
                            {checked && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                          </div>
                          <span className="text-[14px] flex-1">{label}</span>
                        </div>
                      );
                    })}
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
                </>
              )}

              {/* กล่องลายเซ็นของเจ้าหน้าที่ (ยกเว้นงานซ่อมที่ไม่ต้องลงนาม) */}
              {current.type === 'repair' ? (
                <div className="jw-card p-4 flex flex-col gap-3">
                  <div
                    onClick={() => setConfirmed((v) => !v)}
                    className="flex items-start gap-2.5 cursor-pointer select-none"
                  >
                    <div
                      className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${confirmed ? 'bg-brand border-brand text-white' : 'bg-white border-[#7A7A7A]'
                        }`}
                    >
                      {confirmed && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                    </div>
                    <span className="text-[13.5px] text-ink font-medium leading-relaxed">
                      ข้าพเจ้ายืนยันการดำเนินการงานแจ้งซ่อมนี้ตามข้อเท็จจริง (ไม่ต้องลงนามลายเซ็น)
                    </span>
                  </div>
                </div>
              ) : (
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
                      className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${confirmed ? 'bg-brand border-brand text-white' : 'bg-white border-[#7A7A7A]'
                        }`}
                    >
                      {confirmed && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                    </div>
                    <span className="text-[13px] text-ink-mute leading-relaxed">
                      ข้าพเจ้ายืนยันว่าได้ตรวจเอกสารแล้วและลงลายมือชื่อด้วยตนเอง
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
