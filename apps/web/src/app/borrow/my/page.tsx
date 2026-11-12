'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects, Memoization, Callbacks และ Refs
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// นำเข้า Link สำหรับการนำทางระหว่างหน้า
import Link from 'next/link';
// นำเข้า Type และฟังก์ชันคำนวณสิทธิ์การรับอุปกรณ์จากแพ็กเกจกลาง shared
import {
  BorrowRequest,
  checkBorrowReceiveEligibility,
  Equipment,
  getBangkokDateString,
  RequestWithTimeline,
} from '@japjong/shared';
// นำเข้า Auth Context สำหรับดึงข้อมูลบัญชีผู้ใช้งานที่ล็อกอินอยู่
import { useAuth } from '@/components/auth-context';
// นำเข้า AppShell คอมโพเนนต์เลย์เอาต์หลักของแอปพลิเคชัน
import { AppShell } from '@/components/shell';
// นำเข้า Icon แสดงรูปไอคอน SVG
import { Icon } from '@/components/icons';
// นำเข้า API client, ฟังก์ชันจัดรูปแบบวันเวลาภาษาไทย, และฟังก์ชันบีบอัดรูปภาพ
import { api, formatThaiDate, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

// แท็บสถานะการยืม: 'borrowing' (กำลังยืม/รอรับ), 'inspect' (ตรวจรับสภาพ), 'history' (ประวัติการคืน)
type BorrowTab = 'borrowing' | 'inspect' | 'history';

// ชนิดข้อมูลคำขอยืมพร้อมไทม์ไลน์สถานะ
type ExtendedBorrowRequest = RequestWithTimeline & BorrowRequest;

// ชนิดไฟล์รูปภาพที่อนุญาตให้อัปโหลด
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
// ขนาดไฟล์ภาพสูงสุดไม่เกิน 10 MB
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
// จำนวนรายการที่แสดงเริ่มต้นก่อนกดดูเพิ่มเติม
const INITIAL_VISIBLE_COUNT = 8;

/**
 * หน้าจอรายการยืม–คืนอุปกรณ์ของฉัน (/borrow/my)
 * บังคับใช้ Account Isolation เด็ดขาด "บัญชีใครบัญชีมัน" (mine=1) สำหรับประชาชนในการติดตาม, บันทึกรับอุปกรณ์, ส่งคืน, และขอเลื่อนกำหนดส่ง
 */
export default function MyBorrowsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState<ExtendedBorrowRequest[]>([]); // รายการคำขอยืมของฉันทั้งหมด
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]); // ข้อมูลอุปกรณ์สำหรับอ้างอิง
  const [tab, setTab] = useState<BorrowTab>('borrowing'); // แท็บที่เลือกอยู่
  const [searchQuery, setSearchQuery] = useState(''); // คำค้นหา
  const [selectedId, setSelectedId] = useState<string | null>(null); // รหัสคำขอที่เลือกดูรายละเอียด
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
      const borrowReqs = ((reqs as ExtendedBorrowRequest[]) || []).filter(
        (r) => !account?.id || r.requesterId === account.id,
      );
      setItems(borrowReqs);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'ไม่สามารถดึงข้อมูลรายการยืม–คืนอุปกรณ์ได้');
    } finally {
      setLoading(false);
    }
  }, [account?.id]);

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
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
            รอรับมอบ
          </span>
        );
      case 'borrowing':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 shrink-0">
            กำลังใช้งาน
          </span>
        );
      case 'return_inspect':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 shrink-0">
            รอตรวจสอบ
          </span>
        );
      case 'returned':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
            เสร็จสิ้น
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
            ไม่อนุมัติ
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 shrink-0">
            ยกเลิกคำขอ
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 shrink-0">
            รอดำเนินการ
          </span>
        );
    }
  };

  const todayStr = getBangkokDateString();

  return (
    <AppShell title="รายการยืม–คืนอุปกรณ์" backHref="/" maxWidth="max-w-none">
      <div className="flex flex-col gap-6 pb-8 text-ink w-full">
        {/* ==================== PAGE HEADER ==================== */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight m-0">
              รายการยืม–คืนอุปกรณ์
            </h1>
            <p className="text-sm text-ink-mute mt-1 leading-relaxed">
              ติดตามสถานะและหลักฐานรูปภาพของแต่ละคำขอ เลือกรายการทางซ้ายเพื่อดูรายละเอียด
            </p>
          </div>
          <Link
            href="/borrow"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold transition hover:bg-brand-ink shadow-xs active:scale-[0.98]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 256 256"
              fill="none"
              stroke="currentColor"
              strokeWidth="20"
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
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
            <div className="flex items-center gap-2.5">
              <Icon name="check" className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-medium">{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition"
            >
              ปิด
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-500/15 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-200 text-sm">
            <div className="flex items-center gap-2.5">
              <Icon name="alert-triangle" className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={load}
                className="text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 text-xs font-semibold px-2.5 py-1 rounded-lg border border-rose-500/30 transition"
              >
                ลองใหม่
              </button>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                className="text-rose-600 dark:text-rose-400 hover:text-rose-800 text-xs font-semibold px-2 py-1"
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
            <nav className="flex flex-wrap gap-1 p-1 bg-surface-muted/60 border border-line rounded-2xl" aria-label="หมวดหมู่รายการยืมและคืนอุปกรณ์">
              <button
                type="button"
                onClick={() => {
                  setTab('borrowing');
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  tab === 'borrowing'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-ink-mute hover:text-ink hover:bg-hover'
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
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  tab === 'inspect'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-ink-mute hover:text-ink hover:bg-hover'
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
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  tab === 'history'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-ink-mute hover:text-ink hover:bg-hover'
                }`}
              >
                ประวัติ ({historyItems.length})
              </button>
            </nav>

            {/* Search Input Card */}
            <div className="bg-surface border border-line rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-ink-mute focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all shadow-xs">
              <svg
                width="18"
                height="18"
                viewBox="0 0 256 256"
                fill="none"
                stroke="currentColor"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-ink-mute"
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
                placeholder="ค้นหาเลขที่คำขอหรือชื่ออุปกรณ์..."
                aria-label="ค้นหาเลขที่คำขอหรือชื่ออุปกรณ์"
                className="w-full bg-transparent border-none outline-none text-sm text-ink placeholder:text-ink-ph"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-ink-mute hover:text-ink p-1 rounded-full hover:bg-hover transition"
                  aria-label="ล้างคำค้นหา"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Master List Rows */}
            {loading ? (
              <div className="bg-surface border border-line rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 text-ink-mute shadow-xs">
                <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">กำลังโหลดรายการ...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-surface border border-line rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2 text-ink-mute shadow-xs">
                <span className="w-10 h-10 rounded-xl bg-surface-muted text-ink-mute flex items-center justify-center">
                  <Icon name="package" className="w-5 h-5" />
                </span>
                <span className="text-sm font-semibold text-ink">
                  {searchQuery ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีรายการในหมวดนี้'}
                </span>
                <span className="text-xs text-ink-mute leading-relaxed">
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
              <div className="flex flex-col gap-2">
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
                      className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-surface border-brand shadow-xs ring-1 ring-brand/30'
                          : 'bg-surface/80 border-line hover:border-brand/40 hover:bg-hover'
                      }`}
                    >
                      {/* Icon Box */}
                      <span className="w-10 h-10 rounded-xl bg-surface-muted text-ink-mute flex items-center justify-center shrink-0 overflow-hidden border border-line-soft">
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
                        <span className="text-sm sm:text-base font-semibold text-ink leading-snug truncate">
                          {eqInfo.name}
                        </span>
                        <span className="text-xs text-ink-mute leading-normal truncate mt-0.5">
                          {r.code} · {formatThaiDate(r.pickupDate)}
                        </span>
                      </span>

                      {/* Status Badge */}
                      {renderStatusBadge(r.status)}
                    </button>
                  );
                })}

                {/* Expand More Button */}
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 10)}
                    className="w-full flex items-center justify-center p-3 rounded-xl border border-line bg-surface hover:bg-hover text-xs sm:text-sm font-semibold text-ink-mute hover:text-ink transition"
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
            className="bg-surface border border-line rounded-2xl p-5 sm:p-7 flex flex-col gap-6 min-w-0 shadow-card"
          >
            {loading ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-ink-mute">
                <div className="size-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">
                  กำลังโหลดรายละเอียดคำขอยืม–คืนอุปกรณ์...
                </span>
              </div>
            ) : !selectedRequest ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-ink-mute">
                <div className="w-12 h-12 rounded-xl bg-surface-muted text-ink-mute flex items-center justify-center">
                  <Icon name="package" className="w-6 h-6" />
                </div>
                <div className="text-base sm:text-lg font-semibold text-ink">
                  เลือกรายการทางซ้ายเพื่อดูรายละเอียด
                </div>
                <p className="text-sm text-ink-mute max-w-md leading-relaxed">
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
                    <div className="flex items-start justify-between gap-4 flex-wrap border-b border-line pb-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight m-0">
                          {eqInfo.name}
                        </h2>
                        <div className="text-xs sm:text-sm font-medium text-ink-mute mt-1">
                          เลขที่คำขอ <span className="font-mono text-ink">{selectedRequest.code}</span> · รหัสครุภัณฑ์ <span className="font-mono text-ink">{eqInfo.code}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOverdue && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                            เกินกำหนดส่งคืน
                          </span>
                        )}
                        {isDueToday && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            ครบกำหนดคืนวันนี้
                          </span>
                        )}
                        {renderStatusBadge(selectedRequest.status)}
                      </div>
                    </div>

                    {/* 2. Two-Column Grid: Metadata (Left) + Vertical 4-Step Timeline (Right) */}
                    <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
                      {/* Left Sub-grid: Borrow Metadata */}
                      <div className="grid grid-cols-2 gap-y-5 gap-x-4 content-start">
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-ink-mute">
                            ผู้ยืม
                          </div>
                          <div className="text-sm sm:text-base font-semibold text-ink mt-0.5">
                            {selectedRequest.requesterName}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-ink-mute">
                            จำนวนรวม
                          </div>
                          <div className="text-sm sm:text-base font-semibold text-ink mt-0.5">
                            {eqInfo.totalQty} ชิ้น
                          </div>
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-ink-mute">
                            วันที่เริ่มยืม
                          </div>
                          <div className="text-sm sm:text-base font-semibold text-ink mt-0.5">
                            {formatThaiDate(selectedRequest.pickupDate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-ink-mute">
                            วันครบกำหนดคืน
                          </div>
                          <div
                            className={`text-sm sm:text-base font-semibold mt-0.5 ${
                              isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-ink'
                            }`}
                          >
                            {formatThaiDate(selectedRequest.returnDate)}
                          </div>
                        </div>
                        {selectedRequest.receivedAt && (
                          <div>
                            <div className="text-xs sm:text-sm font-medium text-ink-mute">
                              วันที่รับมอบจริง
                            </div>
                            <div className="text-sm sm:text-base font-semibold text-ink mt-0.5">
                              {formatThaiDate(selectedRequest.receivedAt)}
                            </div>
                          </div>
                        )}
                        {returnDateTimestamp && (
                          <div>
                            <div className="text-xs sm:text-sm font-medium text-ink-mute">
                              วันที่ส่งคืน
                            </div>
                            <div className="text-sm sm:text-base font-semibold text-ink mt-0.5">
                              {formatThaiDate(returnDateTimestamp)}
                            </div>
                          </div>
                        )}
                        <div className="col-span-2">
                          <div className="text-xs sm:text-sm font-medium text-ink-mute">
                            รายการอุปกรณ์
                          </div>
                          <div className="text-sm sm:text-base font-semibold text-ink mt-0.5">
                            {eqInfo.itemSummaries.length > 0
                              ? eqInfo.itemSummaries.join(', ')
                              : `${eqInfo.name} (${eqInfo.totalQty} ชิ้น)`}
                          </div>
                        </div>
                      </div>

                      {/* Right Sub-grid: Vertical 4-Step Stepper */}
                      <div className="flex flex-col bg-surface-muted/40 p-4 rounded-xl border border-line">
                        {/* Step 1: อนุมัติคำขอ */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${
                                isStepApproved ? 'bg-brand shadow-xs' : 'bg-surface-muted text-ink-mute border border-line'
                              }`}
                            >
                              {isStepApproved && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="20"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-line min-h-[18px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-sm font-semibold text-ink">
                              อนุมัติคำขอ
                            </div>
                            <div className="text-xs text-ink-mute mt-0.5">
                              {isStepApproved ? formatThaiDate(approvalDate) : 'รออนุมัติ'}
                            </div>
                          </div>
                        </div>

                        {/* Step 2: รับมอบอุปกรณ์ */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${
                                isStepReceived ? 'bg-brand shadow-xs' : 'bg-surface-muted text-ink-mute border border-line'
                              }`}
                            >
                              {isStepReceived && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="20"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-line min-h-[18px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-sm font-semibold text-ink">
                              รับมอบอุปกรณ์
                            </div>
                            <div className="text-xs text-ink-mute mt-0.5">
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
                                isStepReturned ? 'bg-brand shadow-xs' : 'bg-surface-muted text-ink-mute border border-line'
                              }`}
                            >
                              {isStepReturned && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="20"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 w-[2px] bg-line min-h-[18px]" />
                          </div>
                          <div className="pb-4">
                            <div className="text-sm font-semibold text-ink">
                              ส่งคืนอุปกรณ์
                            </div>
                            <div className="text-xs text-ink-mute mt-0.5">
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
                                isStepInspected ? 'bg-brand shadow-xs' : 'bg-surface-muted text-ink-mute border border-line'
                              }`}
                            >
                              {isStepInspected && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 256 256"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="20"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M40 128l56 56 120-120" />
                                </svg>
                              )}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-ink">
                              ตรวจสอบเสร็จสิ้น
                            </div>
                            <div className="text-xs text-ink-mute mt-0.5">
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
                      <div className="border border-line rounded-xl p-4 bg-surface-muted/50 flex flex-col gap-3">
                        {eligibility.allowed ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <div className="text-sm font-semibold text-ink">
                                สถานะ: รอรับมอบอุปกรณ์ (อนุมัติครบ 3 ระดับแล้ว)
                              </div>
                              <div className="text-xs sm:text-sm text-ink-mute leading-relaxed">
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
                              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold shrink-0 transition hover:bg-brand-ink shadow-xs active:scale-[0.98]"
                            >
                              <Icon name="check" className="w-4 h-4" />
                              <span>ยืนยันรับมอบ</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                                ไม่สามารถกดยืนยันรับมอบได้ (ต้องรับมอบก่อนวันเริ่มยืมอย่างน้อย 1 วัน)
                              </div>
                              <div className="text-xs sm:text-sm text-rose-700/80 dark:text-rose-300/80">
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
                                className="inline-flex items-center justify-center h-10 px-3.5 rounded-xl border border-line bg-surface hover:bg-hover text-ink text-sm font-medium transition"
                              >
                                เลื่อนวันรับครุภัณฑ์
                              </button>
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold opacity-50 cursor-not-allowed"
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
                      <div className="border border-line rounded-xl p-4 bg-surface-muted/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-sm font-semibold text-ink">
                            สถานะ: กำลังใช้งานอุปกรณ์
                          </div>
                          <div className="text-xs sm:text-sm text-ink-mute">
                            วันที่รับมอบจริง:{' '}
                            <b className="text-ink font-semibold">
                              {selectedRequest.receivedAt
                                ? formatThaiDateTime(selectedRequest.receivedAt)
                                : '-'}
                            </b>{' '}
                            · กำหนดส่งคืน:{' '}
                            <b className="text-ink font-semibold">
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
                          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold shrink-0 transition hover:bg-brand-ink shadow-xs active:scale-[0.98]"
                        >
                          <Icon name="package" className="w-4 h-4" />
                          <span>ยืนยันส่งคืนอุปกรณ์</span>
                        </button>
                      </div>
                    )}

                    {/* 3.3 หมวด "รอตรวจสอบ" — สถานะ: รอตรวจสอบ (return_inspect) */}
                    {selectedRequest.status === 'return_inspect' && (
                      <div className="border border-line rounded-xl p-4 bg-surface-muted/50 flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-semibold text-ink flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                              <span>รอเจ้าหน้าที่ตรวจสอบสภาพอุปกรณ์</span>
                            </div>
                            <div className="text-xs sm:text-sm text-ink-mute">
                              วันที่แจ้งส่งคืน:{' '}
                              <b className="text-ink font-semibold">
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
                              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold shrink-0 transition hover:bg-brand-ink shadow-xs active:scale-[0.98]"
                            >
                              <Icon name="check" className="w-4 h-4" />
                              <span>ตรวจสอบและยืนยันรับคืน</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. Inspection Result & Separated Photo Evidence Box */}
                    <div className="border border-line rounded-xl p-4.5 bg-surface-muted/30 flex flex-col gap-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            ผลการตรวจสภาพ:
                          </span>
                          {selectedRequest.status === 'returned' ? (
                            selectedRequest.inspectResult === 'damaged' ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                ⚠ ชำรุด
                              </span>
                            ) : selectedRequest.inspectResult === 'incomplete' ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                ✕ อุปกรณ์ไม่ครบ
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                ✓ ปกติ
                              </span>
                            )
                          ) : selectedRequest.status === 'return_inspect' ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              รอเจ้าหน้าที่ตรวจสอบ
                            </span>
                          ) : selectedRequest.status === 'borrowing' ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                              บันทึกสภาพก่อนใช้งานแล้ว
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
                              รอรับมอบอุปกรณ์
                            </span>
                          )}
                        </div>

                        {selectedRequest.inspectorName && (
                          <span className="text-xs sm:text-sm text-ink-mute">
                            ผู้ตรวจสอบ: <b className="text-ink font-semibold">{selectedRequest.inspectorName}</b>
                          </span>
                        )}
                      </div>

                      {/* Notes if present */}
                      {(selectedRequest.receiveNote ||
                        selectedRequest.returnNote ||
                        selectedRequest.inspectNote) && (
                        <div className="flex flex-col gap-1.5 text-xs sm:text-sm text-ink bg-surface p-3.5 rounded-xl border border-line">
                          {selectedRequest.receiveNote && (
                            <div>
                              <span className="font-semibold text-ink">หมายเหตุก่อนใช้งาน: </span>
                              <span className="text-ink-mute">{selectedRequest.receiveNote}</span>
                            </div>
                          )}
                          {selectedRequest.returnNote && (
                            <div>
                              <span className="font-semibold text-ink">หมายเหตุเมื่อส่งคืน: </span>
                              <span className="text-ink-mute">{selectedRequest.returnNote}</span>
                            </div>
                          )}
                          {selectedRequest.inspectNote && (
                            <div>
                              <span className="font-semibold text-ink">บันทึกผลตรวจสอบ: </span>
                              <span className="text-ink-mute">{selectedRequest.inspectNote}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Two Side-by-Side Photo Cards (Before Use vs After Return) */}
                      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                        {/* Card 1: รูปภาพก่อนใช้งาน (อัปโหลดโดยผู้ยืม) */}
                        <div className="border border-line rounded-xl p-4 bg-surface flex flex-col gap-2.5 min-h-[104px]">
                          <div className="text-xs sm:text-sm font-semibold text-ink flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
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
                                  className="w-16 h-16 rounded-lg bg-surface-muted overflow-hidden border border-line hover:border-brand transition shrink-0"
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
                            <span className="text-xs sm:text-sm text-ink-mute">
                              ไม่มีรูปภาพ
                            </span>
                          )}
                        </div>

                        {/* Card 2: รูปภาพหลังส่งคืน (อัปโหลดโดยเจ้าหน้าที่) */}
                        <div className="border border-line rounded-xl p-4 bg-surface flex flex-col gap-2.5 min-h-[104px]">
                          <div className="text-xs sm:text-sm font-semibold text-ink flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
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
                                  className="w-16 h-16 rounded-lg bg-surface-muted overflow-hidden border border-line hover:border-brand transition shrink-0"
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
                            <span className="text-xs sm:text-sm text-ink-mute">
                              ไม่มีรูปภาพ
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 5. Footer Link to Full Permit / Request Document */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-line">
                      <span className="text-xs text-ink-mute">
                        แจ้งเตือนผ่าน LINE อัตโนมัติเมื่อสถานะคำขอเปลี่ยนแปลง
                      </span>
                      <Link
                        href={`/requests/${selectedRequest.id}`}
                        className="text-xs sm:text-sm font-semibold text-brand hover:text-brand-ink inline-flex items-center gap-1 transition"
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
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    ยืนยันรับมอบอุปกรณ์
                  </h3>
                  <p className="text-xs text-ink-mute">
                    คำขอ {receiveModalTarget.code} · วันเริ่มยืม{' '}
                    {formatThaiDate(receiveModalTarget.pickupDate)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                className="w-8 h-8 rounded-lg hover:bg-hover text-ink-mute hover:text-ink flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* ข้อมูลอุปกรณ์และเงื่อนไขการรับมอบ */}
            <div className="bg-surface-muted p-4 rounded-xl border border-line text-sm flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-ink-mute">รายการอุปกรณ์:</span>
                <b className="text-ink font-medium text-right">
                  {getEquipmentInfo(receiveModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-mute">จำนวนรวม:</span>
                <b className="text-ink font-medium">
                  {getEquipmentInfo(receiveModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-mute">ระยะเวลายืม:</span>
                <b className="text-ink font-medium">
                  {formatThaiDate(receiveModalTarget.pickupDate)} –{' '}
                  {formatThaiDate(receiveModalTarget.returnDate)}
                </b>
              </div>
              <div className="pt-2 mt-1 border-t border-line text-xs text-brand font-medium">
                เงื่อนไขการรับมอบ: ต้องยืนยันรับมอบล่วงหน้าอย่างน้อย 1 วันก่อนวันเริ่มยืม และแนบรูปถ่ายสภาพอุปกรณ์ก่อนใช้งาน
              </div>
            </div>

            {/* อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนใช้งาน */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-ink">
                  อัปโหลดรูปภาพอุปกรณ์ก่อนใช้งาน <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-ink-mute">
                  ({formPhotos.length}/6 รูป · JPG, PNG, WEBP)
                </span>
              </div>
              <p className="text-xs text-ink-mute">
                ถ่ายภาพสภาพอุปกรณ์เพื่อใช้เป็นหลักฐานก่อนใช้งาน (คลิกที่รูปเพื่อดูภาพขยาย กดปุ่มเปลี่ยนรูปหรือลบรูปได้)
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {formPhotos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-24 h-24 rounded-xl overflow-hidden border border-line group"
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
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center gap-1 text-xs text-ink-mute hover:text-brand transition bg-surface-muted"
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
              <label className="text-sm font-semibold text-ink">
                หมายเหตุสภาพอุปกรณ์ก่อนใช้งาน (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="เช่น ทดสอบเปิดติดปกติ อุปกรณ์เสริมครบถ้วน หรือระบุรอยตำหนิเดิมก่อนใช้งาน..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full border border-line focus:border-brand bg-surface text-ink outline-none text-sm rounded-xl p-3 resize-none"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-line text-ink-mute hover:text-ink hover:bg-hover text-sm font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={submitting || formPhotos.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-ink disabled:opacity-50 transition"
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
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                  <Icon name="package" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    ยืนยันส่งคืนอุปกรณ์
                  </h3>
                  <p className="text-xs text-ink-mute">
                    คำขอ {returnModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                className="w-8 h-8 rounded-lg hover:bg-hover text-ink-mute hover:text-ink flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* ข้อมูลอุปกรณ์ที่ส่งคืน */}
            <div className="bg-surface-muted p-4 rounded-xl border border-line flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-ink-mute">อุปกรณ์ที่ส่งคืน:</span>
                <b className="text-ink font-medium text-right">
                  {getEquipmentInfo(returnModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-mute">จำนวนรวม:</span>
                <b className="text-ink font-medium">
                  {getEquipmentInfo(returnModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-mute">วันที่รับมอบจริง:</span>
                <span className="text-ink font-medium">
                  {returnModalTarget.receivedAt
                    ? formatThaiDate(returnModalTarget.receivedAt)
                    : '-'}
                </span>
              </div>
            </div>

            {/* ช่องหมายเหตุการส่งคืน (ไม่มีช่องอัปโหลดรูปภาพตามข้อกำหนด 5.3 และ 6) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-ink">
                หมายเหตุเพิ่มเติม (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="ระบุหมายเหตุการส่งคืน เช่น ส่งคืนที่ห้องพัสดุครบถ้วน หรือแจ้งอาการผิดปกติให้เจ้าหน้าที่ทราบ..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full border border-line focus:border-brand bg-surface text-ink outline-none text-sm rounded-xl p-3 resize-none"
              />
            </div>

            <p className="text-xs text-ink-mute bg-surface-muted p-3 rounded-xl border border-line">
              เมื่อกดยืนยันส่งคืนอุปกรณ์ ระบบจะบันทึกวันและเวลาที่แจ้งส่งคืน เปลี่ยนสถานะเป็น &quot;รอตรวจสอบ&quot; และแจ้งเตือนเจ้าหน้าที่เพื่อตรวจสภาพและถ่ายภาพหลังส่งคืน
            </p>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-line text-ink-mute hover:text-ink hover:bg-hover text-sm font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-ink disabled:opacity-50 transition"
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
          <div className="bg-surface border border-line rounded-2xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    ตรวจสอบอุปกรณ์หลังส่งคืน (เจ้าหน้าที่)
                  </h3>
                  <p className="text-xs text-ink-mute">
                    คำขอ {inspectModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                className="w-8 h-8 rounded-lg hover:bg-hover text-ink-mute hover:text-ink flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-surface-muted p-3.5 rounded-xl border border-line text-sm grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div>
                <span className="text-ink-mute">ผู้ยืม: </span>
                <b className="text-ink font-medium">{inspectModalTarget.requesterName}</b>
              </div>
              <div>
                <span className="text-ink-mute">อุปกรณ์: </span>
                <b className="text-ink font-medium">
                  {getEquipmentInfo(inspectModalTarget).name}
                </b>
              </div>
              <div>
                <span className="text-ink-mute">วันที่รับมอบจริง: </span>
                <b className="text-ink font-medium">
                  {inspectModalTarget.receivedAt
                    ? formatThaiDate(inspectModalTarget.receivedAt)
                    : '-'}
                </b>
              </div>
              <div>
                <span className="text-ink-mute">วันที่แจ้งส่งคืน: </span>
                <b className="text-ink font-medium">
                  {inspectModalTarget.returnSubmittedAt
                    ? formatThaiDate(inspectModalTarget.returnSubmittedAt)
                    : '-'}
                </b>
              </div>
              {inspectModalTarget.returnNote && (
                <div className="sm:col-span-2">
                  <span className="text-ink-mute">หมายเหตุจากผู้ยืม: </span>
                  <span className="text-ink">{inspectModalTarget.returnNote}</span>
                </div>
              )}
            </div>

            {/* เปรียบเทียบรูปภาพก่อนใช้งาน vs รูปภาพหลังส่งคืน */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-line bg-surface-muted flex flex-col gap-2">
                <b className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  รูปภาพก่อนใช้งาน (ผู้ยืม)
                </b>
                {(inspectModalTarget.receivePhotos || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(inspectModalTarget.receivePhotos || []).map((src, i) => (
                      <div
                        key={i}
                        className="w-16 h-16 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-85"
                        onClick={() => setPreviewImage(src)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="ก่อนใช้งาน" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-ink-mute">ไม่มีรูปภาพก่อนใช้งาน</span>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-brand/40 bg-brand/5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <b className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    รูปภาพหลังส่งคืน <span className="text-red-500">*</span>
                  </b>
                  <span className="text-xs text-ink-mute">({formPhotos.length}/6)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formPhotos.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-line group"
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
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-brand/40 hover:border-brand flex flex-col items-center justify-center text-xs text-brand font-medium transition bg-surface"
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
              <label className="text-sm font-semibold text-ink">
                ผลการตรวจสภาพ <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectResult('normal')}
                  className={`p-3 rounded-xl text-xs sm:text-sm font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'normal'
                      ? 'bg-brand/10 text-brand border-brand'
                      : 'bg-surface-muted text-ink-mute border-line hover:border-brand/40'
                  }`}
                >
                  <Icon name="check" className="w-4 h-4 text-brand" />
                  <span>ปกติ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('damaged')}
                  className={`p-3 rounded-xl text-xs sm:text-sm font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'damaged'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500'
                      : 'bg-surface-muted text-ink-mute border-line hover:border-red-400/40'
                  }`}
                >
                  <Icon name="alert-triangle" className="w-4 h-4 text-red-500" />
                  <span>ชำรุด</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('incomplete')}
                  className={`p-3 rounded-xl text-xs sm:text-sm font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'incomplete'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500'
                      : 'bg-surface-muted text-ink-mute border-line hover:border-amber-400/40'
                  }`}
                >
                  <Icon name="x" className="w-4 h-4 text-amber-500" />
                  <span>อุปกรณ์ไม่ครบ</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-ink">
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
                className="w-full border border-line focus:border-brand bg-surface text-ink outline-none text-sm rounded-xl p-3 resize-none"
              />
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-line text-ink-mute hover:text-ink hover:bg-hover text-sm font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmInspect}
                disabled={submitting || formPhotos.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-ink disabled:opacity-50 transition"
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
          <div className="bg-surface border border-line rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="text-lg font-bold text-ink">
                  แก้ไข/เลื่อนวันรับครุภัณฑ์
                </h3>
                <p className="text-xs text-ink-mute">
                  คำขอ {rescheduleModalTarget.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleModalTarget(null)}
                className="w-8 h-8 rounded-lg hover:bg-hover text-ink-mute hover:text-ink flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-ink-mute">
              ผู้ยืมต้องยืนยันรับมอบอย่างน้อย 1 วันก่อนวันเริ่มยืม หากเลือกวันเริ่มยืมเป็นวันพรุ่งนี้เป็นต้นไป ระบบจะเปิดให้กดยืนยันรับมอบได้ทันที
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-sm font-semibold text-ink block mb-1">
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
                  className="w-full border border-line focus:border-brand bg-surface text-ink outline-none rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-ink block mb-1">
                  วันครบกำหนดคืนใหม่ *
                </label>
                <input
                  type="date"
                  value={newReturnDate}
                  min={newPickupDate}
                  onChange={(e) => setNewReturnDate(e.target.value)}
                  className="w-full border border-line focus:border-brand bg-surface text-ink outline-none rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {modalError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setRescheduleModalTarget(null)}
                className="px-4 py-2 rounded-xl border border-line text-ink-mute hover:text-ink hover:bg-hover text-sm font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-ink transition"
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
              className="absolute -top-10 right-0 text-white hover:text-white/80 flex items-center gap-1 text-sm font-medium"
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
