'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BorrowRequest,
  checkBorrowReceiveEligibility,
  Equipment,
  getBangkokDateString,
  RequestWithTimeline,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Tabs } from '@/components/ui';
import { api, formatThaiDate, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

type BorrowTab = 'borrowing' | 'inspect' | 'history';

type ExtendedBorrowRequest = RequestWithTimeline & BorrowRequest;

const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function MyBorrowsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState<ExtendedBorrowRequest[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [tab, setTab] = useState<BorrowTab>('borrowing');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [receiveModalTarget, setReceiveModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [returnModalTarget, setReturnModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [inspectModalTarget, setInspectModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [rescheduleModalTarget, setRescheduleModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form states for modals
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [formNote, setFormNote] = useState('');
  const [modalError, setModalError] = useState('');
  const [inspectResult, setInspectResult] = useState<'normal' | 'damaged' | 'incomplete'>('normal');
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  // Reschedule state
  const [newPickupDate, setNewPickupDate] = useState('');
  const [newReturnDate, setNewReturnDate] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const isStaffOrAdmin =
    account?.role === 'STAFF' || account?.role === 'ADMIN' || Boolean(account?.permissions?.review);

  // Load equipment & borrow requests
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eqs, reqs] = await Promise.all([
        api.equipment().catch(() => [] as Equipment[]),
        api.listRequests({ mine: !isStaffOrAdmin, type: 'borrow' }).catch(() => []),
      ]);
      setEquipmentList(eqs);
      setItems(reqs as ExtendedBorrowRequest[]);
    } catch {
      // silently keep previous state
    } finally {
      setLoading(false);
    }
  }, [isStaffOrAdmin]);

  useEffect(() => {
    load();
  }, [load, account?.id]);

  // Helper to find equipment metadata
  const getEquipmentInfo = (r: ExtendedBorrowRequest) => {
    const firstItem = r.items?.[0];
    const eq = equipmentList.find((e) => e.id === firstItem?.equipmentId);
    const totalQty = r.items?.reduce((sum, i) => sum + (i.qty || 0), 0) || 1;
    const name = eq?.name || r.title || 'อุปกรณ์';
    const code = eq?.id || firstItem?.equipmentId || '-';
    const photo = eq?.images?.[0] || null;
    const itemSummaries = (r.items || []).map((it) => {
      const found = equipmentList.find((e) => e.id === it.equipmentId);
      return `${found?.name || it.equipmentId} (${it.qty} ชิ้น)`;
    });
    return { name, code, totalQty, photo, itemSummaries };
  };

  // Helper to extract approval date
  const getApprovalDate = (r: ExtendedBorrowRequest) => {
    const l1Sig = r.signatures?.find((s) => s.decision === 'approve' && s.level === 'l1');
    return l1Sig?.at || r.updatedAt;
  };

  // Validate selected files (JPG, JPEG, PNG, WEBP & <= 10MB)
  const validateSelectedFiles = (fileList: FileList): string | null => {
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const lowerName = f.name.toLowerCase();
      const validExt =
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp');
      if (!ALLOWED_IMAGE_MIMES.includes(f.type) && !validExt) {
        return `ไฟล์ "${f.name}" ไม่ใช่รูปภาพที่รองรับ (รองรับเฉพาะ JPG, JPEG, PNG, WEBP)`;
      }
      if (f.size > MAX_IMAGE_FILE_BYTES) {
        return `ไฟล์ "${f.name}" มีขนาดเกิน 10MB กรุณาเลือกไฟล์ขนาดเล็กลง`;
      }
    }
    return null;
  };

  // Handle Photo selection inside modals
  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setModalError('');
    const validationErr = validateSelectedFiles(e.target.files);
    if (validationErr) {
      setModalError(validationErr);
      e.target.value = '';
      return;
    }
    try {
      const maxRemaining = Math.max(0, 6 - formPhotos.length);
      if (maxRemaining === 0) return;
      const compressed = await readAndCompressImages(e.target.files, maxRemaining);
      if (compressed.length > 0) {
        setFormPhotos((prev) => [...prev, ...compressed].slice(0, 6));
      }
    } catch (err: unknown) {
      setModalError((err as Error).message || 'ไม่สามารถโหลดรูปภาพได้');
    } finally {
      e.target.value = '';
    }
  };

  // Handle replacing a single photo at replaceIndex
  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || replaceIndex === null) return;
    setModalError('');
    const validationErr = validateSelectedFiles(e.target.files);
    if (validationErr) {
      setModalError(validationErr);
      e.target.value = '';
      return;
    }
    try {
      const compressed = await readAndCompressImages(e.target.files, 1);
      if (compressed.length > 0) {
        setFormPhotos((prev) =>
          prev.map((item, idx) => (idx === replaceIndex ? compressed[0] : item)),
        );
      }
    } catch (err: unknown) {
      setModalError((err as Error).message || 'ไม่สามารถเปลี่ยนรูปภาพได้');
    } finally {
      setReplaceIndex(null);
      e.target.value = '';
    }
  };

  const removePhoto = (idx: number) => {
    setFormPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // 1. Confirm Receipt of Equipment (Borrower uploads pre-use photos)
  const handleConfirmReceive = async () => {
    if (!receiveModalTarget) return;
    setModalError('');
    const eligibility = checkBorrowReceiveEligibility(receiveModalTarget.pickupDate);
    if (!eligibility.allowed) {
      setModalError(eligibility.reason || 'ไม่สามารถยืนยันรับมอบได้เนื่องจากเลยกำหนดเวลา');
      return;
    }
    if (formPhotos.length === 0) {
      setModalError('กรุณาอัปโหลดรูปภาพอุปกรณ์ก่อนใช้งานอย่างน้อย 1 รูป (JPG, JPEG, PNG หรือ WEBP)');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.receiveEquipment(receiveModalTarget.id, {
        photos: formPhotos,
        note: formNote.trim(),
      });
      setSuccessMsg('ยืนยันรับมอบอุปกรณ์เรียบร้อยแล้ว บันทึกวันที่รับมอบจริงและเปลี่ยนสถานะเป็น "กำลังใช้งาน"');
      setReceiveModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      await load();
    } catch (err: unknown) {
      setModalError((err as Error).message || 'เกิดข้อผิดพลาดในการยืนยันรับมอบอุปกรณ์');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Submit Return of Equipment (Borrower does NOT upload photos)
  const handleConfirmReturn = async () => {
    if (!returnModalTarget) return;
    setModalError('');
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.submitReturnEquipment(returnModalTarget.id, {
        note: formNote.trim(),
      });
      setSuccessMsg('ยืนยันส่งคืนอุปกรณ์เรียบร้อยแล้ว รายการย้ายไปที่แถบ "รอตรวจสอบ" เพื่อให้เจ้าหน้าที่ตรวจสภาพ');
      setReturnModalTarget(null);
      setFormNote('');
      setTab('inspect');
      await load();
    } catch (err: unknown) {
      setModalError((err as Error).message || 'เกิดข้อผิดพลาดในการส่งคืนอุปกรณ์');
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Staff Inspect Return (Staff uploads post-return photos)
  const handleConfirmInspect = async () => {
    if (!inspectModalTarget) return;
    setModalError('');
    if (formPhotos.length === 0) {
      setModalError('เจ้าหน้าที่ต้องอัปโหลดรูปภาพอุปกรณ์หลังส่งคืนอย่างน้อย 1 รูปเพื่อเป็นหลักฐานการตรวจสอบ');
      return;
    }
    if (
      (inspectResult === 'damaged' || inspectResult === 'incomplete') &&
      !formNote.trim()
    ) {
      setModalError('กรณีอุปกรณ์ชำรุดหรือไม่ครบถ้วน กรุณาระบุรายละเอียดความเสียหายในช่องหมายเหตุ');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.inspectReturnEquipment(inspectModalTarget.id, {
        result: inspectResult,
        note: formNote.trim(),
        photos: formPhotos,
      });
      setSuccessMsg('บันทึกผลการตรวจสอบและรูปภาพหลังส่งคืนเรียบร้อยแล้ว สถานะเปลี่ยนเป็น "เสร็จสิ้น" และย้ายไปที่แถบ "ประวัติ"');
      setInspectModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      setTab('history');
      await load();
    } catch (err: unknown) {
      setModalError((err as Error).message || 'เกิดข้อผิดพลาดในการบันทึกผลการตรวจสอบ');
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Reschedule Pickup / Return Date (dynamically recalculates pickup eligibility)
  const handleConfirmReschedule = async () => {
    if (!rescheduleModalTarget) return;
    setModalError('');
    if (!newPickupDate || !newReturnDate) {
      setModalError('กรุณาระบุวันรับครุภัณฑ์และวันส่งคืนให้ครบถ้วน');
      return;
    }
    if (newReturnDate < newPickupDate) {
      setModalError('วันส่งคืนต้องไม่ก่อนวันรับครุภัณฑ์');
      return;
    }
    setSubmitting(true);
    try {
      await api.reschedule(rescheduleModalTarget.id, {
        pickupDate: newPickupDate,
        returnDate: newReturnDate,
      });
      setSuccessMsg(
        `แก้ไขวันรับครุภัณฑ์เป็น ${formatThaiDate(newPickupDate)} เรียบร้อยแล้ว ระบบคำนวณสิทธิ์การกดยืนยันรับมอบใหม่อัตโนมัติ`,
      );
      setRescheduleModalTarget(null);
      await load();
    } catch (err: unknown) {
      setModalError((err as Error).message || 'ไม่สามารถเลื่อนวันรับครุภัณฑ์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter items by tab
  const filtered = items.filter((r) => {
    if (tab === 'borrowing') {
      // แถบ "ที่กำลังใช้งาน": แสดงรายการที่ผ่านการอนุมัติครบ 3 ระดับแล้ว ("รอรับมอบ" = approved) และรายการที่รับมอบแล้ว ("กำลังใช้งาน" = borrowing)
      return r.status === 'approved' || r.status === 'borrowing';
    }
    if (tab === 'inspect') {
      // แถบ "รอตรวจสอบ": รอเจ้าหน้าที่ตรวจสอบสภาพหลังส่งคืน
      return r.status === 'return_inspect';
    }
    // แถบ "ประวัติ": เสร็จสิ้น (returned) หรือ ยกเลิก/ไม่อนุมัติ
    return r.status === 'returned' || r.status === 'cancelled' || r.status === 'rejected';
  });

  const todayStr = getBangkokDateString();

  return (
    <AppShell title="อุปกรณ์" backHref="/" maxWidth="max-w-[1000px]">
      <div className="flex flex-col gap-5">
        {/* Header Title & Description */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-heading font-bold text-ink">รายการยืม–คืนอุปกรณ์</h1>
            <p className="text-body text-ink-mute mt-0.5">
              ติดตามสถานะการรับมอบ ใช้งาน ส่งคืน และตรวจสอบสภาพอุปกรณ์พร้อมหลักฐานรูปภาพแยกตามขั้นตอน
            </p>
          </div>
          <Link href="/borrow" className="jw-btn shrink-0 self-start sm:self-auto flex items-center gap-1.5">
            <Icon name="plus" className="w-4 h-4" />
            <span>ยื่นขอยืมอุปกรณ์ใหม่</span>
          </Link>
        </div>

        {/* Success / Error Alerts */}
        {successMsg && (
          <div className="jw-card bg-brand-soft/40 border-brand/40 p-4 flex items-center justify-between gap-3 text-brand-ink text-body rounded-2xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <Icon name="check" className="w-5 h-5 text-brand shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-ink-mute hover:text-ink text-caption"
            >
              ปิด
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="jw-card bg-red-50 border-red-200 p-4 flex items-center justify-between gap-3 text-red-700 text-body rounded-2xl">
            <div className="flex items-center gap-2.5">
              <Icon name="alert-triangle" className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-red-500 hover:text-red-800 text-caption"
            >
              ปิด
            </button>
          </div>
        )}

        {/* 3 Main Tabs */}
        <Tabs<BorrowTab>
          value={tab}
          onChange={(t) => {
            setTab(t);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          options={[
            {
              value: 'borrowing',
              label: `ที่กำลังใช้งาน (${items.filter((r) => r.status === 'approved' || r.status === 'borrowing').length})`,
            },
            {
              value: 'inspect',
              label: `รอตรวจสอบ (${items.filter((r) => r.status === 'return_inspect').length})`,
            },
            {
              value: 'history',
              label: `ประวัติ (${items.filter((r) => r.status === 'returned' || r.status === 'cancelled' || r.status === 'rejected').length})`,
            },
          ]}
        />

        {/* Content Area */}
        {loading ? (
          <div className="jw-card p-12 text-center text-body text-ink-mute flex flex-col items-center justify-center gap-3">
            <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span>กำลังโหลดรายการยืม–คืนอุปกรณ์...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-soft text-ink-mute flex items-center justify-center">
              <Icon name="package" className="w-7 h-7" />
            </div>
            <b className="text-body font-semibold text-ink">ไม่มีรายการในหมวดนี้</b>
            <p className="text-caption text-ink-mute max-w-sm">
              {tab === 'borrowing'
                ? 'ไม่มีรายการที่รอรับมอบหรือกำลังใช้งานในขณะนี้'
                : tab === 'inspect'
                ? 'ไม่มีรายการที่ส่งคืนและกำลังรอเจ้าหน้าที่ตรวจสอบสภาพ'
                : 'ยังไม่มีประวัติการยืม–คืนที่เสร็จสิ้น'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((r) => {
              const eqInfo = getEquipmentInfo(r);
              const approvalDate = getApprovalDate(r);
              const isOverdue = r.returnDate < todayStr && r.status === 'borrowing';
              const isDueToday = r.returnDate === todayStr && r.status === 'borrowing';
              const eligibility = checkBorrowReceiveEligibility(r.pickupDate);

              return (
                <div
                  key={r.id}
                  className="jw-card p-5 sm:p-6 flex flex-col gap-4 border border-line hover:border-brand/30 transition-all shadow-xs"
                >
                  {/* Top Row: Equipment info & Request Number */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Equipment Photo or Icon */}
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-soft/50 border border-line-soft overflow-hidden shrink-0 flex items-center justify-center">
                        {eqInfo.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={eqInfo.photo}
                            alt={eqInfo.name}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setPreviewImage(eqInfo.photo)}
                          />
                        ) : (
                          <Icon name="package" className="w-8 h-8 text-brand" />
                        )}
                      </div>

                      {/* Equipment & Request Info */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-[17px] font-bold text-ink leading-tight truncate">
                            {eqInfo.name}
                          </b>
                          <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-soft text-ink-mute border border-line">
                            รหัส: {eqInfo.code}
                          </span>
                        </div>

                        <div className="text-[13px] text-ink-mute flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            เลขที่คำขอ: <b className="text-ink font-semibold">{r.code}</b>
                          </span>
                          <span>·</span>
                          <span>
                            ผู้ยืม: <b className="text-ink font-semibold">{r.requesterName}</b>
                          </span>
                          <span>·</span>
                          <span>
                            จำนวนรวม: <b className="text-ink font-semibold">{eqInfo.totalQty} ชิ้น</b>
                          </span>
                        </div>

                        {eqInfo.itemSummaries.length > 0 && (
                          <div className="text-[12px] text-ink-mute">
                            รายการอุปกรณ์: <span className="text-ink font-medium">{eqInfo.itemSummaries.join(', ')}</span>
                          </div>
                        )}

                        <div className="text-[12px] text-ink-mute flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                          <span>วันที่เริ่มยืม (วันรับครุภัณฑ์): <b className="text-ink">{formatThaiDate(r.pickupDate)}</b></span>
                          <span>·</span>
                          <span className={isOverdue ? 'text-danger font-semibold' : ''}>
                            วันครบกำหนดคืน: <b className={isOverdue ? 'text-danger' : 'text-ink'}>{formatThaiDate(r.returnDate)}</b>
                          </span>
                          <span>·</span>
                          <span>วันที่อนุมัติ: {formatThaiDate(approvalDate)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
                      {r.status === 'approved' && (
                        <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          รอรับมอบ
                        </span>
                      )}
                      {r.status === 'borrowing' && (
                        <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          กำลังใช้งาน
                        </span>
                      )}
                      {r.status === 'return_inspect' && (
                        <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          รอตรวจสอบ
                        </span>
                      )}
                      {r.status === 'returned' && (
                        <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          เสร็จสิ้น
                        </span>
                      )}
                      {r.status === 'rejected' && (
                        <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          ไม่อนุมัติ
                        </span>
                      )}
                      {r.status === 'cancelled' && (
                        <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                          ยกเลิกคำขอ
                        </span>
                      )}
                      {isOverdue && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-700">
                          เกินกำหนดส่งคืน
                        </span>
                      )}
                      {isDueToday && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800">
                          ครบกำหนดวันนี้
                        </span>
                      )}
                    </div>
                  </div>

                  {/* -------------------- TAB 1: ที่กำลังใช้งาน -------------------- */}
                  {tab === 'borrowing' && (
                    <div className="border-t border-line-soft pt-3.5 flex flex-col gap-3">
                      {/* กรณีที่ 1: รอรับมอบ (status === approved) — แสดงเฉพาะปุ่ม "ยืนยันรับมอบ" ยังไม่แสดงปุ่มส่งคืน */}
                      {r.status === 'approved' && (
                        <div className="flex flex-col gap-3">
                          {eligibility.allowed ? (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200">
                              <div className="text-[13px] text-amber-900 flex items-start gap-2">
                                <Icon name="check" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                  <b className="font-semibold block">เอกสารผ่านการอนุมัติครบ 3 ระดับแล้ว พร้อมรับมอบอุปกรณ์</b>
                                  <span className="text-[12px] text-amber-800">
                                    ต้องกดยืนยันรับมอบล่วงหน้าอย่างน้อย 1 วันก่อนวันรับครุภัณฑ์ (ภายในวันที่ {formatThaiDate(eligibility.lastAllowedReceiveDate)})
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiveModalTarget(r);
                                    setFormPhotos([]);
                                    setFormNote('');
                                    setModalError('');
                                  }}
                                  className="jw-btn jw-btn-sm bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5"
                                >
                                  <Icon name="check" className="w-4 h-4" />
                                  <span>ยืนยันรับมอบ</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 bg-red-50/80 p-4 rounded-2xl border border-red-200">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="text-[13px] text-red-900 flex items-start gap-2.5">
                                  <Icon name="alert-triangle" className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                  <div className="flex flex-col gap-0.5">
                                    <b className="font-bold text-red-800">
                                      ไม่สามารถกดยืนยันรับมอบได้ (เลยกำหนดยืนยันล่วงหน้า 1 วัน)
                                    </b>
                                    <span className="text-[12.5px] text-red-700">
                                      {eligibility.reason}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-auto">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRescheduleModalTarget(r);
                                      setNewPickupDate(r.pickupDate);
                                      setNewReturnDate(r.returnDate);
                                      setModalError('');
                                    }}
                                    className="jw-btn-sec jw-btn-sm border-red-300 text-red-800 hover:bg-red-100"
                                  >
                                    เลื่อนวันรับครุภัณฑ์
                                  </button>
                                  <button
                                    type="button"
                                    disabled
                                    className="jw-btn jw-btn-sm opacity-50 cursor-not-allowed flex items-center gap-1.5"
                                    title={eligibility.reason}
                                  >
                                    <Icon name="check" className="w-4 h-4" />
                                    <span>ยืนยันรับมอบ</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* กรณีที่ 2: กำลังใช้งาน (status === borrowing) — แสดงวันที่รับมอบจริงจาก DB และปุ่ม "ยืนยันส่งคืนอุปกรณ์" */}
                      {r.status === 'borrowing' && (
                        <div className="flex flex-col gap-3 bg-soft/40 p-3.5 sm:p-4 rounded-2xl border border-line-soft">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                            <div>
                              <span className="text-ink-mute">วันที่รับมอบ: </span>
                              <b className="text-ink font-semibold">
                                {r.receivedAt ? formatThaiDate(r.receivedAt) : '-'}
                              </b>
                              {r.receivedAt && (
                                <span className="text-[11.5px] text-ink-mute ml-1.5">
                                  ({formatThaiDateTime(r.receivedAt)})
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-ink-mute">กำหนดส่งคืน: </span>
                              <b className="text-ink font-semibold">
                                {formatThaiDate(r.returnDate)}
                              </b>
                            </div>
                          </div>

                          {/* รายละเอียดที่บันทึกไว้ตอนรับมอบ */}
                          {r.receiveNote && (
                            <div className="text-[13px] bg-white p-2.5 rounded-xl border border-line-soft">
                              <span className="text-ink-mute font-medium">หมายเหตุเมื่อรับมอบ: </span>
                              <span className="text-ink">{r.receiveNote}</span>
                            </div>
                          )}

                          {/* รูปภาพก่อนใช้งาน (อัปโหลดโดยผู้ยืม) */}
                          {r.receivePhotos && r.receivePhotos.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[12px] text-ink-mute font-semibold">
                                รูปภาพอุปกรณ์ก่อนใช้งาน — อัปโหลดโดยผู้ยืม ({r.receivePhotos.length} รูป):
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {r.receivePhotos.map((src, idx) => (
                                  <div
                                    key={idx}
                                    className="w-16 h-16 rounded-xl border border-line overflow-hidden cursor-pointer hover:opacity-90 transition shrink-0"
                                    onClick={() => setPreviewImage(src)}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={src}
                                      alt={`รูปก่อนใช้งาน ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ปุ่มยืนยันส่งคืนอุปกรณ์ */}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setReturnModalTarget(r);
                                setFormNote('');
                                setModalError('');
                              }}
                              className="jw-btn jw-btn-sm shrink-0 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                            >
                              <Icon name="package" className="w-4 h-4" />
                              <span>ยืนยันส่งคืนอุปกรณ์</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* -------------------- TAB 2: รอตรวจสอบ -------------------- */}
                  {tab === 'inspect' && (
                    <div className="border-t border-line-soft pt-3.5 flex flex-col gap-4">
                      {/* Notice Banner */}
                      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-purple-50 text-purple-900 border border-purple-200 text-[13px]">
                        <div className="size-2 rounded-full bg-purple-600 animate-pulse shrink-0" />
                        <span className="font-semibold">รอตรวจสอบสภาพอุปกรณ์หลังส่งคืน</span>
                        <span className="text-purple-700 hidden sm:inline">
                          — ผู้ยืมแจ้งส่งคืนแล้ว รอเจ้าหน้าที่อัปโหลดรูปภาพหลังส่งคืนและบันทึกผลตรวจสภาพ
                        </span>
                      </div>

                      {/* รายละเอียดวันที่รับมอบและวันที่ส่งคืน */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] bg-soft/30 p-3 rounded-xl border border-line-soft">
                        <div>
                          <span className="text-ink-mute">วันที่รับมอบ: </span>
                          <b className="text-ink font-semibold">
                            {r.receivedAt ? formatThaiDate(r.receivedAt) : '-'}
                          </b>
                        </div>
                        <div>
                          <span className="text-ink-mute">วันที่ผู้ยืมส่งคืน: </span>
                          <b className="text-ink font-semibold">
                            {r.returnSubmittedAt
                              ? formatThaiDateTime(r.returnSubmittedAt)
                              : r.returnRequestedAt
                              ? formatThaiDateTime(r.returnRequestedAt)
                              : '-'}
                          </b>
                        </div>
                        {r.returnNote && (
                          <div className="sm:col-span-2">
                            <span className="text-ink-mute">หมายเหตุการส่งคืนจากผู้ยืม: </span>
                            <span className="text-ink font-medium">{r.returnNote}</span>
                          </div>
                        )}
                      </div>

                      {/* แสดงรูปภาพก่อนใช้งานที่ผู้ยืมอัปโหลดไว้ เพื่อให้เจ้าหน้าที่ตรวจสอบเปรียบเทียบ */}
                      <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-line-soft bg-white">
                        <b className="text-[13px] text-ink font-semibold flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-emerald-500" />
                          รูปภาพอุปกรณ์ก่อนใช้งาน (อัปโหลดโดยผู้ยืมเมื่อรับมอบ)
                        </b>
                        {r.receiveNote && (
                          <p className="text-[12px] text-ink-mute bg-soft/60 p-2 rounded-lg">
                            หมายเหตุตอนรับมอบ: {r.receiveNote}
                          </p>
                        )}
                        {r.receivePhotos && r.receivePhotos.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {r.receivePhotos.map((src, i) => (
                              <div
                                key={i}
                                className="w-20 h-20 rounded-xl border border-line overflow-hidden cursor-pointer hover:opacity-85"
                                onClick={() => setPreviewImage(src)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={`ก่อนใช้งาน ${i + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[12px] text-ink-mute italic">ไม่มีรูปภาพก่อนใช้งาน</span>
                        )}
                      </div>

                      {/* ส่วนปฏิบัติการของเจ้าหน้าที่ (Staff / Admin Action) */}
                      {isStaffOrAdmin && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-soft/30 p-3.5 rounded-2xl border border-brand/30 mt-1">
                          <div className="text-[13px] text-brand-ink">
                            <b className="font-semibold">สำหรับเจ้าหน้าที่:</b> ตรวจสอบสภาพอุปกรณ์ อัปโหลดรูปภาพหลังส่งคืน และยืนยันผลการตรวจรับ
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setInspectModalTarget(r);
                              setInspectResult('normal');
                              setFormPhotos([]);
                              setFormNote('');
                              setModalError('');
                            }}
                            className="jw-btn jw-btn-sm shrink-0 bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5"
                          >
                            <Icon name="check" className="w-4 h-4" />
                            <span>ตรวจสอบและยืนยันรับคืน</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* -------------------- TAB 3: ประวัติ -------------------- */}
                  {tab === 'history' && (
                    <div className="border-t border-line-soft pt-3.5 flex flex-col gap-3">
                      {/* Dates Summary Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] bg-soft/40 p-3 rounded-xl border border-line-soft">
                        <div>
                          <span className="text-ink-mute block">วันที่อนุมัติ:</span>
                          <b className="text-ink font-semibold">{formatThaiDate(approvalDate)}</b>
                        </div>
                        <div>
                          <span className="text-ink-mute block">วันที่รับมอบ:</span>
                          <b className="text-ink font-semibold">
                            {r.receivedAt ? formatThaiDate(r.receivedAt) : '-'}
                          </b>
                        </div>
                        <div>
                          <span className="text-ink-mute block">วันที่ส่งคืน:</span>
                          <b className="text-ink font-semibold">
                            {r.returnSubmittedAt
                              ? formatThaiDate(r.returnSubmittedAt)
                              : r.returnedAt
                              ? formatThaiDate(r.returnedAt)
                              : '-'}
                          </b>
                        </div>
                        <div>
                          <span className="text-ink-mute block">วันที่ตรวจสอบเสร็จสิ้น:</span>
                          <b className="text-ink font-semibold">
                            {r.inspectedAt ? formatThaiDate(r.inspectedAt) : '-'}
                          </b>
                        </div>
                      </div>

                      {/* Inspection Result & Separated Photo Galleries */}
                      {r.status === 'returned' && (
                        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-white border border-line-soft">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-ink">ผลการตรวจสภาพ:</span>
                              {r.inspectResult === 'normal' || !r.inspectResult ? (
                                <span className="px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ✓ ปกติ
                                </span>
                              ) : r.inspectResult === 'damaged' ? (
                                <span className="px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                  ⚠ ชำรุด
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  ✕ อุปกรณ์ไม่ครบ
                                </span>
                              )}
                            </div>
                            {r.inspectorName && (
                              <span className="text-[12px] text-ink-mute">
                                เจ้าหน้าที่ผู้ตรวจ: <b className="text-ink">{r.inspectorName}</b>
                              </span>
                            )}
                          </div>

                          {r.inspectNote && (
                            <div className="text-[13px] text-ink bg-soft/50 p-2.5 rounded-lg border border-line-soft">
                              <b className="text-ink-mute font-medium">บันทึกผลการตรวจของเจ้าหน้าที่: </b>
                              {r.inspectNote}
                            </div>
                          )}

                          {/* เปรียบเทียบรูปภาพ 2 ประเภทที่จัดเก็บแยกกันอย่างชัดเจน */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {/* ประเภทที่ 1: รูปภาพก่อนใช้งาน (ผู้ยืม) */}
                            <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col gap-2">
                              <span className="text-[12px] font-bold text-ink flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-emerald-500" />
                                1. รูปภาพก่อนใช้งาน — อัปโหลดโดยผู้ยืม ({(r.receivePhotos || []).length} รูป)
                              </span>
                              {(r.receivePhotos || []).length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {(r.receivePhotos || []).map((src, i) => (
                                    <div
                                      key={`rec-${i}`}
                                      className="relative w-16 h-16 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-85"
                                      onClick={() => setPreviewImage(src)}
                                      title="รูปภาพก่อนใช้งาน (ผู้ยืม)"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={src} alt="ก่อนใช้งาน" className="w-full h-full object-cover" />
                                      <span className="absolute bottom-0 inset-x-0 bg-emerald-900/75 text-white text-[9px] text-center">
                                        ก่อนใช้งาน
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[12px] text-ink-mute italic">ไม่มีรูปภาพ</span>
                              )}
                            </div>

                            {/* ประเภทที่ 2: รูปภาพหลังส่งคืน (เจ้าหน้าที่) */}
                            <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col gap-2">
                              <span className="text-[12px] font-bold text-ink flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-blue-600" />
                                2. รูปภาพหลังส่งคืน — อัปโหลดโดยเจ้าหน้าที่ ({(r.inspectPhotos || []).length} รูป)
                              </span>
                              {(r.inspectPhotos || []).length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {(r.inspectPhotos || []).map((src, i) => (
                                    <div
                                      key={`ins-${i}`}
                                      className="relative w-16 h-16 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-85"
                                      onClick={() => setPreviewImage(src)}
                                      title="รูปภาพหลังส่งคืน (เจ้าหน้าที่)"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={src} alt="หลังส่งคืน" className="w-full h-full object-cover" />
                                      <span className="absolute bottom-0 inset-x-0 bg-blue-900/75 text-white text-[9px] text-center">
                                        หลังส่งคืน
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[12px] text-ink-mute italic">ไม่มีรูปภาพ</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Request Detail Link */}
                  <div className="flex justify-end pt-1">
                    <Link
                      href={`/requests/${r.id}`}
                      className="text-[13px] text-brand hover:text-brand-hover font-semibold flex items-center gap-1"
                    >
                      <span>ดูรายละเอียดคำขอและไทม์ไลน์</span>
                      <Icon name="chevron-right" className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Hidden input for replacing a single photo */}
        <input
          ref={replaceInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleReplaceFile}
          className="hidden"
        />

        {/* Footer info tip */}
        <p className="text-[13px] text-ink-mute flex items-center gap-2 mt-2">
          <Icon name="bell" className="w-4 h-4 text-brand shrink-0" />
          <span>ระบบแจ้งเตือนผ่าน LINE ล่วงหน้า 1 วันก่อนครบกำหนดคืนอุปกรณ์</span>
        </p>
      </div>

      {/* ==================== MODAL 1: ยืนยันรับมอบอุปกรณ์ (ผู้ยืมอัปโหลดรูปก่อนใช้งาน) ==================== */}
      {receiveModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-ink">ยืนยันรับมอบอุปกรณ์</h3>
                  <p className="text-[12px] text-ink-mute">
                    คำขอ {receiveModalTarget.code} · วันรับครุภัณฑ์ {formatThaiDate(receiveModalTarget.pickupDate)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* 1. ข้อมูลอุปกรณ์ที่รับมอบ */}
            <div className="bg-soft/40 p-3.5 rounded-2xl border border-line-soft text-[13px] flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-ink-mute">รายการอุปกรณ์:</span>
                <b className="text-ink">{getEquipmentInfo(receiveModalTarget).name}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">จำนวนรวม:</span>
                <b className="text-ink">{getEquipmentInfo(receiveModalTarget).totalQty} ชิ้น</b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">กำหนดส่งคืน:</span>
                <b className="text-ink">{formatThaiDate(receiveModalTarget.returnDate)}</b>
              </div>
            </div>

            {/* 2. อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนใช้งาน */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-ink">
                  อัปโหลดรูปภาพอุปกรณ์ก่อนใช้งาน <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-ink-mute">
                  ({formPhotos.length}/6 รูป · JPG, PNG, WEBP)
                </span>
              </div>
              <p className="text-[12px] text-ink-mute">
                ถ่ายภาพสภาพอุปกรณ์ทุกมุมเพื่อใช้เป็นหลักฐานก่อนใช้งาน (คลิกที่รูปเพื่อดูภาพขยาย กดปุ่มเปลี่ยนรูปหรือลบรูปได้ก่อนบันทึก)
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {formPhotos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-24 h-24 rounded-2xl overflow-hidden border border-line group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`รูปก่อนใช้งาน ${i + 1}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewImage(src)}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      title="ลบรูปนี้"
                      className="w-6 h-6 rounded-full bg-black/75 text-white absolute top-1 right-1 flex items-center justify-center text-[11px] hover:bg-red-600 transition"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplaceIndex(i);
                        replaceInputRef.current?.click();
                      }}
                      className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[10px] py-0.5 text-center hover:bg-brand transition"
                    >
                      เปลี่ยนรูป
                    </button>
                  </div>
                ))}

                {formPhotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-2xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center gap-1 text-[11px] text-ink-mute hover:text-brand transition bg-soft/40"
                  >
                    <Icon name="upload" className="w-5 h-5" />
                    <span>เพิ่มรูปภาพ</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple
                onChange={handleSelectFiles}
                className="hidden"
              />
            </div>

            {/* 3. ช่องหมายเหตุจากผู้ยืม */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-ink">
                หมายเหตุสภาพอุปกรณ์ก่อนใช้งาน (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="เช่น ทดสอบเปิดติดปกติ อุปกรณ์เสริมครบถ้วน หรือระบุรอยตำหนิเดิมก่อนใช้งาน..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="jw-in text-[13px] rounded-2xl p-3 resize-none"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12.5px] flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                disabled={submitting}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={submitting || formPhotos.length === 0}
                className="jw-btn jw-btn-sm bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="check" className="w-4 h-4" />
                )}
                <span>บันทึกและยืนยันรับมอบ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: ยืนยันส่งคืนอุปกรณ์ (ผู้ยืมไม่ต้องอัปโหลดรูปภาพ) ==================== */}
      {returnModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Icon name="package" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-ink">ยืนยันส่งคืนอุปกรณ์</h3>
                  <p className="text-[12px] text-ink-mute">
                    คำขอ {returnModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* 1. ข้อมูลอุปกรณ์ที่ส่งคืน */}
            <div className="bg-soft/40 p-4 rounded-2xl border border-line-soft flex flex-col gap-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-mute">อุปกรณ์ที่ส่งคืน:</span>
                <b className="text-ink font-semibold">
                  {getEquipmentInfo(returnModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">จำนวน:</span>
                <b className="text-ink">
                  {getEquipmentInfo(returnModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">วันที่รับมอบ:</span>
                <span className="text-ink font-semibold">
                  {returnModalTarget.receivedAt
                    ? formatThaiDate(returnModalTarget.receivedAt)
                    : '-'}
                </span>
              </div>
            </div>

            {/* 2. ช่องหมายเหตุการส่งคืน (ไม่มีช่องอัปโหลดรูปของฝั่งผู้ยืมตามข้อกำหนด) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-ink">
                หมายเหตุการส่งคืน (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="ระบุหมายเหตุการส่งคืน เช่น ส่งคืนที่ห้องพัสดุครบถ้วน หรือแจ้งอาการผิดปกติให้เจ้าหน้าที่ทราบ..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="jw-in text-[13px] rounded-2xl p-3 resize-none"
              />
            </div>

            {/* Notice info */}
            <p className="text-[12px] text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
              * เมื่อกดยืนยันส่งคืน สถานะจะเปลี่ยนเป็น &quot;รอตรวจสอบ&quot; โดยเจ้าหน้าที่ผู้รับผิดชอบจะเป็นผู้ถ่ายภาพอุปกรณ์หลังส่งคืนและบันทึกผลการตรวจสภาพ
            </p>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12.5px] flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                disabled={submitting}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={submitting}
                className="jw-btn jw-btn-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="package" className="w-4 h-4" />
                )}
                <span>ยืนยันส่งคืนอุปกรณ์</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: เจ้าหน้าที่ตรวจสอบอุปกรณ์หลังส่งคืน ==================== */}
      {inspectModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-ink">ตรวจสอบอุปกรณ์หลังส่งคืน (เจ้าหน้าที่)</h3>
                  <p className="text-[12px] text-ink-mute">
                    คำขอ {inspectModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* สรุปข้อมูลผู้ยืมและวันที่รับมอบ/ส่งคืน */}
            <div className="bg-soft/40 p-3.5 rounded-2xl border border-line-soft text-[13px] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div>
                <span className="text-ink-mute">ผู้ยืม: </span>
                <b className="text-ink">{inspectModalTarget.requesterName}</b>
              </div>
              <div>
                <span className="text-ink-mute">อุปกรณ์: </span>
                <b className="text-ink">{getEquipmentInfo(inspectModalTarget).name}</b>
              </div>
              <div>
                <span className="text-ink-mute">วันที่รับมอบจริง: </span>
                <b className="text-ink">
                  {inspectModalTarget.receivedAt ? formatThaiDate(inspectModalTarget.receivedAt) : '-'}
                </b>
              </div>
              <div>
                <span className="text-ink-mute">วันที่ส่งคืน: </span>
                <b className="text-ink">
                  {inspectModalTarget.returnSubmittedAt
                    ? formatThaiDate(inspectModalTarget.returnSubmittedAt)
                    : '-'}
                </b>
              </div>
              {inspectModalTarget.returnNote && (
                <div className="sm:col-span-2">
                  <span className="text-ink-mute">หมายเหตุการส่งคืนจากผู้ยืม: </span>
                  <span className="text-ink">{inspectModalTarget.returnNote}</span>
                </div>
              )}
            </div>

            {/* เปรียบเทียบรูปภาพก่อนใช้งาน vs รูปภาพหลังส่งคืน */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* รูปก่อนใช้งานของผู้ยืม */}
              <div className="p-3 rounded-2xl border border-line bg-canvas flex flex-col gap-2">
                <b className="text-[12.5px] text-ink flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  รูปภาพก่อนใช้งาน (ผู้ยืมอัปโหลด)
                </b>
                {(inspectModalTarget.receivePhotos || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(inspectModalTarget.receivePhotos || []).map((src, i) => (
                      <div
                        key={i}
                        className="w-16 h-16 rounded-xl border border-line overflow-hidden cursor-pointer hover:opacity-85"
                        onClick={() => setPreviewImage(src)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="ก่อนใช้งาน" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[12px] text-ink-mute italic">ไม่มีรูปภาพก่อนใช้งาน</span>
                )}
              </div>

              {/* อัปโหลดรูปภาพหลังส่งคืนโดยเจ้าหน้าที่ */}
              <div className="p-3 rounded-2xl border border-brand/40 bg-brand-soft/15 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <b className="text-[12.5px] text-ink flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-blue-600" />
                    รูปภาพหลังส่งคืน (เจ้าหน้าที่) <span className="text-red-500">*</span>
                  </b>
                  <span className="text-[11px] text-ink-mute">({formPhotos.length}/6)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formPhotos.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-line group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt="รูปหลังส่งคืน"
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewImage(src)}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="w-5 h-5 rounded-full bg-black/75 text-white absolute top-0.5 right-0.5 flex items-center justify-center text-[10px]"
                      >
                        <Icon name="x" className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplaceIndex(i);
                          replaceInputRef.current?.click();
                        }}
                        className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] text-center"
                      >
                        เปลี่ยน
                      </button>
                    </div>
                  ))}
                  {formPhotos.length < 6 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-brand/50 hover:border-brand flex flex-col items-center justify-center text-[10.5px] text-brand font-semibold transition bg-white"
                    >
                      <Icon name="upload" className="w-4 h-4" />
                      <span>เพิ่มรูป</span>
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleSelectFiles}
                  className="hidden"
                />
              </div>
            </div>

            {/* ผลการตรวจสอบสภาพ */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-ink">
                สถานะผลการตรวจสอบ <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectResult('normal')}
                  className={`p-3 rounded-2xl text-[13px] font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'normal'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-soft/50 text-ink-mute border-line hover:border-line-hover'
                  }`}
                >
                  <Icon name="check" className="w-4 h-4 text-emerald-600" />
                  <span>ปกติ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('damaged')}
                  className={`p-3 rounded-2xl text-[13px] font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'damaged'
                      ? 'bg-red-50 text-red-800 border-red-500 ring-2 ring-red-500/20'
                      : 'bg-soft/50 text-ink-mute border-line hover:border-line-hover'
                  }`}
                >
                  <Icon name="alert-triangle" className="w-4 h-4 text-red-600" />
                  <span>ชำรุด</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('incomplete')}
                  className={`p-3 rounded-2xl text-[13px] font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'incomplete'
                      ? 'bg-amber-50 text-amber-900 border-amber-500 ring-2 ring-amber-500/20'
                      : 'bg-soft/50 text-ink-mute border-line hover:border-line-hover'
                  }`}
                >
                  <Icon name="x" className="w-4 h-4 text-amber-600" />
                  <span>อุปกรณ์ไม่ครบ</span>
                </button>
              </div>
            </div>

            {/* หมายเหตุ / ระบุความเสียหาย */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-ink">
                หมายเหตุ / รายละเอียดความเสียหาย{' '}
                {(inspectResult === 'damaged' || inspectResult === 'incomplete') && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <textarea
                rows={3}
                placeholder="ระบุผลการตรวจสภาพอุปกรณ์หลังส่งคืน หรือรายละเอียดความเสียหาย/รายการที่ไม่ครบ..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="jw-in text-[13px] rounded-2xl p-3 resize-none"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12.5px] flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                disabled={submitting}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmInspect}
                disabled={submitting || formPhotos.length === 0}
                className="jw-btn jw-btn-sm bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="check" className="w-4 h-4" />
                )}
                <span>ยืนยันการตรวจสอบเสร็จสิ้น</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 4: เลื่อนวันรับครุภัณฑ์ (คำนวณสิทธิ์รับมอบใหม่อัตโนมัติ) ==================== */}
      {rescheduleModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div>
                <h3 className="text-[16px] font-bold text-ink">แก้ไข/เลื่อนวันรับครุภัณฑ์</h3>
                <p className="text-[12px] text-ink-mute">คำขอ {rescheduleModalTarget.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12.5px] text-ink-mute">
              ผู้ยืมต้องยืนยันรับมอบอย่างน้อย 1 วันก่อนวันรับครุภัณฑ์ หากเลือกวันรับครุภัณฑ์เป็นวันพรุ่งนี้เป็นต้นไป ระบบจะเปิดให้กดยืนยันรับมอบได้ทันที
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="jw-lbl">วันรับครุภัณฑ์ใหม่ *</label>
                <input
                  type="date"
                  value={newPickupDate}
                  onChange={(e) => {
                    setNewPickupDate(e.target.value);
                    if (newReturnDate < e.target.value) {
                      setNewReturnDate(e.target.value);
                    }
                  }}
                  className="jw-in"
                />
              </div>
              <div>
                <label className="jw-lbl">วันครบกำหนดคืนใหม่ *</label>
                <input
                  type="date"
                  value={newReturnDate}
                  min={newPickupDate}
                  onChange={(e) => setNewReturnDate(e.target.value)}
                  className="jw-in"
                />
              </div>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12.5px]">
                {modalError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setRescheduleModalTarget(null)}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                disabled={submitting}
                className="jw-btn jw-btn-sm"
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกวันรับครุภัณฑ์ใหม่'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== IMAGE PREVIEW MODAL ==================== */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="ดูรูปภาพขนาดใหญ่"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-white/80 flex items-center gap-1 text-[13px]"
            >
              <Icon name="x" className="w-5 h-5" />
              <span>ปิดหน้าต่าง</span>
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
