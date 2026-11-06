'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RepairRequest, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  Chip,
  PinKeypad,
  SignatureBox,
  StatusChip,
} from '@/components/ui';
import { api, formatThaiDate, formatThaiDateTime } from '@/lib/api';

export default function StaffRepairsPage() {
  const { account } = useAuth();
  const [queue, setQueue] = useState<(RequestWithTimeline & RepairRequest)[]>([]);
  const [index, setIndex] = useState(0);
  const [resolution, setResolution] = useState('');
  const [afterPhotos, setAfterPhotos] = useState(0);
  const [staffSignature, setStaffSignature] = useState('');
  const [confirmed, setConfirmed] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'accept' | 'finish' | 'reject'>('accept');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastCompleted, setLastCompleted] = useState<RequestWithTimeline | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback((preferId?: string | null) => {
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
            // ignore
          }
        }
        setQueue(combined);
        if (preferId) {
          const foundIdx = combined.findIndex((r) => r.id === preferId || r.code === preferId);
          setIndex(foundIdx >= 0 ? foundIdx : 0);
        } else {
          setIndex(0);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    load(sp?.get('id'));
  }, [load]);

  const current = queue[index];

  useEffect(() => {
    setStaffSignature(account?.signature || '');
    setErrorMsg('');
    setResolution(current?.resolution || '');
  }, [account?.id, account?.signature, current?.id, current?.resolution]);

  const handleExecuteAction = async (action: 'accept' | 'finish' | 'reject', enteredPin?: string) => {
    if (!current) return;
    setErrorMsg('');
    setPinError('');
    setSubmitting(true);
    try {
      let updated: RequestWithTimeline;
      if (action === 'accept') {
        updated = await api.updateRepairStatus(current.id, {
          action: 'accept',
          signature: staffSignature || undefined,
          pin: enteredPin,
        });
      } else if (action === 'finish') {
        updated = await api.updateRepairStatus(current.id, {
          action: 'finish',
          resolution: resolution.trim() || 'ดำเนินการซ่อมบำรุงเรียบร้อยแล้ว สภาพพร้อมใช้งาน',
          signature: staffSignature || undefined,
          pin: enteredPin,
        });
      } else {
        updated = await api.updateRepairStatus(current.id, {
          action: 'reopen',
          signature: staffSignature || undefined,
          pin: enteredPin,
        });
      }
      setShowPinModal(false);
      setPin('');
      setLastCompleted(updated);
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

  const handleStartAction = (action: 'accept' | 'finish' | 'reject') => {
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

  return (
    <AppShell
      title="จัดการงานซ่อมและปัญหา"
      backHref="/staff"
      rightLabel={account?.nickname || 'เจ้าหน้าที่'}
      maxWidth="max-w-[1440px]"
      footer={
        current ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            {current.status === 'repair_submitted' ? (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleStartAction('reject')}
                  className="jw-btn-red flex-1 sm:w-44"
                >
                  ส่งกลับ / ไม่รับเรื่อง
                </button>
                <button
                  type="button"
                  disabled={submitting || !confirmed}
                  onClick={() => handleStartAction('accept')}
                  className="jw-btn flex-[1.5] sm:w-64"
                >
                  {submitting ? 'กำลังบันทึก...' : 'รับเรื่องซ่อม (เริ่มดำเนินการ)'}
                </button>
              </>
            ) : current.status === 'repair_in_progress' ? (
              <button
                type="button"
                disabled={submitting || !confirmed || !staffSignature.trim()}
                onClick={() => handleStartAction('finish')}
                className="jw-btn w-full sm:w-72"
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกซ่อมเสร็จ (ส่งตรวจรับ)'}
              </button>
            ) : (
              <div className="text-[13px] text-ink-mute flex items-center gap-2">
                <Icon name="check" className="w-4 h-4 text-brand" />
                <span>งานซ่อมนี้ดำเนินการเรียบร้อยแล้ว ({current.status === 'repair_done' ? 'ตรวจรับเสร็จสิ้น' : 'รอผู้แจ้งตรวจรับงาน'})</span>
              </div>
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
              บันทึกงานซ่อม {lastCompleted.code} เรียบร้อยแล้ว
            </b>
            <span className="text-[12px] text-ink-mute">
              {lastCompleted.status === 'repair_in_progress'
                ? 'รับเรื่องเรียบร้อย สถานะเปลี่ยนเป็น "กำลังดำเนินการ"'
                : lastCompleted.status === 'repair_awaiting_acceptance'
                ? 'บันทึกผลการซ่อมเรียบร้อย ส่งเรื่องให้ผู้แจ้งเข้าตรวจรับงานแล้ว'
                : 'อัปเดตสถานะเรียบร้อย'}
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

      {errorMsg && (
        <div className="mb-4 rounded-2xl bg-[#FDE8E8] border border-[#F9B4B4] px-4 py-2.5 text-[13px] text-[#7A1010]">
          {errorMsg}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-full bg-brand-mint text-brand flex items-center justify-center">
            <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <b className="text-[17px] text-ink">ไม่มีงานแจ้งซ่อมรอจัดการในขณะนี้</b>
          <p className="text-[13px] text-ink-mute max-w-md">
            เมื่อมีประชาชนหรือเจ้าหน้าที่แจ้งอุปกรณ์ชำรุดหรือปัญหาอาคารสถานที่ รายการจะปรากฏที่นี่
          </p>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between">
            <Chip tone="amber">
              งานซ่อมรอจัดการ {queue.length} · รายการที่ {index + 1}
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

          {/* รายละเอียดปัญหาที่แจ้ง */}
          <div className="jw-card p-4 sm:p-5 flex flex-col gap-3 text-[14px]">
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">ผู้แจ้งซ่อม</b>
              <span>
                {current.requesterName} · {current.organization}
                {current.requesterPhone ? ` · โทร. ${current.requesterPhone}` : ''}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">สถานที่/อาคาร</b>
              <span>
                {current.building} · {current.floor} · {current.location}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">ปัญหา/อาการ</b>
              <span className="font-semibold text-ink">{current.title}</span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">รายละเอียด</b>
              <span className="text-ink-mute whitespace-pre-wrap">{current.detail || '-'}</span>
            </div>
            <div className="flex items-start gap-2">
              <b className="w-24 shrink-0 text-ink">วันที่แจ้ง</b>
              <span>{formatThaiDateTime(current.createdAt)}</span>
            </div>
            {current.attachments && current.attachments.length > 0 && (
              <div className="flex flex-col gap-2">
                <b className="text-ink">รูปภาพประกอบการแจ้งซ่อม ({current.attachments.length} รูป)</b>
                <div className="flex flex-wrap gap-2.5">
                  {current.attachments.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-24 h-24 rounded-xl border border-line overflow-hidden hover:opacity-90 transition"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`รูปปัญหาที่ ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] gap-4 sm:gap-5 items-start">
            {/* ซ้าย: ความคืบหน้า 3 ขั้นตอน */}
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              <div className="jw-card p-4 flex flex-col gap-2.5">
                <b className="text-[14px] text-ink">ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)</b>
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
                    <span
                      className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                        current.finishedAt
                          ? 'text-brand'
                          : current.acceptedAt
                          ? 'text-amber-600'
                          : 'text-ink-mute'
                      }`}
                    >
                      {current.finishedAt ? '✓ ซ่อมเสร็จแล้ว' : current.acceptedAt ? '⟳ กำลังดำเนินการ' : '○ รอช่างรับเรื่อง'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-ink-mute">3. ผู้แจ้งตรวจรับงาน</span>
                    <span className="text-[13.5px] font-bold text-ink">{current.requesterName}</span>
                    <span className="text-[12px] text-ink-mute">
                      {current.acceptedByRequesterAt ? formatThaiDateTime(current.acceptedByRequesterAt) : '-'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                        current.status === 'repair_done'
                          ? 'text-brand'
                          : current.status === 'repair_awaiting_acceptance'
                          ? 'text-amber-600'
                          : 'text-ink-mute'
                      }`}
                    >
                      {current.status === 'repair_done'
                        ? '✓ ตรวจรับเรียบร้อย'
                        : current.status === 'repair_awaiting_acceptance'
                        ? '⟳ รอคุณตรวจรับ'
                        : '○ รอซ่อมเสร็จ'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ขวา: ฟอร์มดำเนินการของช่าง / ลายเซ็น */}
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              {current.status === 'repair_in_progress' ? (
                <div className="jw-card p-4 sm:p-5 flex flex-col gap-3">
                  <div>
                    <label className="jw-lbl">บันทึกผลการซ่อม (ก่อนส่งให้ผู้แจ้งตรวจรับงาน)</label>
                    <textarea
                      rows={3}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="ระบุรายละเอียดการแก้ไข เช่น เปลี่ยนหลอดไฟ LED, ซ่อมท่อน้ำรั่วเรียบร้อย"
                      className="jw-in min-h-20 py-2.5"
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
              ) : null}

              {/* ลายเซ็นเจ้าหน้าที่ผู้รับผิดชอบ */}
              <div className="jw-card p-4 sm:p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="jw-lbl mb-0">ลายเซ็นเจ้าหน้าที่ผู้ดำเนินการ</label>
                  <span className="text-[12px] text-ink-mute">{account?.name || 'สุดา มีสุข'}</span>
                </div>
                <SignatureBox
                  value={staffSignature}
                  onChange={setStaffSignature}
                  savedSignature={account?.signature}
                  signerLabel={account?.name || 'เจ้าหน้าที่'}
                  height={140}
                />
                <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded text-brand focus:ring-brand"
                  />
                  <span>ข้าพเจ้าได้ตรวจสอบรายละเอียดและข้อมูลถูกต้อง</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal ยืนยัน PIN สำหรับเจ้าหน้าที่ */}
      {showPinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPinModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <b className="text-[18px] text-ink block">ยืนยัน PIN 6 หลัก</b>
              <span className="text-[13px] text-ink-mute">
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
              <div className="mt-2 text-center text-[13px] text-status-crit font-medium">
                {pinError}
              </div>
            )}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="text-[13px] text-ink-mute hover:underline"
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
