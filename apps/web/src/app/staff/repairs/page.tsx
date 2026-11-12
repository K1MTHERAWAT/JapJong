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
import { RepairRequest, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  Chip,
  PinKeypad,
  StatusChip,
} from '@/components/ui';
import { api, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

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

  return (
    <AppShell
      title="จัดการงานซ่อมและปัญหา"
      backHref="/staff"
      onBack={current ? handleBackToList : undefined}
      rightLabel={account?.nickname || 'เจ้าหน้าที่'}
      maxWidth={current ? 'max-w-[1440px]' : 'max-w-[1100px]'}
      footer={
        current ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            {current.status === 'repair_submitted' ? (
              <>
                {/* ปุ่มส่งกลับ / ไม่รับเรื่อง */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleStartAction('reject')}
                  className="jw-btn-red flex-1 sm:w-44"
                >
                  ส่งกลับ / ไม่รับเรื่อง
                </button>
                {/* ปุ่มรับเรื่องซ่อม */}
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
              /* ปุ่มบันทึกซ่อมเสร็จ */
              <button
                type="button"
                disabled={submitting || !confirmed || !resolution.trim() || afterPhotos.length === 0}
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
                  : lastCompleted.status === 'rejected'
                    ? 'ส่งกลับ / ไม่รับเรื่องซ่อมเรียบร้อยแล้ว'
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
              className="text-[13px] font-semibold text-ink inline-flex items-center gap-1 hover:underline"
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
                <div
                  key={r.id}
                  onClick={() => handleSelectRepair(r.id)}
                  className="jw-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
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
                    <span className="text-[12.5px] text-ink-mute">
                      ผู้แจ้ง: {r.requesterName} · {r.organization} · แจ้งเมื่อ {formatThaiDateTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand shrink-0">
                    <span>{r.status === 'repair_in_progress' ? 'บันทึกผลการซ่อม' : 'จัดการงานซ่อม'}</span>
                    <Icon name="chevron-right" className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ===================== หน้ารายละเอียดงานซ่อม (Detail View) ===================== */
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBackToList}
              className="text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1"
            >
              ← กลับไปหน้ารายการงานซ่อม ({queue.length})
            </button>
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

            {/* ขวา: ฟอร์มดำเนินการของช่าง */}
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              {current.status === 'repair_submitted' ? (
                <div className="jw-card p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="jw-lbl mb-0">เจ้าหน้าที่ผู้รับผิดชอบงาน</label>
                    <span className="text-[12px] text-ink-mute">{account?.name || 'สุดา มีสุข'}</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-canvas border border-line text-[13px] text-ink flex flex-col gap-1.5">
                    <div className="font-semibold text-ink flex items-center gap-1.5">
                      <Icon name="user" className="w-4 h-4 text-brand" />
                      <span>{account?.name || 'เจ้าหน้าที่'} ({account?.role || 'STAFF'})</span>
                    </div>
                    <p className="text-[12.5px] text-ink-mute">
                      ตรวจสอบรายละเอียดปัญหาและกดปุ่ม <b>&quot;รับเรื่องซ่อม (เริ่มดำเนินการ)&quot;</b> ด้านล่างเพื่อเริ่มงาน
                    </p>
                  </div>
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
              ) : current.status === 'repair_in_progress' ? (
                <div className="jw-card p-4 sm:p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <b className="text-[15px] text-ink">บันทึกผลการซ่อมและส่งตรวจรับ</b>
                    <span className="text-[12px] text-ink-mute">{account?.name || 'ช่างซ่อมบำรุง'}</span>
                  </div>

                  <div>
                    <label className="jw-lbl">
                      บันทึกผลการซ่อม <span className="text-status-crit font-bold">*</span>
                      <span className="text-[12px] font-normal text-ink-mute ml-1">(ระบุรายละเอียดการแก้ไข)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={resolution}
                      onChange={(e) => {
                        setResolution(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="ระบุรายละเอียดการแก้ไข เช่น เปลี่ยนหลอดไฟ LED ใหม่ 2 หลอด, ซ่อมท่อน้ำรั่วและทดสอบระบบเรียบร้อย"
                      className={`jw-in min-h-20 py-2.5 ${!resolution.trim() ? 'border-amber-300' : ''}`}
                    />
                    {!resolution.trim() && (
                      <p className="mt-1 text-[12px] text-status-crit">
                        * จำเป็นต้องระบุข้อมูลในบันทึกผลการซ่อม
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="jw-lbl mb-0">
                        แนบรูปหลังซ่อม <span className="text-status-crit font-bold">*</span>
                        <span className="text-[12px] font-normal text-ink-mute ml-1">(ไม่เกิน 3 รูป)</span>
                      </label>
                      <span className="text-[12px] text-ink-mute">
                        {afterPhotos.length === 0 ? (
                          <span className="text-status-crit font-medium">บังคับแนบรูป</span>
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
                          className="w-20 h-20 rounded-2xl border border-line bg-brand-mint overflow-hidden relative shadow-sm"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`รูปหลังซ่อม ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="w-5 h-5 rounded-full bg-ink text-white absolute top-1 right-1 flex items-center justify-center shadow hover:bg-status-crit transition"
                          >
                            <Icon name="x" className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {afterPhotos.length < 3 && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-20 h-20 rounded-2xl border-[1.5px] border-dashed text-[12px] flex flex-col items-center justify-center gap-1 transition ${
                            afterPhotos.length === 0
                              ? 'border-status-crit/70 bg-red-50/40 text-status-crit hover:border-status-crit hover:bg-red-50'
                              : 'border-[#7A7A7A] bg-white text-ink-mute hover:border-brand hover:text-brand'
                          }`}
                        >
                          <Icon name="photo" className="w-5 h-5" />
                          <span>+ เพิ่มรูป</span>
                        </button>
                      )}
                    </div>

                    {afterPhotos.length === 0 ? (
                      <p className="mt-1 text-[12px] text-status-crit">
                        * จำเป็นต้องแนบรูปหลังซ่อมอย่างน้อย 1 รูป
                      </p>
                    ) : null}
                  </div>

                  <div className="pt-2 border-t border-line">
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
              ) : (
                <div className="jw-card p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <b className="text-[14px] text-ink">บันทึกผลการซ่อมบำรุง</b>
                    <span className="text-[12px] text-ink-mute">{current.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-canvas border border-line text-[13px] flex flex-col gap-2.5">
                    <div>
                      <span className="text-[12px] text-ink-mute block mb-0.5">รายละเอียดผลการซ่อม</span>
                      <span className="text-ink font-medium whitespace-pre-wrap">{current.resolution || '-'}</span>
                    </div>
                    {current.afterPhotos && current.afterPhotos.length > 0 && (
                      <div>
                        <span className="text-[12px] text-ink-mute block mb-1.5">
                          รูปภาพหลังซ่อม ({current.afterPhotos.length} รูป)
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {current.afterPhotos.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-20 h-20 rounded-xl border border-line overflow-hidden hover:opacity-90 transition shadow-sm"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`รูปหลังซ่อมที่ ${i + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
