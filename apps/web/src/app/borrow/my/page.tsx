'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const INITIAL_VISIBLE_COUNT = 8;

export default function MyBorrowsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState<ExtendedBorrowRequest[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [tab, setTab] = useState<BorrowTab>('borrowing');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_VISIBLE_COUNT);
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
  const detailPaneRef = useRef<HTMLElement>(null);

  const isStaffOrAdmin =
    account?.role === 'STAFF' || account?.role === 'ADMIN' || Boolean(account?.permissions?.review);

  // Load equipment & borrow requests from real API
  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [eqs, reqs] = await Promise.all([
        api.equipment().catch(() => [] as Equipment[]),
        api.listRequests({ mine: true, type: 'borrow' }),
      ]);
      setEquipmentList(eqs);
      const borrowReqs = (reqs as ExtendedBorrowRequest[]) || [];
      setItems(borrowReqs);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'ไม่สามารถดึงข้อมูลรายการยืม–คืนอุปกรณ์ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, account?.id]);

  // Helper to find equipment metadata
  const getEquipmentInfo = useCallback(
    (r: ExtendedBorrowRequest) => {
      const firstItem = r.items?.[0];
      const eq = equipmentList.find((e) => e.id === firstItem?.equipmentId);
      const totalQty = r.items?.reduce((sum, i) => sum + (i.qty || 0), 0) || 1;
      const baseName = eq?.name || r.title || 'อุปกรณ์';
      const extraCount = Math.max(0, (r.items?.length || 1) - 1);
      const name = extraCount > 0 ? `${baseName} และอุปกรณ์อื่น` : baseName;
      const code = eq?.id || firstItem?.equipmentId || '-';
      const photo = eq?.images?.[0] || null;
      const itemSummaries = (r.items || []).map((it) => {
        const found = equipmentList.find((e) => e.id === it.equipmentId);
        return `${found?.name || it.equipmentId} (${it.qty} ชิ้น)`;
      });
      return { name, baseName, code, totalQty, photo, itemSummaries };
    },
    [equipmentList],
  );

  // Helper to extract approval date
  const getApprovalDate = (r: ExtendedBorrowRequest) => {
    const l2Sig = r.signatures?.find((s) => s.decision === 'approve' && s.level === 'l2');
    const l1Sig = r.signatures?.find((s) => s.decision === 'approve' && s.level === 'l1');
    const staffSig = r.signatures?.find((s) => s.decision === 'approve' && s.level === 'staff');
    return l2Sig?.at || l1Sig?.at || staffSig?.at || r.updatedAt;
  };

  // Counts per tab
  const borrowingItems = useMemo(
    () => items.filter((r) => r.status === 'approved' || r.status === 'borrowing'),
    [items],
  );
  const inspectItems = useMemo(
    () => items.filter((r) => r.status === 'return_inspect'),
    [items],
  );
  const historyItems = useMemo(
    () =>
      items.filter(
        (r) => r.status === 'returned' || r.status === 'cancelled' || r.status === 'rejected',
      ),
    [items],
  );

  // Auto-switch to a populated tab on initial load if "borrowing" is empty
  const hasAutoSelectedTab = useRef(false);
  useEffect(() => {
    if (!loading && !hasAutoSelectedTab.current && items.length > 0) {
      hasAutoSelectedTab.current = true;
      if (borrowingItems.length > 0) {
        setTab('borrowing');
      } else if (inspectItems.length > 0) {
        setTab('inspect');
      } else if (historyItems.length > 0) {
        setTab('history');
      }
    }
  }, [loading, items.length, borrowingItems.length, inspectItems.length, historyItems.length]);

  // Filter items by active tab and search query
  const tabFiltered = useMemo(() => {
    if (tab === 'borrowing') return borrowingItems;
    if (tab === 'inspect') return inspectItems;
    return historyItems;
  }, [tab, borrowingItems, inspectItems, historyItems]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((r) => {
      const eqInfo = getEquipmentInfo(r);
      return (
        r.code.toLowerCase().includes(q) ||
        eqInfo.name.toLowerCase().includes(q) ||
        eqInfo.code.toLowerCase().includes(q) ||
        eqInfo.itemSummaries.join(' ').toLowerCase().includes(q) ||
        (r.requesterName || '').toLowerCase().includes(q)
      );
    });
  }, [tabFiltered, searchQuery, getEquipmentInfo]);

  // Maintain selected item when tab or filtered list changes
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedRequest = useMemo(
    () => filtered.find((r) => r.id === selectedId) || filtered[0] || null,
    [filtered, selectedId],
  );

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

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
      const targetId = receiveModalTarget.id;
      await api.receiveEquipment(targetId, {
        photos: formPhotos,
        note: formNote.trim(),
      });
      setSuccessMsg('ยืนยันรับมอบอุปกรณ์เรียบร้อยแล้ว บันทึกวันที่รับมอบจริงและเปลี่ยนสถานะเป็น "กำลังใช้งาน"');
      setReceiveModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      setSelectedId(targetId);
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
      const targetId = returnModalTarget.id;
      await api.submitReturnEquipment(targetId, {
        note: formNote.trim(),
      });
      setSuccessMsg('ยืนยันส่งคืนอุปกรณ์เรียบร้อยแล้ว รายการย้ายไปที่หมวด "รอตรวจสอบ" เพื่อให้เจ้าหน้าที่ตรวจสภาพ');
      setReturnModalTarget(null);
      setFormNote('');
      setTab('inspect');
      setSelectedId(targetId);
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
      const targetId = inspectModalTarget.id;
      await api.inspectReturnEquipment(targetId, {
        result: inspectResult,
        note: formNote.trim(),
        photos: formPhotos,
      });
      setSuccessMsg('บันทึกผลการตรวจสอบและรูปภาพหลังส่งคืนเรียบร้อยแล้ว สถานะเปลี่ยนเป็น "เสร็จสิ้น" และย้ายไปที่หมวด "ประวัติ"');
      setInspectModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      setTab('history');
      setSelectedId(targetId);
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
      const targetId = rescheduleModalTarget.id;
      await api.reschedule(targetId, {
        pickupDate: newPickupDate,
        returnDate: newReturnDate,
      });
      setSuccessMsg(
        `แก้ไขวันรับครุภัณฑ์เป็น ${formatThaiDate(newPickupDate)} เรียบร้อยแล้ว ระบบคำนวณสิทธิ์การกดยืนยันรับมอบใหม่อัตโนมัติ`,
      );
      setRescheduleModalTarget(null);
      setSelectedId(targetId);
      await load();
    } catch (err: unknown) {
      setModalError((err as Error).message || 'ไม่สามารถเลื่อนวันรับครุภัณฑ์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (status: ExtendedBorrowRequest['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
            รอรับมอบ
          </span>
        );
      case 'borrowing':
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
            กำลังใช้งาน
          </span>
        );
      case 'return_inspect':
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
            รอตรวจสอบ
          </span>
        );
      case 'returned':
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-[#E6F4EC] text-[#0F6B4C] border border-[#BFE3CF] shrink-0">
            เสร็จสิ้น
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-red-50 text-red-700 border border-red-200 shrink-0">
            ไม่อนุมัติ
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-slate-100 text-slate-600 border border-slate-300 shrink-0">
            ยกเลิกคำขอ
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
            รอดำเนินการ
          </span>
        );
    }
  };

  const todayStr = getBangkokDateString();

  return (
    <AppShell title="รายการยืม–คืนอุปกรณ์" backHref="/" maxWidth="max-w-none">
      <div className="flex flex-col gap-6 pb-8 text-[#0F172A] w-full">
        {/* ==================== PAGE HEADER (from borrow-split.html) ==================== */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] leading-[28px] font-semibold text-[#0F172A] m-0">
              รายการยืม–คืนอุปกรณ์
            </h1>
            <p className="text-[14px] leading-[20px] font-normal text-[#475569] mt-1">
              ติดตามสถานะและหลักฐานรูปภาพของแต่ละคำขอ เลือกรายการทางซ้ายเพื่อดูรายละเอียด
            </p>
          </div>
          <Link
            href="/borrow"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[16px] leading-[24px] font-semibold transition hover:opacity-90 hover:-translate-y-px active:scale-[0.98]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 256 256"
              fill="none"
              stroke="currentColor"
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M40 128h176M128 40v176" />
            </svg>
            <span>ยื่นขอยืมอุปกรณ์ใหม่</span>
          </Link>
        </div>

        {/* ==================== ALERTS (Success / Error) ==================== */}
        {successMsg && (
          <div className="bg-[#E6F4EC] border border-[#BFE3CF] rounded-[16px] p-4 flex items-center justify-between gap-3 text-[#0F6B4C] text-[14px] leading-[20px]">
            <div className="flex items-center gap-2.5">
              <Icon name="check" className="w-5 h-5 text-[#0F6B4C] shrink-0" />
              <span className="font-medium">{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-[#0F6B4C]/80 hover:text-[#0F6B4C] text-[12px] font-semibold px-2 py-1 rounded-[6px] hover:bg-white/50 transition"
            >
              ปิด
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-[16px] p-4 flex items-center justify-between gap-3 text-red-700 text-[14px] leading-[20px]">
            <div className="flex items-center gap-2.5">
              <Icon name="alert-triangle" className="w-5 h-5 text-red-600 shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={load}
                className="text-red-700 hover:bg-red-100 text-[12px] font-semibold px-2.5 py-1 rounded-[6px] border border-red-200 transition"
              >
                ลองใหม่
              </button>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                className="text-red-500 hover:text-red-800 text-[12px] font-semibold px-2 py-1"
              >
                ปิด
              </button>
            </div>
          </div>
        )}

        {/* ==================== MASTER–DETAIL SPLIT GRID (from borrow-split.html) ==================== */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] gap-6 items-start">
          {/* -------------------- LEFT COLUMN: MASTER LIST -------------------- */}
          <section className="flex flex-col gap-3 min-w-0">
            {/* 3 Category Pill Tabs */}
            <nav className="flex flex-wrap gap-1" aria-label="หมวดหมู่รายการยืมและคืนอุปกรณ์">
              <button
                type="button"
                onClick={() => {
                  setTab('borrowing');
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`px-3 py-2 rounded-[8px] text-[14px] leading-[20px] font-medium transition-colors ${
                  tab === 'borrowing'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
              >
                ที่กำลังใช้งาน ({borrowingItems.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('inspect');
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`px-3 py-2 rounded-[8px] text-[14px] leading-[20px] font-medium transition-colors ${
                  tab === 'inspect'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
              >
                รอตรวจสอบ ({inspectItems.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('history');
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`px-3 py-2 rounded-[8px] text-[14px] leading-[20px] font-medium transition-colors ${
                  tab === 'history'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9]'
                }`}
              >
                ประวัติ ({historyItems.length})
              </button>
            </nav>

            {/* Search Input Card */}
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] px-3 py-2 flex items-center gap-2 text-[#475569] focus-within:border-[#0F6B4C] transition-colors">
              <svg
                width="18"
                height="18"
                viewBox="0 0 256 256"
                fill="none"
                stroke="currentColor"
                strokeWidth="16"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M112 40a72 72 0 100 144 72 72 0 000-144zM168 168l48 48" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                placeholder="ค้นหาเลขที่คำขอหรือชื่ออุปกรณ์"
                aria-label="ค้นหาเลขที่คำขอหรือชื่ออุปกรณ์"
                className="w-full bg-transparent border-none outline-none text-[14px] leading-[20px] text-[#0F172A] placeholder:text-[#475569]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[#475569] hover:text-[#0F172A] p-0.5 rounded-full"
                  aria-label="ล้างคำค้นหา"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Master List Rows */}
            {loading ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-8 text-center flex flex-col items-center justify-center gap-3 text-[#475569]">
                <div className="size-6 border-2 border-[#0F6B4C] border-t-transparent rounded-full animate-spin" />
                <span className="text-[14px] leading-[20px]">กำลังโหลดรายการ...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-8 text-center flex flex-col items-center justify-center gap-2 text-[#475569]">
                <span className="w-10 h-10 rounded-[8px] bg-[#F1F5F9] text-[#475569] flex items-center justify-center">
                  <Icon name="package" className="w-5 h-5" />
                </span>
                <span className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                  {searchQuery ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีรายการในหมวดนี้'}
                </span>
                <span className="text-[12px] leading-[16px] text-[#475569]">
                  {searchQuery
                    ? 'ลองเปลี่ยนคำค้นหาหรือตรวจสอบในหมวดอื่น'
                    : tab === 'borrowing'
                    ? 'ยังไม่มีคำขอยืมที่รอรับมอบหรือกำลังใช้งาน'
                    : tab === 'inspect'
                    ? 'ไม่มีรายการที่กำลังรอเจ้าหน้าที่ตรวจสอบสภาพ'
                    : 'ยังไม่มีประวัติการยืม–คืนที่เสร็จสิ้น'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {visibleItems.map((r, idx) => {
                  const eqInfo = getEquipmentInfo(r);
                  const isSelected = selectedRequest?.id === r.id;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(r.id);
                        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                          detailPaneRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          });
                        }
                      }}
                      className={`w-full text-left flex items-center gap-3 p-3 rounded-[12px] border transition-colors ${
                        isSelected
                          ? 'bg-white border-[#0F6B4C] shadow-xs'
                          : 'border-transparent hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {/* Icon Box (40x40px rounded-8px #F1F5F9) */}
                      <span className="w-10 h-10 rounded-[8px] bg-[#F1F5F9] text-[#475569] flex items-center justify-center shrink-0 overflow-hidden">
                        {idx % 2 === 0 ? (
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 256 256"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="16"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M226 80a56 56 0 01-70 54L80 210a24 24 0 01-34-34l76-76a56 56 0 0154-70l-34 34 8 24 24 8z" />
                          </svg>
                        ) : (
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 256 256"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="16"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M40 216V72l88-48 88 48v144M24 216h208M96 216v-48h64v48" />
                          </svg>
                        )}
                      </span>

                      {/* Title & Code · Date */}
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-[16px] leading-[24px] font-medium text-[#0F172A] truncate">
                          {eqInfo.name}
                        </span>
                        <span className="text-[14px] leading-[20px] font-normal text-[#475569] truncate">
                          {r.code} · {formatThaiDate(r.pickupDate)}
                        </span>
                      </span>

                      {/* Status Badge */}
                      {renderStatusBadge(r.status)}
                    </button>
                  );
                })}

                {/* Expand More Button (from borrow-split.html) */}
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 10)}
                    className="w-full flex items-center justify-center p-3 rounded-[12px] border border-transparent hover:bg-[#F1F5F9] text-[14px] leading-[20px] font-medium text-[#475569] transition-colors"
                  >
                    แสดงอีก {filtered.length - visibleCount} รายการ
                  </button>
                )}
              </div>
            )}
          </section>

          {/* -------------------- RIGHT COLUMN: DETAIL VIEW CARD -------------------- */}
          <article
            ref={detailPaneRef}
            className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 sm:p-8 flex flex-col gap-6 min-w-0"
          >
            {loading ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-[#475569]">
                <div className="size-7 border-2 border-[#0F6B4C] border-t-transparent rounded-full animate-spin" />
                <span className="text-[14px] leading-[20px]">
                  กำลังโหลดรายละเอียดคำขอยืม–คืนอุปกรณ์...
                </span>
              </div>
            ) : !selectedRequest ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-[#475569]">
                <div className="w-12 h-12 rounded-[12px] bg-[#F1F5F9] text-[#475569] flex items-center justify-center">
                  <Icon name="package" className="w-6 h-6" />
                </div>
                <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                  เลือกรายการทางซ้ายเพื่อดูรายละเอียด
                </div>
                <p className="text-[14px] leading-[20px] text-[#475569] max-w-md">
                  เมื่อมีรายการยืม–คืนในหมวดที่เลือก รายละเอียดของคำขอ ไทม์ไลน์สถานะ และรูปภาพเปรียบเทียบก่อน–หลังใช้งานจะแสดงในพื้นที่นี้
                </p>
              </div>
            ) : (
              (() => {
                const eqInfo = getEquipmentInfo(selectedRequest);
                const approvalDate = getApprovalDate(selectedRequest);
                const isOverdue =
                  selectedRequest.returnDate < todayStr && selectedRequest.status === 'borrowing';
                const isDueToday =
                  selectedRequest.returnDate === todayStr && selectedRequest.status === 'borrowing';
                const eligibility = checkBorrowReceiveEligibility(selectedRequest.pickupDate);

                const isStepApproved =
                  selectedRequest.status === 'approved' ||
                  selectedRequest.status === 'borrowing' ||
                  selectedRequest.status === 'return_inspect' ||
                  selectedRequest.status === 'returned';
                const isStepReceived = Boolean(selectedRequest.receivedAt);
                const returnDateTimestamp =
                  selectedRequest.returnSubmittedAt ||
                  selectedRequest.returnRequestedAt ||
                  selectedRequest.returnedAt;
                const isStepReturned =
                  Boolean(returnDateTimestamp) ||
                  selectedRequest.status === 'return_inspect' ||
                  selectedRequest.status === 'returned';
                const isStepInspected =
                  Boolean(selectedRequest.inspectedAt) || selectedRequest.status === 'returned';

                const receivePhotos = selectedRequest.receivePhotos || [];
                const inspectPhotos = selectedRequest.inspectPhotos || [];

                return (
                  <>
                    {/* 1. Detail Header */}
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <h2 className="text-[24px] leading-[32px] font-semibold text-[#0F172A] m-0">
                          {eqInfo.name}
                        </h2>
                        <div className="text-[14px] leading-[20px] font-normal text-[#475569] mt-0.5">
                          เลขที่คำขอ {selectedRequest.code} · รหัส {eqInfo.code}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOverdue && (
                          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-red-100 text-red-700 border border-red-200">
                            เกินกำหนดส่งคืน
                          </span>
                        )}
                        {isDueToday && (
                          <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                            ครบกำหนดคืนวันนี้
                          </span>
                        )}
                        {renderStatusBadge(selectedRequest.status)}
                      </div>
                    </div>

                    {/* 2. Two-Column Grid: Metadata (Left) + Vertical 4-Step Timeline (Right) */}
                    <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
                      {/* Left Sub-grid: Borrow Metadata */}
                      <div className="grid grid-cols-2 gap-y-6 gap-x-4 content-start">
                        <div>
                          <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                            ผู้ยืม
                          </div>
                          <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                            {selectedRequest.requesterName}
                          </div>
                        </div>
                        <div>
                          <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                            จำนวนรวม
                          </div>
                          <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                            {eqInfo.totalQty} ชิ้น
                          </div>
                        </div>
                        <div>
                          <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                            วันที่เริ่มยืม
                          </div>
                          <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                            {formatThaiDate(selectedRequest.pickupDate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                            วันครบกำหนดคืน
                          </div>
                          <div
                            className={`text-[16px] leading-[24px] font-medium ${
                              isOverdue ? 'text-red-600' : 'text-[#0F172A]'
                            }`}
                          >
                            {formatThaiDate(selectedRequest.returnDate)}
                          </div>
                        </div>
                        {selectedRequest.receivedAt && (
                          <div>
                            <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              วันที่รับมอบจริง
                            </div>
                            <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                              {formatThaiDate(selectedRequest.receivedAt)}
                            </div>
                          </div>
                        )}
                        {returnDateTimestamp && (
                          <div>
                            <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              วันที่ส่งคืน
                            </div>
                            <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                              {formatThaiDate(returnDateTimestamp)}
                            </div>
                          </div>
                        )}
                        <div className="col-span-2">
                          <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                            รายการอุปกรณ์
                          </div>
                          <div className="text-[16px] leading-[24px] font-medium text-[#0F172A]">
                            {eqInfo.itemSummaries.length > 0
                              ? eqInfo.itemSummaries.join(', ')
                              : `${eqInfo.name} (${eqInfo.totalQty} ชิ้น)`}
                          </div>
                        </div>
                      </div>

                      {/* Right Sub-grid: Vertical 4-Step Stepper (from borrow-split.html) */}
                      <div className="flex flex-col">
                        {/* Step 1: อนุมัติคำขอ */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${
                                isStepApproved ? 'bg-[#0F6B4C]' : 'bg-[#CBD5E1]'
                              }`}
                            >
                              {isStepApproved && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="16"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-[#E2E8F0] min-h-[16px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                              อนุมัติคำขอ
                            </div>
                            <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              {isStepApproved ? formatThaiDate(approvalDate) : 'รออนุมัติ'}
                            </div>
                          </div>
                        </div>

                        {/* Step 2: รับมอบอุปกรณ์ */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${
                                isStepReceived ? 'bg-[#0F6B4C]' : 'bg-[#CBD5E1]'
                              }`}
                            >
                              {isStepReceived && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="16"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-[#E2E8F0] min-h-[16px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                              รับมอบอุปกรณ์
                            </div>
                            <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              {selectedRequest.receivedAt
                                ? formatThaiDate(selectedRequest.receivedAt)
                                : selectedRequest.status === 'approved'
                                ? 'รอผู้ยืมยืนยันรับมอบ'
                                : 'ไม่มีบันทึก'}
                            </div>
                          </div>
                        </div>

                        {/* Step 3: ส่งคืนอุปกรณ์ */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${
                                isStepReturned ? 'bg-[#0F6B4C]' : 'bg-[#CBD5E1]'
                              }`}
                            >
                              {isStepReturned && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="16"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-[#E2E8F0] min-h-[16px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                              ส่งคืนอุปกรณ์
                            </div>
                            <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              {returnDateTimestamp
                                ? formatThaiDate(returnDateTimestamp)
                                : 'รอส่งคืน'}
                            </div>
                          </div>
                        </div>

                        {/* Step 4: ตรวจสอบเสร็จสิ้น */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${
                                isStepInspected ? 'bg-[#0F6B4C]' : 'bg-[#CBD5E1]'
                              }`}
                            >
                              {isStepInspected && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="16"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-[#E2E8F0] min-h-[16px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                              ตรวจสอบเสร็จสิ้น
                            </div>
                            <div className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              {isStepInspected
                                ? `${formatThaiDate(
                                    selectedRequest.inspectedAt || selectedRequest.updatedAt,
                                  )}${
                                    selectedRequest.inspectorName
                                      ? ` · ${selectedRequest.inspectorName}`
                                      : ''
                                  }`
                                : selectedRequest.status === 'return_inspect'
                                ? 'รอเจ้าหน้าที่ตรวจสอบ'
                                : 'ยังไม่เสร็จสิ้น'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Status-Specific Action Box */}
                    {/* 3.1 หมวด "ที่กำลังใช้งาน" — สถานะ: รอรับมอบ (approved) */}
                    {selectedRequest.status === 'approved' && (
                      <div className="border border-[#E2E8F0] rounded-[12px] p-4 bg-[#F8FAFC] flex flex-col gap-3">
                        {eligibility.allowed ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <div className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                                สถานะ: รอรับมอบอุปกรณ์ (อนุมัติครบ 3 ระดับแล้ว)
                              </div>
                              <div className="text-[14px] leading-[20px] text-[#475569]">
                                กำหนดการยืม {formatThaiDate(selectedRequest.pickupDate)} –{' '}
                                {formatThaiDate(selectedRequest.returnDate)} · กรุณากดยืนยันรับมอบล่วงหน้าอย่างน้อย 1 วันก่อนวันเริ่มยืม (ภายในวันที่{' '}
                                {formatThaiDate(eligibility.lastAllowedReceiveDate)})
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setReceiveModalTarget(selectedRequest);
                                setFormPhotos([]);
                                setFormNote('');
                                setModalError('');
                              }}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold shrink-0 transition hover:opacity-90 active:scale-[0.98]"
                            >
                              <Icon name="check" className="w-4 h-4" />
                              <span>ยืนยันรับมอบ</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <div className="text-[14px] leading-[20px] font-semibold text-red-700">
                                ไม่สามารถกดยืนยันรับมอบได้ (ต้องรับมอบก่อนวันเริ่มยืมอย่างน้อย 1 วัน)
                              </div>
                              <div className="text-[14px] leading-[20px] text-red-600">
                                {eligibility.reason}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleModalTarget(selectedRequest);
                                  setNewPickupDate(selectedRequest.pickupDate);
                                  setNewReturnDate(selectedRequest.returnDate);
                                  setModalError('');
                                }}
                                className="inline-flex items-center justify-center px-3 py-2 rounded-[8px] border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-[14px] leading-[20px] font-medium transition"
                              >
                                เลื่อนวันรับครุภัณฑ์
                              </button>
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold opacity-50 cursor-not-allowed"
                                title={eligibility.reason}
                              >
                                <Icon name="check" className="w-4 h-4" />
                                <span>ยืนยันรับมอบ</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3.2 หมวด "ที่กำลังใช้งาน" — สถานะ: กำลังใช้งาน (borrowing) */}
                    {selectedRequest.status === 'borrowing' && (
                      <div className="border border-[#E2E8F0] rounded-[12px] p-4 bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                            สถานะ: กำลังใช้งานอุปกรณ์
                          </div>
                          <div className="text-[14px] leading-[20px] text-[#475569]">
                            วันที่รับมอบจริง:{' '}
                            <b className="text-[#0F172A] font-medium">
                              {selectedRequest.receivedAt
                                ? formatThaiDateTime(selectedRequest.receivedAt)
                                : '-'}
                            </b>{' '}
                            · กำหนดส่งคืน:{' '}
                            <b className="text-[#0F172A] font-medium">
                              {formatThaiDate(selectedRequest.returnDate)}
                            </b>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReturnModalTarget(selectedRequest);
                            setFormNote('');
                            setModalError('');
                          }}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold shrink-0 transition hover:opacity-90 active:scale-[0.98]"
                        >
                          <Icon name="package" className="w-4 h-4" />
                          <span>ยืนยันส่งคืนอุปกรณ์</span>
                        </button>
                      </div>
                    )}

                    {/* 3.3 หมวด "รอตรวจสอบ" — สถานะ: รอตรวจสอบ (return_inspect) */}
                    {selectedRequest.status === 'return_inspect' && (
                      <div className="border border-[#E2E8F0] rounded-[12px] p-4 bg-[#F8FAFC] flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="text-[14px] leading-[20px] font-medium text-[#0F172A] flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                              <span>รอเจ้าหน้าที่ตรวจสอบสภาพอุปกรณ์</span>
                            </div>
                            <div className="text-[14px] leading-[20px] text-[#475569]">
                              วันที่แจ้งส่งคืน:{' '}
                              <b className="text-[#0F172A] font-medium">
                                {returnDateTimestamp
                                  ? formatThaiDateTime(returnDateTimestamp)
                                  : '-'}
                              </b>
                              {selectedRequest.returnNote
                                ? ` · หมายเหตุผู้ยืม: ${selectedRequest.returnNote}`
                                : ''}
                            </div>
                          </div>

                          {isStaffOrAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectModalTarget(selectedRequest);
                                setInspectResult('normal');
                                setFormPhotos([]);
                                setFormNote('');
                                setModalError('');
                              }}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold shrink-0 transition hover:opacity-90 active:scale-[0.98]"
                            >
                              <Icon name="check" className="w-4 h-4" />
                              <span>ตรวจสอบและยืนยันรับคืน</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. Inspection Result & Separated Photo Evidence Box (from borrow-split.html line 51) */}
                    <div className="border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                            ผลการตรวจสภาพ:
                          </span>
                          {selectedRequest.status === 'returned' ? (
                            selectedRequest.inspectResult === 'damaged' ? (
                              <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-red-50 text-red-700 border border-red-200">
                                ⚠ ชำรุด
                              </span>
                            ) : selectedRequest.inspectResult === 'incomplete' ? (
                              <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                ✕ อุปกรณ์ไม่ครบ
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-[#E6F4EC] text-[#0F6B4C] border border-[#BFE3CF]">
                                ✓ ปกติ
                              </span>
                            )
                          ) : selectedRequest.status === 'return_inspect' ? (
                            <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                              รอเจ้าหน้าที่ตรวจสอบ
                            </span>
                          ) : selectedRequest.status === 'borrowing' ? (
                            <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              บันทึกสภาพก่อนใช้งานแล้ว
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-[6px] text-[12px] leading-[16px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              รอรับมอบอุปกรณ์
                            </span>
                          )}
                        </div>

                        {selectedRequest.inspectorName && (
                          <span className="text-[14px] leading-[20px] text-[#475569]">
                            ผู้ตรวจสอบ: <b className="text-[#0F172A] font-medium">{selectedRequest.inspectorName}</b>
                          </span>
                        )}
                      </div>

                      {/* Notes if present */}
                      {(selectedRequest.receiveNote ||
                        selectedRequest.returnNote ||
                        selectedRequest.inspectNote) && (
                        <div className="flex flex-col gap-1 text-[14px] leading-[20px] text-[#475569] bg-[#F8FAFC] p-3 rounded-[8px] border border-[#E2E8F0]">
                          {selectedRequest.receiveNote && (
                            <div>
                              <span className="font-medium text-[#0F172A]">หมายเหตุก่อนใช้งาน: </span>
                              {selectedRequest.receiveNote}
                            </div>
                          )}
                          {selectedRequest.returnNote && (
                            <div>
                              <span className="font-medium text-[#0F172A]">หมายเหตุเมื่อส่งคืน: </span>
                              {selectedRequest.returnNote}
                            </div>
                          )}
                          {selectedRequest.inspectNote && (
                            <div>
                              <span className="font-medium text-[#0F172A]">บันทึกผลตรวจสอบ: </span>
                              {selectedRequest.inspectNote}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Two Side-by-Side Photo Cards (Before Use vs After Return) */}
                      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                        {/* Card 1: รูปภาพก่อนใช้งาน (อัปโหลดโดยผู้ยืม) */}
                        <div className="border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col gap-3 min-h-[104px]">
                          <div className="text-[14px] leading-[20px] font-medium text-[#0F172A] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                            <span>รูปภาพก่อนใช้งาน ({receivePhotos.length} รูป)</span>
                          </div>
                          {receivePhotos.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {receivePhotos.map((src, i) => (
                                <button
                                  key={`rec-${i}`}
                                  type="button"
                                  onClick={() => setPreviewImage(src)}
                                  title="คลิกเพื่อดูรูปภาพก่อนใช้งานขนาดใหญ่"
                                  className="w-16 h-16 rounded-[8px] bg-[#E2E8F0] overflow-hidden border border-[#E2E8F0] hover:border-[#0F6B4C] transition shrink-0"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt={`รูปภาพก่อนใช้งาน ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              ไม่มีรูปภาพ
                            </span>
                          )}
                        </div>

                        {/* Card 2: รูปภาพหลังส่งคืน (อัปโหลดโดยเจ้าหน้าที่) */}
                        <div className="border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col gap-3 min-h-[104px]">
                          <div className="text-[14px] leading-[20px] font-medium text-[#0F172A] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />
                            <span>รูปภาพหลังส่งคืน ({inspectPhotos.length} รูป)</span>
                          </div>
                          {inspectPhotos.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {inspectPhotos.map((src, i) => (
                                <button
                                  key={`ins-${i}`}
                                  type="button"
                                  onClick={() => setPreviewImage(src)}
                                  title="คลิกเพื่อดูรูปภาพหลังส่งคืนขนาดใหญ่"
                                  className="w-16 h-16 rounded-[8px] bg-[#E2E8F0] overflow-hidden border border-[#E2E8F0] hover:border-[#0F6B4C] transition shrink-0"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt={`รูปภาพหลังส่งคืน ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[14px] leading-[20px] font-normal text-[#475569]">
                              ไม่มีรูปภาพ
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 5. Footer Link to Full Permit / Request Document */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-[#E2E8F0]">
                      <span className="text-[12px] leading-[16px] text-[#475569]">
                        แจ้งเตือนผ่าน LINE อัตโนมัติเมื่อสถานะคำขอเปลี่ยนแปลง
                      </span>
                      <Link
                        href={`/requests/${selectedRequest.id}`}
                        className="text-[14px] leading-[20px] font-medium text-[#0F6B4C] hover:underline inline-flex items-center gap-1"
                      >
                        <span>ดูเอกสารคำขอและไทม์ไลน์การลงนาม</span>
                        <Icon name="chevron-right" className="w-4 h-4" />
                      </Link>
                    </div>
                  </>
                );
              })()
            )}
          </article>
        </div>

        {/* Hidden input for replacing a single photo */}
        <input
          ref={replaceInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleReplaceFile}
          className="hidden"
        />
      </div>

      {/* ==================== MODAL 1: ยืนยันรับมอบอุปกรณ์ (ผู้ยืมอัปโหลดรูปก่อนใช้งาน) ==================== */}
      {receiveModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-[8px] bg-[#E6F4EC] text-[#0F6B4C] flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[18px] leading-[26px] font-semibold text-[#0F172A]">
                    ยืนยันรับมอบอุปกรณ์
                  </h3>
                  <p className="text-[12px] leading-[16px] text-[#475569]">
                    คำขอ {receiveModalTarget.code} · วันเริ่มยืม{' '}
                    {formatThaiDate(receiveModalTarget.pickupDate)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                className="w-8 h-8 rounded-[8px] hover:bg-[#F1F5F9] text-[#475569] flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* ข้อมูลอุปกรณ์และเงื่อนไขการรับมอบ */}
            <div className="bg-[#F8FAFC] p-4 rounded-[12px] border border-[#E2E8F0] text-[14px] leading-[20px] flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-[#475569]">รายการอุปกรณ์:</span>
                <b className="text-[#0F172A] font-medium text-right">
                  {getEquipmentInfo(receiveModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#475569]">จำนวนรวม:</span>
                <b className="text-[#0F172A] font-medium">
                  {getEquipmentInfo(receiveModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#475569]">ระยะเวลายืม:</span>
                <b className="text-[#0F172A] font-medium">
                  {formatThaiDate(receiveModalTarget.pickupDate)} –{' '}
                  {formatThaiDate(receiveModalTarget.returnDate)}
                </b>
              </div>
              <div className="pt-1.5 mt-1 border-t border-[#E2E8F0] text-[12px] leading-[16px] text-[#0F6B4C] font-medium">
                เงื่อนไขการรับมอบ: ต้องยืนยันรับมอบล่วงหน้าอย่างน้อย 1 วันก่อนวันเริ่มยืม และแนบรูปถ่ายสภาพอุปกรณ์ก่อนใช้งาน
              </div>
            </div>

            {/* อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนใช้งาน */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                  อัปโหลดรูปภาพอุปกรณ์ก่อนใช้งาน <span className="text-red-500">*</span>
                </label>
                <span className="text-[12px] leading-[16px] text-[#475569]">
                  ({formPhotos.length}/6 รูป · JPG, PNG, WEBP)
                </span>
              </div>
              <p className="text-[12px] leading-[16px] text-[#475569]">
                ถ่ายภาพสภาพอุปกรณ์เพื่อใช้เป็นหลักฐานก่อนใช้งาน (คลิกที่รูปเพื่อดูภาพขยาย กดปุ่มเปลี่ยนรูปหรือลบรูปได้)
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {formPhotos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-24 h-24 rounded-[12px] overflow-hidden border border-[#E2E8F0] group"
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
                      className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[10px] py-0.5 text-center hover:bg-[#0F6B4C] transition"
                    >
                      เปลี่ยนรูป
                    </button>
                  </div>
                ))}

                {formPhotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-[12px] border-2 border-dashed border-[#E2E8F0] hover:border-[#0F6B4C] flex flex-col items-center justify-center gap-1 text-[12px] text-[#475569] hover:text-[#0F6B4C] transition bg-[#F8FAFC]"
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

            {/* หมายเหตุจากผู้ยืม */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                หมายเหตุสภาพอุปกรณ์ก่อนใช้งาน (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="เช่น ทดสอบเปิดติดปกติ อุปกรณ์เสริมครบถ้วน หรือระบุรอยตำหนิเดิมก่อนใช้งาน..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full border border-[#E2E8F0] focus:border-[#0F6B4C] outline-none text-[14px] leading-[20px] rounded-[12px] p-3 resize-none"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                disabled={submitting}
                className="px-3 py-2 rounded-[8px] border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] text-[14px] leading-[20px] font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={submitting || formPhotos.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold disabled:opacity-50 transition"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="check" className="w-4 h-4" />
                )}
                <span>ยืนยันรับมอบ</span>
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
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-[8px] bg-[#E6F4EC] text-[#0F6B4C] flex items-center justify-center">
                  <Icon name="package" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[18px] leading-[26px] font-semibold text-[#0F172A]">
                    ยืนยันส่งคืนอุปกรณ์
                  </h3>
                  <p className="text-[12px] leading-[16px] text-[#475569]">
                    คำขอ {returnModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                className="w-8 h-8 rounded-[8px] hover:bg-[#F1F5F9] text-[#475569] flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* ข้อมูลอุปกรณ์ที่ส่งคืน */}
            <div className="bg-[#F8FAFC] p-4 rounded-[12px] border border-[#E2E8F0] flex flex-col gap-1.5 text-[14px] leading-[20px]">
              <div className="flex justify-between gap-2">
                <span className="text-[#475569]">อุปกรณ์ที่ส่งคืน:</span>
                <b className="text-[#0F172A] font-medium text-right">
                  {getEquipmentInfo(returnModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#475569]">จำนวนรวม:</span>
                <b className="text-[#0F172A] font-medium">
                  {getEquipmentInfo(returnModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#475569]">วันที่รับมอบจริง:</span>
                <span className="text-[#0F172A] font-medium">
                  {returnModalTarget.receivedAt
                    ? formatThaiDate(returnModalTarget.receivedAt)
                    : '-'}
                </span>
              </div>
            </div>

            {/* ช่องหมายเหตุการส่งคืน (ไม่มีช่องอัปโหลดรูปภาพตามข้อกำหนด 5.3 และ 6) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                หมายเหตุเพิ่มเติม (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="ระบุหมายเหตุการส่งคืน เช่น ส่งคืนที่ห้องพัสดุครบถ้วน หรือแจ้งอาการผิดปกติให้เจ้าหน้าที่ทราบ..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full border border-[#E2E8F0] focus:border-[#0F6B4C] outline-none text-[14px] leading-[20px] rounded-[12px] p-3 resize-none"
              />
            </div>

            <p className="text-[12px] leading-[16px] text-[#475569] bg-[#F8FAFC] p-3 rounded-[8px] border border-[#E2E8F0]">
              เมื่อกดยืนยันส่งคืนอุปกรณ์ ระบบจะบันทึกวันและเวลาที่แจ้งส่งคืน เปลี่ยนสถานะเป็น &quot;รอตรวจสอบ&quot; และแจ้งเตือนเจ้าหน้าที่เพื่อตรวจสภาพและถ่ายภาพหลังส่งคืน
            </p>

            {modalError && (
              <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                disabled={submitting}
                className="px-3 py-2 rounded-[8px] border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] text-[14px] leading-[20px] font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold disabled:opacity-50 transition"
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
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] max-w-xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-[8px] bg-[#E6F4EC] text-[#0F6B4C] flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[18px] leading-[26px] font-semibold text-[#0F172A]">
                    ตรวจสอบอุปกรณ์หลังส่งคืน (เจ้าหน้าที่)
                  </h3>
                  <p className="text-[12px] leading-[16px] text-[#475569]">
                    คำขอ {inspectModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                className="w-8 h-8 rounded-[8px] hover:bg-[#F1F5F9] text-[#475569] flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#F8FAFC] p-3.5 rounded-[12px] border border-[#E2E8F0] text-[14px] leading-[20px] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div>
                <span className="text-[#475569]">ผู้ยืม: </span>
                <b className="text-[#0F172A] font-medium">{inspectModalTarget.requesterName}</b>
              </div>
              <div>
                <span className="text-[#475569]">อุปกรณ์: </span>
                <b className="text-[#0F172A] font-medium">
                  {getEquipmentInfo(inspectModalTarget).name}
                </b>
              </div>
              <div>
                <span className="text-[#475569]">วันที่รับมอบจริง: </span>
                <b className="text-[#0F172A] font-medium">
                  {inspectModalTarget.receivedAt
                    ? formatThaiDate(inspectModalTarget.receivedAt)
                    : '-'}
                </b>
              </div>
              <div>
                <span className="text-[#475569]">วันที่แจ้งส่งคืน: </span>
                <b className="text-[#0F172A] font-medium">
                  {inspectModalTarget.returnSubmittedAt
                    ? formatThaiDate(inspectModalTarget.returnSubmittedAt)
                    : '-'}
                </b>
              </div>
              {inspectModalTarget.returnNote && (
                <div className="sm:col-span-2">
                  <span className="text-[#475569]">หมายเหตุจากผู้ยืม: </span>
                  <span className="text-[#0F172A]">{inspectModalTarget.returnNote}</span>
                </div>
              )}
            </div>

            {/* เปรียบเทียบรูปภาพก่อนใช้งาน vs รูปภาพหลังส่งคืน */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] flex flex-col gap-2">
                <b className="text-[13px] font-medium text-[#0F172A] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  รูปภาพก่อนใช้งาน (ผู้ยืม)
                </b>
                {(inspectModalTarget.receivePhotos || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(inspectModalTarget.receivePhotos || []).map((src, i) => (
                      <div
                        key={i}
                        className="w-16 h-16 rounded-[8px] border border-[#E2E8F0] overflow-hidden cursor-pointer hover:opacity-85"
                        onClick={() => setPreviewImage(src)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="ก่อนใช้งาน" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[12px] text-[#475569]">ไม่มีรูปภาพก่อนใช้งาน</span>
                )}
              </div>

              <div className="p-3.5 rounded-[12px] border border-[#BFE3CF] bg-[#E6F4EC]/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <b className="text-[13px] font-medium text-[#0F172A] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                    รูปภาพหลังส่งคืน <span className="text-red-500">*</span>
                  </b>
                  <span className="text-[11px] text-[#475569]">({formPhotos.length}/6)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formPhotos.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-[8px] overflow-hidden border border-[#E2E8F0] group"
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
                      className="w-16 h-16 rounded-[8px] border-2 border-dashed border-[#0F6B4C]/50 hover:border-[#0F6B4C] flex flex-col items-center justify-center text-[11px] text-[#0F6B4C] font-medium transition bg-white"
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
              <label className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
                ผลการตรวจสภาพ <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectResult('normal')}
                  className={`p-3 rounded-[12px] text-[13px] font-medium flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'normal'
                      ? 'bg-[#E6F4EC] text-[#0F6B4C] border-[#0F6B4C]'
                      : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]'
                  }`}
                >
                  <Icon name="check" className="w-4 h-4 text-[#0F6B4C]" />
                  <span>ปกติ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('damaged')}
                  className={`p-3 rounded-[12px] text-[13px] font-medium flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'damaged'
                      ? 'bg-red-50 text-red-800 border-red-500'
                      : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]'
                  }`}
                >
                  <Icon name="alert-triangle" className="w-4 h-4 text-red-600" />
                  <span>ชำรุด</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('incomplete')}
                  className={`p-3 rounded-[12px] text-[13px] font-medium flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'incomplete'
                      ? 'bg-amber-50 text-amber-900 border-amber-500'
                      : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]'
                  }`}
                >
                  <Icon name="x" className="w-4 h-4 text-amber-600" />
                  <span>อุปกรณ์ไม่ครบ</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] leading-[20px] font-medium text-[#0F172A]">
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
                className="w-full border border-[#E2E8F0] focus:border-[#0F6B4C] outline-none text-[14px] leading-[20px] rounded-[12px] p-3 resize-none"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                disabled={submitting}
                className="px-3 py-2 rounded-[8px] border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] text-[14px] leading-[20px] font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmInspect}
                disabled={submitting || formPhotos.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold disabled:opacity-50 transition"
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

      {/* ==================== MODAL 4: เลื่อนวันรับครุภัณฑ์ ==================== */}
      {rescheduleModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-[18px] leading-[26px] font-semibold text-[#0F172A]">
                  แก้ไข/เลื่อนวันรับครุภัณฑ์
                </h3>
                <p className="text-[12px] leading-[16px] text-[#475569]">
                  คำขอ {rescheduleModalTarget.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleModalTarget(null)}
                className="w-8 h-8 rounded-[8px] hover:bg-[#F1F5F9] text-[#475569] flex items-center justify-center"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] leading-[20px] text-[#475569]">
              ผู้ยืมต้องยืนยันรับมอบอย่างน้อย 1 วันก่อนวันเริ่มยืม หากเลือกวันเริ่มยืมเป็นวันพรุ่งนี้เป็นต้นไป ระบบจะเปิดให้กดยืนยันรับมอบได้ทันที
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[14px] leading-[20px] font-medium text-[#0F172A] block mb-1">
                  วันที่เริ่มยืมใหม่ *
                </label>
                <input
                  type="date"
                  value={newPickupDate}
                  onChange={(e) => {
                    setNewPickupDate(e.target.value);
                    if (newReturnDate < e.target.value) {
                      setNewReturnDate(e.target.value);
                    }
                  }}
                  className="w-full border border-[#E2E8F0] focus:border-[#0F6B4C] outline-none rounded-[8px] px-3 py-2 text-[14px]"
                />
              </div>
              <div>
                <label className="text-[14px] leading-[20px] font-medium text-[#0F172A] block mb-1">
                  วันครบกำหนดคืนใหม่ *
                </label>
                <input
                  type="date"
                  value={newReturnDate}
                  min={newPickupDate}
                  onChange={(e) => setNewReturnDate(e.target.value)}
                  className="w-full border border-[#E2E8F0] focus:border-[#0F6B4C] outline-none rounded-[8px] px-3 py-2 text-[14px]"
                />
              </div>
            </div>

            {modalError && (
              <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-red-700 text-[13px]">
                {modalError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setRescheduleModalTarget(null)}
                className="px-3 py-2 rounded-[8px] border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] text-[14px] leading-[20px] font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                disabled={submitting}
                className="px-3 py-2 rounded-[8px] bg-[#0F6B4C] text-white text-[14px] leading-[20px] font-semibold"
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
              className="max-w-full max-h-[80vh] object-contain rounded-[16px] shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-white/80 flex items-center gap-1 text-[14px]"
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
