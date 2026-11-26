'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects, Callbacks และ Refs
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ClipboardList, Plus, Search, X } from 'lucide-react';
// นำเข้า Type และข้อมูลคงที่ของงานแจ้งซ่อมบำรุงจากแพ็กเกจกลาง shared
import {
  Equipment,
  NAME_MAX_LENGTH,
  PublicAccount,
  REPAIR_CATEGORIES,
  RepairRequest,
  RequestWithTimeline,
  clampNameInput,
  sanitizePhoneInput,
  validateThaiPhone,
  Venue,
} from '@japjong/shared';
// นำเข้า Auth Context เพื่อตรวจสอบสิทธิ์ของผู้ใช้และฟังก์ชันเส้นทางหน้าแรกตามบทบาท
import { roleHomePath, useAuth } from '@/components/auth-context';
// นำเข้า AppShell คอมโพเนนต์เลย์เอาต์หลักของแอปพลิเคชัน
import { AppShell } from '@/components/shell';
// นำเข้า Icon แสดงรูปไอคอน SVG
import { Icon } from '@/components/icons';
// นำเข้าคอมโพเนนต์ฟอร์มกรอกเบอร์โทรศัพท์ 10 หลัก
import { Phone10DigitInput } from '@/components/thai-address-select';
// นำเข้า UI Components: Chip, StatusChip
import {
  Chip,
  ChipTone,
  NameLengthBadge,
  NameLimitWarning,
  StatusChip,
  statusToTone,
} from '@/components/ui';
// นำเข้า API client, ฟังก์ชันจัดรูปแบบวันเวลาภาษาไทย, และฟังก์ชันบีบอัดรูปภาพ
import { api, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

function resolveProblemAndDetail(title: string, detail?: string): {
  heading: string;
  subDetail: string | null;
} {
  const t = (title || '').trim();
  const d = (detail || '').trim();
  if (!d || d === '-') return { heading: t || '-', subDetail: null };
  if (!t) return { heading: d, subDetail: null };
  if (t === d) return { heading: t, subDetail: null };
  const tBase = t.replace(/(\.\.\.|…)+$/, '').trim();
  const dBase = d.replace(/(\.\.\.|…)+$/, '').trim();
  if (tBase.length >= 4 && d.includes(tBase) && d.length >= t.length) {
    return { heading: d, subDetail: null };
  }
  if (dBase.length >= 4 && t.includes(dBase) && t.length >= d.length) {
    return { heading: t, subDetail: null };
  }
  return { heading: t, subDetail: d };
}

function getOfficerInitial(name?: string): string {
  const cleaned = (name || '')
    .trim()
    .replace(/^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.|ว่าที่\s*ร\.ต\.|จ\.ส\.อ\.|ส\.อ\.)\s*/, '');
  const chars = Array.from(cleaned || name || 'ช');
  return chars[0] || 'ช';
}

// กำหนดโหมดหน้าจอ: 'form' (ฟอร์มแจ้งซ่อมใหม่) หรือ 'track' (ติดตามสถานะแจ้งซ่อม)
type Mode = 'form' | 'track';
// กำหนดตัวกรองสถานะติดตามแยกชัดเจนเข้าใจง่าย
type TrackFilter = 'all' | 'in_progress' | 'awaiting' | 'done' | 'rejected';
// กำหนดประเภทเป้าหมายที่ชำรุด: 'venue' (สถานที่), 'equipment' (อุปกรณ์/ครุภัณฑ์), 'other' (อื่น ๆ / ระบุเอง)
type TargetType = 'venue' | 'equipment' | 'other';

/**
 * หน้าจอระบบแจ้งซ่อมบำรุงและติดตามสถานะ (Fast-ticket Repair Service)
 * ออกแบบขั้นตอนการทำงานกระชับ (3 ขั้นตอน) ไม่บังคับลงลายมือชื่อดิจิทัลเพื่อความรวดเร็วในการแจ้งเหตุ
 */
export default function RepairPage() {
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบัน และรายชื่อบัญชีทั้งหมดในระบบ (สำหรับโหมดกรอกแทน)
  const { account, accounts } = useAuth();
  // ตรวจสอบว่าผู้ใช้งานเป็นเจ้าหน้าที่หรือแอดมินหรือไม่
  const isStaff = account?.role === 'STAFF' || account?.role === 'ADMIN';
  // State โหมดหน้าจอ (ฟอร์ม หรือ ติดตามสถานะ)
  const [mode, setMode] = useState<Mode>('form');

  // --- Walk-in State: โหมดกรอกแจ้งซ่อมแทนผู้มาติดต่อ (สำหรับเจ้าหน้าที่) ---
  const [isWalkIn, setIsWalkIn] = useState(false); // เปิดใช้งานโหมดกรอกแทนหรือไม่
  const [walkInQuery, setWalkInQuery] = useState(''); // คำค้นหาชื่อหรือเบอร์โทรของผู้มาติดต่อ
  const [foundUser, setFoundUser] = useState<PublicAccount | null>(null); // ข้อมูลผู้ใช้ในระบบที่ค้นพบ
  const [requesterName, setRequesterName] = useState(account?.name || ''); // ชื่อผู้แจ้ง
  const [requesterPhone, setRequesterPhone] = useState(() => sanitizePhoneInput(account?.phone || '', 10)); // เบอร์โทรผู้แจ้ง
  const [organization, setOrganization] = useState(account?.department || ''); // หน่วยงาน/สังกัดผู้แจ้ง

  // --- Resource State: ข้อมูลสถานที่และอุปกรณ์สำหรับเลือกแจ้งซ่อม ---
  const [venues, setVenues] = useState<Venue[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);

  // --- Form State: ข้อมูลในฟอร์มแจ้งซ่อม ---
  const [targetType, setTargetType] = useState<TargetType>('venue'); // ประเภทเป้าหมาย (สถานที่/อุปกรณ์/อื่น ๆ)
  const [selectedResourceId, setSelectedResourceId] = useState<string>(''); // ID ของสถานที่หรืออุปกรณ์ที่เลือก
  const [customLocation, setCustomLocation] = useState(''); // สถานที่หรือจุดเกิดเหตุที่พิมพ์ระบุเอง
  const [category, setCategory] = useState<string>(REPAIR_CATEGORIES[0] ?? 'ไฟฟ้า'); // หมวดหมู่อาการชำรุด
  const [detail, setDetail] = useState(''); // รายละเอียดอาการชำรุด
  const [images, setImages] = useState<string[]>([]); // รายการรูปภาพประกอบ (Base64 Data URLs สูงสุด 3 รูป)
  const [previewImg, setPreviewImg] = useState<string | null>(null); // รูปภาพที่กำลังเปิดดูขนาดใหญ่ (Lightbox)
  const [draftSaved, setDraftSaved] = useState(false); // สถานะแจ้งเตือนบันทึกร่างสำเร็จ
  const [submitting, setSubmitting] = useState(false); // สถานะกำลังส่งคำขอไปยังเซิร์ฟเวอร์
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref สำหรับสั่งเปิด File Picker ของกล้องหรือเครื่อง

  // --- Track State: ข้อมูลสำหรับแท็บติดตามสถานะแจ้งซ่อม ---
  const [repairs, setRepairs] = useState<(RequestWithTimeline & RepairRequest)[]>([]); // รายการแจ้งซ่อมของฉัน
  const [loadingRepairs, setLoadingRepairs] = useState(true);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all'); // ตัวกรองสถานะคำขอ
  const [searchQuery, setSearchQuery] = useState(''); // คำค้นหาในรายการแจ้งซ่อมของฉัน
  const [selectedId, setSelectedId] = useState<string | null>(null); // ID คำขอที่เลือกเปิดดูรายละเอียด
  const [lastCompleted, setLastCompleted] = useState<{ code: string; action: 'confirm' | 'reopen' } | null>(null);

  // ตรวจสอบ URL Query Parameters เมื่อเปิดหน้าเว็บ (เช่น ?id=... หรือ ?mode=track)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const idParam = sp.get('id');
    const modeParam = sp.get('mode');
    if (idParam) {
      setSelectedId(idParam);
      setMode('track');
      setTrackFilter('all');
    } else if (modeParam === 'track') {
      setMode('track');
    }
  }, []);

  // กำหนดค่าเริ่มต้นของผู้แจ้งตามข้อมูลบัญชีที่ล็อกอินอยู่ (กรณีไม่ได้เปิดโหมดกรอกแทน)
  useEffect(() => {
    if (account && !isWalkIn) {
      setRequesterName(account.name);
      setRequesterPhone(sanitizePhoneInput(account.phone || ''));
      setOrganization(account.department || '');
    }
  }, [account, isWalkIn]);

  /**
   * ฟังก์ชันสลับโหมดแจ้งในนามตนเอง หรือกรอกคำขอแทนผู้มาติดต่อ
   * @param walkInMode - true เมื่อเลือกกรอกแทน
   */
  const handleToggleWalkIn = (walkInMode: boolean) => {
    setIsWalkIn(walkInMode);
    setFoundUser(null);
    setWalkInQuery('');
    if (walkInMode) {
      setRequesterName('');
      setRequesterPhone('');
      setOrganization('');
    } else if (account) {
      setRequesterName(account.name);
      setRequesterPhone(sanitizePhoneInput(account.phone || ''));
      setOrganization(account.department || '');
    }
  };

  /**
   * ฟังก์ชันค้นหาผู้ใช้งานในระบบสำหรับโหมดกรอกแทนด้วยชื่อหรือเบอร์โทรศัพท์
   */
  const handleSearchWalkInUser = () => {
    const q = walkInQuery.trim().toLowerCase();
    if (!q) return;
    const digits = q.replace(/\D/g, '');
    const match = accounts.find(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (digits && a.phone.replace(/\D/g, '').includes(digits)),
    );
    if (match) {
      setFoundUser(match);
      setRequesterName(match.name);
      setRequesterPhone(sanitizePhoneInput(match.phone || ''));
      setOrganization(match.department || '');
    } else {
      setFoundUser(null);
      if (digits.length >= 9) {
        setRequesterPhone(sanitizePhoneInput(walkInQuery.trim()));
      } else {
        setRequesterName(walkInQuery.trim());
      }
    }
  };

  // โหลดรายการสถานที่และอุปกรณ์จริงจาก Backend เมื่อเริ่มต้นหน้าจอ
  useEffect(() => {
    api.venues().then(setVenues).catch(() => {});
    api.equipment().then(setEquipmentList).catch(() => {});
  }, []);

  /**
   * ฟังก์ชันดึงประวัติการแจ้งซ่อมของตนเองจาก Backend API
   */
  const loadRepairs = useCallback(
    (preferId?: string | null) => {
      setLoadingRepairs(true);
      api
        .listRequests({ mine: true, type: 'repair' })
        .then(async (list) => {
          let typed = list as (RequestWithTimeline & RepairRequest)[];
          if (account?.id) {
            typed = typed.filter((r) => r.requesterId === account.id);
          }
          if (preferId && !typed.some((r) => r.id === preferId || r.code === preferId)) {
            try {
              const single = await api.getRequest(preferId);
              if (single && single.type === 'repair') {
                typed = [single as RequestWithTimeline & RepairRequest, ...typed];
              }
            } catch {
              // ละเว้นกรณีไม่พบข้อมูล
            }
          }
          setRepairs(typed);
        })
        .catch(() => {})
        .finally(() => setLoadingRepairs(false));
    },
    [account?.id],
  );

  // โหลดรายการคำขอเมื่อเปิดหน้าหรือเปลี่ยนบัญชี
  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    loadRepairs(sp?.get('id'));
  }, [loadRepairs]);

  /**
   * ฟังก์ชันเลือกไฟล์ภาพจากอุปกรณ์ พร้อมบีบอัดภาพให้อัตโนมัติ (จำกัดสูงสุด 3 รูป)
   */
  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const remaining = Math.max(0, 3 - images.length);
    if (remaining === 0) return;
    const newDataUrls = await readAndCompressImages(e.target.files, remaining);
    if (newDataUrls.length) {
      setImages((prev) => [...prev, ...newDataUrls].slice(0, 3));
    }
    e.target.value = '';
  };

  /**
   * ฟังก์ชันลบรูปภาพประกอบตามลำดับ index
   * @param idx - ตำแหน่งของรูปภาพใน Array
   */
  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // ค้นหาข้อมูลสถานที่หรืออุปกรณ์ที่ผู้ใช้เลือกจากรายการ
  const selectedVenue = venues.find((v) => v.id === selectedResourceId);
  const selectedEquipment = equipmentList.find((e) => e.id === selectedResourceId);

  /**
   * คำนวณชื่อสถานที่หรืออุปกรณ์ตามประเภทเป้าหมายที่เลือก
   */
  const getResolvedLocation = () => {
    if (targetType === 'venue') {
      return selectedVenue ? selectedVenue.name : customLocation.trim();
    }
    if (targetType === 'equipment') {
      return selectedEquipment ? selectedEquipment.name : customLocation.trim();
    }
    return customLocation.trim();
  };

  // ตรวจสอบความสมบูรณ์ของฟอร์ม (ต้องระบุสถานที่/อุปกรณ์ และรายละเอียดปัญหา)
  const isFormValid = Boolean(getResolvedLocation()) && Boolean(detail.trim());

  /**
   * ฟังก์ชันส่งคำขอแจ้งซ่อมไปยัง Backend API
   */
  const handleSubmit = async () => {
    const resolvedLocation = getResolvedLocation();
    if (!resolvedLocation || !detail.trim()) return;
    // ตรวจสอบเบอร์โทรศัพท์ 10 หลัก
    const phoneCheck = validateThaiPhone(sanitizePhoneInput(requesterPhone || account?.phone || '', 10));
    if (!phoneCheck.valid) {
      alert(phoneCheck.error || 'กรุณากรอกเบอร์โทรศัพท์เป็นตัวเลข 10 หลัก');
      return;
    }

    setSubmitting(true);
    try {
      const building = targetType === 'venue' && selectedVenue?.building ? selectedVenue.building : 'อาคารสำนักงาน';
      const floor = targetType === 'venue' && selectedVenue?.floor ? selectedVenue.floor : '-';

      // เรียก API สร้างคำขอแจ้งซ่อม
      const created = await api.createRepair({
        building,
        floor,
        location: resolvedLocation,
        category,
        detail,
        photos: images.length,
        attachments: images,
        requesterId: isWalkIn && foundUser ? foundUser.id : undefined,
        requesterName: requesterName.trim() || undefined,
        requesterPhone: phoneCheck.normalized,
        organization: organization.trim() || undefined,
      });

      // ล้างข้อมูลในฟอร์มเมื่อส่งสำเร็จ
      setSelectedResourceId('');
      setCustomLocation('');
      setDetail('');
      setImages([]);
      await loadRepairs(created.id);
      // นำทางไปยังแท็บติดตามสถานะพร้อมเปิดคำขอที่เพิ่งส่งทันที
      setSelectedId(created.id);
      setTrackFilter('all');
      setMode('track');
    } catch (err: any) {
      alert(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอแจ้งซ่อม');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * ฟังก์ชันย้อนกลับไปหน้ารายการแจ้งซ่อมของฉัน
   */
  const handleBackToList = () => {
    setSelectedId(null);
    if (typeof window !== 'undefined' && window.location.search) {
      const sp = new URLSearchParams(window.location.search);
      if (sp.has('id')) {
        sp.delete('id');
        const qs = sp.toString();
        window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      }
    }
  };

  /**
   * ฟังก์ชันตรวจรับงานซ่อม (ยืนยันว่าเรียบร้อย หรือขอดำเนินการซ่อมใหม่)
   * @param id - รหัสคำขอแจ้งซ่อม
   * @param action - 'confirm' (ยืนยันตรวจรับ) หรือ 'reopen' (ยังไม่เรียบร้อย)
   */
  const handleAction = async (id: string, action: 'confirm' | 'reopen') => {
    setSubmitting(true);
    try {
      const updated = await api.updateRepairStatus(id, { action });
      setLastCompleted({ code: updated.code, action });
      await loadRepairs(id);
    } finally {
      setSubmitting(false);
    }
  };

  // รายการแจ้งซ่อมที่กำลังเปิดดูรายละเอียด (เฉพาะเมื่ออยู่ในโหมด track และมีการคลิกเลือก)
  const current =
    mode === 'track' && selectedId
      ? repairs.find((r) => r.id === selectedId || r.code === selectedId) ?? null
      : null;

  // นับจำนวนแยกตามกลุ่มสถานะเพื่อแสดงตัวเลขชัดเจนบนการ์ดและตัวกรอง
  const countInProgress = repairs.filter(
    (r) => r.status === 'repair_submitted' || r.status === 'repair_in_progress',
  ).length;
  const countAwaiting = repairs.filter((r) => r.status === 'repair_awaiting_acceptance').length;
  const countDone = repairs.filter((r) => r.status === 'repair_done').length;
  const countRejected = repairs.filter(
    (r) => r.status === 'rejected' || r.status === 'cancelled',
  ).length;

  // กรองรายการคำขอตามตัวกรองสถานะและคำค้นหา
  const filteredRepairs = repairs.filter((r) => {
    if (trackFilter === 'in_progress' && r.status !== 'repair_submitted' && r.status !== 'repair_in_progress') {
      return false;
    }
    if (trackFilter === 'awaiting' && r.status !== 'repair_awaiting_acceptance') {
      return false;
    }
    if (trackFilter === 'done' && r.status !== 'repair_done') {
      return false;
    }
    if (trackFilter === 'rejected' && r.status !== 'rejected' && r.status !== 'cancelled') {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        r.code.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.detail || '').toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const userDisplayChip = account?.nickname || account?.name || 'ผู้ใช้งาน';

  return (
    // โครงเลย์เอาต์หลัก พร้อมกำหนดแถบปุ่ม Action Footer ด้านล่างเฉพาะโหมดฟอร์ม
    <AppShell
      title={current ? undefined : mode === 'form' ? 'แจ้งปัญหา / ซ่อมบำรุง' : 'แจ้งซ่อมของฉัน'}
      backHref={current ? undefined : account ? roleHomePath(account.role) : '/'}
      rightLabel={current ? undefined : mode === 'track' ? userDisplayChip : undefined}
      maxWidth="max-w-[1080px]"
      footer={
        mode === 'form' ? (
          // ปุ่มควบคุมด้านล่างในโหมดฟอร์ม (บันทึกร่าง / ส่งเรื่อง)
          <div className="flex w-full sm:w-auto gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 2500);
              }}
              className="jw-btn-sec flex-1 sm:w-40"
            >
              บันทึกร่าง
            </button>
            <button
              type="button"
              disabled={submitting || !isFormValid}
              onClick={handleSubmit}
              className="jw-btn flex-[1.5] sm:w-56"
            >
              {submitting ? 'กำลังส่ง...' : 'ส่งเรื่องแจ้งซ่อม'}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* แถบส่วนหัวสลับโหมดแบบปุ่มทางลัดชัดเจน (แทนการใช้แถบ Tabs ซ้อนกัน 2 ชั้น) */}
        {!current && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] text-ink-soft">
                {mode === 'form'
                  ? 'ระบุสถานที่หรือครุภัณฑ์ที่ชำรุดพร้อมรูปภาพ เพื่อให้ช่างเข้าตรวจสอบและแก้ไข'
                  : 'คลิกที่รายการเพื่อดูความคืบหน้า รูปภาพประกอบ หรือกดตรวจรับงานที่ซ่อมเสร็จแล้ว'}
              </p>
            </div>

            {mode === 'form' ? (
              <button
                type="button"
                onClick={() => setMode('track')}
                className="min-h-[42px] px-4 rounded-xl border border-line bg-surface hover:border-brand text-ink text-[13.5px] font-semibold inline-flex items-center gap-2 shadow-xs transition cursor-pointer"
              >
                <ClipboardList className="size-4 text-brand shrink-0" />
                <span>รายการแจ้งซ่อมของฉัน ({repairs.length})</span>
                {countAwaiting > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11.5px] font-bold bg-warn-bg text-warn-fg border border-warn-border">
                    รอตรวจรับ {countAwaiting}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setMode('form');
                }}
                className="jw-btn !min-h-[42px] px-4 !rounded-xl text-[13.5px] font-semibold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="size-4 shrink-0" />
                <span>แจ้งปัญหา / ซ่อมบำรุงใหม่</span>
              </button>
            )}
          </div>
        )}

        {mode === 'form' ? (
          // ==================== MODE 1: ฟอร์มแจ้งซ่อมใหม่ ====================
          <div className="jw-card p-5 sm:p-6 flex flex-col gap-4">
            {/* กล่องเลือกโหมดกรอกแทน (เฉพาะเจ้าหน้าที่ / แอดมิน) */}
            {isStaff && (
              <div className="rounded-2xl border border-brand/30 bg-brand-mint/25 p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-[14px] text-ink block">สำหรับเจ้าหน้าที่: รูปแบบการแจ้งซ่อม</b>
                    <span className="text-[12px] text-ink-mute">
                      เลือกว่าต้องการแจ้งซ่อมในนามตนเอง หรือกรอกแจ้งซ่อมแทนผู้มาติดต่อ
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleWalkIn(false)}
                      className={`h-9 px-3.5 rounded-full text-[12.5px] font-semibold border transition ${
                        !isWalkIn
                          ? 'bg-brand border-brand text-white'
                          : 'bg-white border-line text-ink hover:border-brand'
                      }`}
                    >
                      แจ้งในนามตนเอง
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleWalkIn(true)}
                      className={`h-9 px-3.5 rounded-full text-[12.5px] font-semibold border transition ${
                        isWalkIn
                          ? 'bg-brand border-brand text-white'
                          : 'bg-white border-line text-ink hover:border-brand'
                      }`}
                    >
                      กรอกคำขอแทนผู้มาติดต่อ
                    </button>
                  </div>
                </div>

                {/* ช่องค้นหาข้อมูลผู้มาติดต่อ (เมื่อเปิดโหมด Walk-in) */}
                {isWalkIn && (
                  <div className="pt-2 border-t border-brand/15 flex flex-col gap-2.5">
                    <label className="jw-lbl mb-0">ค้นหาข้อมูลผู้มาติดต่อ (เบอร์โทรหรือชื่อ)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={walkInQuery}
                        onChange={(e) => setWalkInQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchWalkInUser();
                          }
                        }}
                        placeholder="กรอกเบอร์โทรหรือชื่อเพื่อดึงข้อมูลอัตโนมัติ หรือพิมพ์ข้อมูลด้านล่างโดยตรง"
                        className="jw-in flex-1 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSearchWalkInUser}
                        className="jw-btn jw-btn-sm shrink-0"
                      >
                        ค้นหา
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {foundUser ? (
                        <Chip tone="green">
                          <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} /> พบผู้ใช้ในระบบ: {foundUser.name} ({foundUser.phone})
                        </Chip>
                      ) : (
                        <Chip tone="amber">ผู้มาติดต่อทั่วไป (กรอกชื่อและเบอร์โทรด้านล่างได้เลย)</Chip>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ข้อมูลชื่อและเบอร์โทรศัพท์ผู้แจ้ง */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="jw-lbl mb-0">ชื่อ-นามสกุลผู้แจ้ง</label>
                  <NameLengthBadge value={requesterName} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
                </div>
                <input
                  type="text"
                  value={requesterName}
                  maxLength={NAME_MAX_LENGTH.PERSON_NAME}
                  onChange={(e) => setRequesterName(clampNameInput(e.target.value, NAME_MAX_LENGTH.PERSON_NAME))}
                  placeholder="ระบุชื่อ-นามสกุลผู้แจ้ง"
                  className="jw-in"
                />
                <NameLimitWarning value={requesterName} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
              </div>
              <Phone10DigitInput
                label="เบอร์โทรศัพท์ติดต่อ (ตัวเลข 10 หลัก)"
                required
                value={requesterPhone}
                onChange={setRequesterPhone}
              />
            </div>

            {/* เลือกหมวดหมู่ของสิ่งที่ชำรุด (สถานที่ / ครุภัณฑ์ / อื่น ๆ) */}
            <div>
              <label className="jw-lbl">รายการที่ต้องการแจ้งปัญหา / ซ่อมแซม</label>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType('venue');
                    setSelectedResourceId('');
                  }}
                  className={`h-9 px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                    targetType === 'venue'
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white border-line text-ink hover:border-brand'
                  }`}
                >
                  สถานที่ ({venues.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType('equipment');
                    setSelectedResourceId('');
                  }}
                  className={`h-9 px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                    targetType === 'equipment'
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white border-line text-ink hover:border-brand'
                  }`}
                >
                  อุปกรณ์ / ครุภัณฑ์ ({equipmentList.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType('other');
                    setSelectedResourceId('');
                  }}
                  className={`h-9 px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                    targetType === 'other'
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white border-line text-ink hover:border-brand'
                  }`}
                >
                  อื่น ๆ / ระบุเอง
                </button>
              </div>

              {/* กรณีเลือกสถานที่ */}
              {targetType === 'venue' && (
                <div>
                  <select
                    value={selectedResourceId}
                    onChange={(e) => setSelectedResourceId(e.target.value)}
                    className="jw-in"
                  >
                    <option value="">-- กรุณาเลือกสถานที่ --</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.building || 'อาคารสำนักงาน'} {v.floor && v.floor !== '-' ? `· ${v.floor}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* กรณีเลือกอุปกรณ์/ครุภัณฑ์ */}
              {targetType === 'equipment' && (
                <div>
                  <select
                    value={selectedResourceId}
                    onChange={(e) => setSelectedResourceId(e.target.value)}
                    className="jw-in"
                  >
                    <option value="">-- กรุณาเลือกอุปกรณ์ / ครุภัณฑ์ --</option>
                    {equipmentList.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* กรณีเลือกระบุเอง */}
              {targetType === 'other' && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] text-ink-mute font-medium">ชื่อสถานที่ / จุดเกิดเหตุ / อุปกรณ์</span>
                    <NameLengthBadge value={customLocation} maxLength={NAME_MAX_LENGTH.LOCATION_NAME} />
                  </div>
                  <input
                    type="text"
                    value={customLocation}
                    maxLength={NAME_MAX_LENGTH.LOCATION_NAME}
                    onChange={(e) => setCustomLocation(clampNameInput(e.target.value, NAME_MAX_LENGTH.LOCATION_NAME))}
                    placeholder="ระบุสถานที่ จุดเกิดเหตุ หรืออุปกรณ์ที่ต้องการแจ้งซ่อม"
                    className="jw-in"
                  />
                  <NameLimitWarning value={customLocation} maxLength={NAME_MAX_LENGTH.LOCATION_NAME} />
                </div>
              )}
            </div>

            {/* ตัวเลือกหมวดหมู่ประเภทปัญหา */}
            <div>
              <label className="jw-lbl">ประเภทปัญหา</label>
              <div className="flex flex-wrap gap-2">
                {REPAIR_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`h-[38px] px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                      category === c
                        ? 'bg-brand border-brand text-white'
                        : 'bg-white border-line text-ink hover:border-brand'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* ช่องกรอกรายละเอียดอาการชำรุด */}
            <div>
              <label className="jw-lbl">รายละเอียด</label>
              <textarea
                rows={3}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="ระบุอาการชำรุดหรือรายละเอียดปัญหาที่พบ..."
                className="jw-in h-24 py-2.5"
              />
            </div>

            {/* ส่วนอัปโหลดรูปภาพประกอบ (ไม่เกิน 3 รูป) */}
            <div>
              <label className="jw-lbl">รูปภาพประกอบ (ไม่เกิน 3 รูป)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleSelectFiles}
                className="hidden"
              />
              <div className="flex flex-wrap gap-3">
                {images.map((src, idx) => (
                  <div
                    key={idx}
                    className="w-20 h-20 rounded-2xl bg-brand-mint text-brand relative border border-line"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewImg(src)}
                      className="w-full h-full rounded-2xl overflow-hidden block"
                      title="คลิกเพื่อดูรูปขนาดใหญ่"
                    >
                      <img src={src} alt={`รูปประกอบ ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="w-5 h-5 rounded-full bg-ink text-white absolute -top-1.5 -right-1.5 flex items-center justify-center shadow"
                      title="ลบรูป"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-2xl bg-white border-[1.5px] border-dashed border-[#7A7A7A] text-ink-mute text-[13px] flex flex-col items-center justify-center gap-1 hover:border-brand hover:text-brand transition"
                  >
                    <Icon name="plus" className="w-5 h-5" />
                    <span>+ รูป</span>
                  </button>
                )}
              </div>
            </div>

            {/* คำอธิบายโฟลว์งานแจ้งซ่อม */}
            <p className="text-[13px] text-ink-mute">
              ขั้นตอนงานแจ้งซ่อม: (1) ผู้แจ้งส่งเรื่อง → (2) เจ้าหน้าที่รับเรื่อง & ซ่อมแซม → (3) ผู้แจ้งตรวจรับงาน (ไม่ต้องลงนาม)
            </p>

            {/* ข้อความแจ้งเตือนบันทึกร่างสำเร็จ */}
            {draftSaved && (
              <div className="rounded-2xl bg-brand-mint text-brand px-3.5 py-2 text-[13px] font-semibold">
                บันทึกร่างการแจ้งซ่อมเรียบร้อยแล้ว
              </div>
            )}
          </div>
        ) : !current ? (
          // ==================== MODE 2A: หน้ารายการแจ้งซ่อมของฉัน (การ์ดสรุปตัวเลข + ตัวกรองชัดเจน) ====================
          <div className="flex flex-col gap-4">
            {/* การ์ดสรุปสถานะ 4 ช่อง คลิกกรองได้ทันทีในคลิกเดียว */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  { key: 'all', label: 'ทั้งหมด', count: repairs.length, numCls: 'text-ink' },
                  { key: 'in_progress', label: 'กำลังดำเนินการ', count: countInProgress, numCls: 'text-info-fg' },
                  { key: 'awaiting', label: 'รอตรวจรับงาน', count: countAwaiting, numCls: 'text-warn-fg' },
                  { key: 'done', label: 'เสร็จสิ้นแล้ว', count: countDone, numCls: 'text-brand' },
                ] as const
              ).map((stat) => {
                const active = trackFilter === stat.key;
                return (
                  <button
                    key={stat.key}
                    type="button"
                    onClick={() => setTrackFilter(stat.key)}
                    className={`jw-card p-3.5 text-left transition cursor-pointer ${
                      active ? 'ring-2 ring-brand bg-brand-mint/35' : 'hover:bg-hover'
                    }`}
                  >
                    <span className="text-[12px] font-medium text-ink-soft block">{stat.label}</span>
                    <b className={`text-[22px] font-bold leading-tight mt-0.5 block tabular-nums ${stat.numCls}`}>
                      {stat.count}
                    </b>
                  </button>
                );
              })}
            </div>

            {/* แถบค้นหา + ชิปตัวกรองสถานะที่มีตัวเลขกำกับชัดเจน */}
            <div className="jw-card p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: 'all', label: `ทั้งหมด (${repairs.length})`, show: true },
                    { id: 'in_progress', label: `กำลังดำเนินการ (${countInProgress})`, show: true },
                    { id: 'awaiting', label: `รอตรวจรับงาน (${countAwaiting})`, show: true },
                    { id: 'done', label: `เสร็จสิ้น (${countDone})`, show: true },
                    { id: 'rejected', label: `ไม่รับเรื่อง/ยกเลิก (${countRejected})`, show: countRejected > 0 },
                  ] as const
                )
                  .filter((item) => item.show)
                  .map((t) => {
                    const active = trackFilter === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTrackFilter(t.id)}
                        className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition border cursor-pointer ${
                          active
                            ? 'bg-brand text-white border-brand shadow-xs'
                            : 'bg-surface text-ink-soft border-line hover:text-ink hover:bg-surface-muted'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
              </div>

              <div className="relative w-full sm:w-64 shrink-0">
                <Search className="size-4 text-ink-mute absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหารหัส, สถานที่, อาการ..."
                  className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-8 text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="ล้างคำค้นหา"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {loadingRepairs ? (
              <div className="jw-card p-10 text-center text-[14px] text-ink-mute">
                กำลังโหลดรายการแจ้งซ่อมของคุณ...
              </div>
            ) : filteredRepairs.length === 0 ? (
              <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-full bg-brand-mint text-brand flex items-center justify-center">
                  <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
                </div>
                <b className="text-[17px] text-ink">ไม่พบรายการแจ้งซ่อมในหมวดนี้</b>
                <p className="text-[13px] text-ink-mute max-w-md">
                  {trackFilter !== 'all' || searchQuery.trim()
                    ? 'ลองเปลี่ยนหมวดตัวกรองด้านบนเป็น "ทั้งหมด" หรือล้างคำค้นหา'
                    : 'กดปุ่ม "+ แจ้งปัญหา / ซ่อมบำรุงใหม่" ด้านบนขวาเพื่อสร้างรายการแจ้งซ่อม'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredRepairs.map((r) => {
                  const locText = [r.building, r.floor !== '-' ? r.floor : '', r.location]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setLastCompleted(null);
                        setSelectedId(r.id);
                      }}
                      className="jw-card p-4 sm:p-5 w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                    >
                      <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-[16px] text-ink">{r.code}</b>
                          <Chip tone="orange">{r.category || 'แจ้งซ่อม'}</Chip>
                          <StatusChip status={r.status} />
                        </div>
                        <span className="text-[14px] font-semibold text-ink truncate">
                          {locText} — {r.title}
                        </span>
                        <span className="text-[12.5px] text-ink-soft">
                          แจ้งเมื่อ {formatThaiDateTime(r.createdAt)}
                          {r.staffSignerName ? ` · ผู้รับผิดชอบ: ${r.staffSignerName}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand shrink-0">
                        <span>
                          {r.status === 'repair_awaiting_acceptance' ? 'ตรวจรับงานซ่อม' : 'ดูรายละเอียด'}
                        </span>
                        <Icon name="chevron-right" className="w-4 h-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // ==================== MODE 2B: หน้ารายละเอียดงานซ่อม (Detail View เดียวกันกับจัดการงานซ่อมและปัญหา) ====================
          (() => {
            const officerName = current.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง';
            const officerSubLabel = current.staffSignerName ? 'เจ้าหน้าที่ผู้รับผิดชอบ' : 'รอจัดสรรช่างซ่อมบำรุง';
            const officerInitial = getOfficerInitial(officerName);

            const heroHeading =
              current.status === 'repair_submitted'
                ? 'รอช่างรับเรื่อง'
                : current.status === 'repair_in_progress'
                  ? 'กำลังดำเนินการ'
                  : current.status === 'repair_awaiting_acceptance'
                    ? 'รอคุณตรวจรับงาน'
                    : current.status === 'repair_done'
                      ? 'ตรวจรับเรียบร้อย'
                      : current.status === 'rejected'
                        ? 'ส่งกลับ / ไม่รับเรื่อง'
                        : 'ยกเลิกแล้ว';

            type StepNodeState = 'done' | 'current' | 'upcoming' | 'rejected';
            const step2State: StepNodeState = current.finishedAt
              ? 'done'
              : current.status === 'rejected'
                ? 'rejected'
                : current.status === 'cancelled'
                  ? 'upcoming'
                  : 'current';

            const step2Tone: ChipTone = current.finishedAt
              ? statusToTone('repair_done')
              : current.status === 'rejected'
                ? statusToTone('rejected')
                : current.acceptedAt
                  ? statusToTone('repair_in_progress')
                  : statusToTone('repair_submitted');

            const step3State: StepNodeState =
              current.status === 'repair_done'
                ? 'done'
                : current.status === 'repair_awaiting_acceptance'
                  ? 'current'
                  : 'upcoming';

            const step3Tone: ChipTone =
              current.status === 'repair_done'
                ? statusToTone('repair_done')
                : current.status === 'repair_awaiting_acceptance'
                  ? statusToTone('repair_awaiting_acceptance')
                  : 'gray';

            const steps: {
              num: number;
              roleLabel: string;
              personName: string;
              dateText: string;
              statusText: string;
              nodeState: StepNodeState;
              tone: ChipTone;
            }[] = [
              {
                num: 1,
                roleLabel: '1. ผู้แจ้งส่งเรื่อง',
                personName: current.requesterName,
                dateText: formatThaiDateTime(current.createdAt),
                statusText: '✓ ส่งเรื่องแล้ว',
                nodeState: 'done',
                tone: statusToTone('repair_done'),
              },
              {
                num: 2,
                roleLabel: '2. เจ้าหน้าที่รับเรื่อง & ซ่อม',
                personName: current.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง',
                dateText: current.finishedAt
                  ? `เสร็จ: ${formatThaiDateTime(current.finishedAt)}`
                  : current.acceptedAt
                    ? `รับเรื่อง: ${formatThaiDateTime(current.acceptedAt)}`
                    : 'รอดำเนินการ',
                statusText: current.finishedAt
                  ? '✓ ซ่อมเสร็จแล้ว'
                  : current.status === 'rejected'
                    ? '✕ ส่งกลับ / ไม่รับเรื่อง'
                    : current.acceptedAt
                      ? '● กำลังดำเนินการ'
                      : '● รอช่างรับเรื่อง',
                nodeState: step2State,
                tone: step2Tone,
              },
              {
                num: 3,
                roleLabel: '3. ผู้แจ้งตรวจรับงาน',
                personName: current.requesterName,
                dateText: current.acceptedByRequesterAt
                  ? formatThaiDateTime(current.acceptedByRequesterAt)
                  : '-',
                statusText:
                  current.status === 'repair_done'
                    ? '✓ ตรวจรับเรียบร้อย'
                    : current.status === 'repair_awaiting_acceptance'
                      ? '● รอคุณตรวจรับ'
                      : '○ รอซ่อมเสร็จ',
                nodeState: step3State,
                tone: step3Tone,
              },
            ];

            const nodeClasses = (nodeState: StepNodeState, tone: ChipTone) => {
              if (nodeState === 'done') {
                return 'bg-ok-bg text-ok-fg ring-2 ring-ok-border';
              }
              if (nodeState === 'rejected') {
                return 'bg-danger-bg text-danger-fg ring-2 ring-danger-border';
              }
              if (nodeState === 'current') {
                return tone === 'info'
                  ? 'bg-info-bg text-info-fg ring-2 ring-info-border'
                  : 'bg-warn-bg text-warn-fg ring-2 ring-warn-border';
              }
              return 'bg-transparent text-white border-2 border-white/70';
            };

            const { heading: problemHeading, subDetail: problemSubDetail } = resolveProblemAndDetail(
              current.title,
              current.detail,
            );
            const attachments = Array.isArray(current.attachments) ? current.attachments : [];
            const locationFull = [
              current.building,
              current.floor && current.floor !== '-' ? current.floor : '',
              current.location,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div className="flex flex-col gap-5 min-w-0">
                {/* แบนเนอร์แจ้งผลการตรวจรับล่าสุด */}
                {lastCompleted && lastCompleted.code === current.code && (
                  <div className="jw-card p-4 bg-brand-mint border border-brand flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <b className="text-[14px] text-ink block">
                        อัปเดตสถานะงานซ่อม {lastCompleted.code} เรียบร้อยแล้ว
                      </b>
                      <span className="text-[12px] text-ink-soft">
                        {lastCompleted.action === 'confirm'
                          ? 'ยืนยันการตรวจรับงานซ่อมเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ'
                          : 'แจ้งกลับว่ายังไม่เรียบร้อย ส่งเรื่องให้ช่างเข้าตรวจสอบซ้ำแล้ว'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastCompleted(null)}
                      className="jw-btn-sec min-h-[40px] px-4 text-[13px] shrink-0"
                    >
                      ปิด
                    </button>
                  </div>
                )}

                {/* 1) แถวหัวหน้า (สไตล์เดียวกับจัดการงานซ่อมและปัญหา) */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={handleBackToList}
                      aria-label="กลับไปหน้ารายการแจ้งซ่อมของฉัน"
                      className="min-w-[44px] min-h-[44px] rounded-control bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer shrink-0 mt-0.5"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <div className="flex flex-col min-w-0">
                      <h1 className="text-[18px] sm:text-[21px] font-bold text-ink leading-tight tracking-tight">
                        แจ้งซ่อมของฉัน
                      </h1>
                      <button
                        type="button"
                        onClick={handleBackToList}
                        className="min-h-[44px] -my-1.5 w-fit inline-flex items-center text-[13px] font-semibold text-brand hover:underline cursor-pointer"
                      >
                        ← กลับไปหน้ารายการแจ้งซ่อม ({repairs.length})
                      </button>
                    </div>
                  </div>

                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-brand bg-brand-mint border border-brand/20 shrink-0">
                    {userDisplayChip}
                  </span>
                </div>

                {/* 2) การ์ดสถานะปัจจุบัน (Hero) พื้นเขียวเข้ม ตัวอักษรขาว มุมโค้งใหญ่ rounded-card */}
                <section className="rounded-card bg-brand-deep text-white p-4 sm:p-6 shadow-high flex flex-col gap-5 min-w-0">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-bold tracking-wide text-white">
                          {current.code}
                        </span>
                        {current.category && <Chip tone="orange">{current.category}</Chip>}
                        <StatusChip status={current.status} />
                      </div>

                      <h2 className="text-[22px] sm:text-[26px] font-bold text-white leading-tight tracking-tight">
                        {heroHeading}
                      </h2>

                      {current.status === 'repair_submitted' ? (
                        <p className="text-[13.5px] text-white/95 leading-relaxed max-w-2xl">
                          ส่งเรื่องแจ้งซ่อมเรียบร้อยแล้ว ขณะนี้กำลังรอเจ้าหน้าที่รับเรื่องและเข้าตรวจสอบหน้างาน
                        </p>
                      ) : current.status === 'repair_in_progress' ? (
                        <p className="text-[13.5px] text-white/95 leading-relaxed max-w-2xl">
                          เจ้าหน้าที่รับเรื่องแล้วและกำลังดำเนินการซ่อมบำรุง ระบบจะแจ้งเตือนเมื่อดำเนินการเสร็จสิ้น
                        </p>
                      ) : current.status === 'repair_awaiting_acceptance' ? (
                        <p className="text-[13.5px] text-white/95 leading-relaxed max-w-2xl">
                          ช่างดำเนินการซ่อมเสร็จเรียบร้อยแล้ว กรุณาตรวจสอบผลงานด้านล่างและกดปุ่ม{' '}
                          <b className="font-bold text-white">&quot;ยืนยันตรวจรับงานซ่อม&quot;</b>
                        </p>
                      ) : (
                        <p className="text-[13.5px] text-white/95 leading-relaxed">
                          สถานะคำขอแจ้งซ่อมนี้:{' '}
                          {current.status === 'repair_done'
                            ? 'คุณตรวจรับงานซ่อมเรียบร้อยแล้ว'
                            : current.status === 'rejected'
                              ? current.rejectReason || 'ส่งกลับ / ไม่รับเรื่องซ่อม'
                              : 'ยกเลิกคำขอแล้ว'}
                        </p>
                      )}
                    </div>

                    {/* แคปซูลผู้รับผิดชอบงาน */}
                    <div className="inline-flex items-center gap-3 px-3.5 py-2 rounded-full bg-white/15 border border-white/25 self-start shrink-0">
                      <span className="size-9 rounded-full bg-white text-brand-deep font-bold text-[14px] flex items-center justify-center shrink-0">
                        {officerInitial}
                      </span>
                      <div className="flex flex-col pr-1">
                        <span className="text-[11.5px] text-white/90 leading-tight">
                          {officerSubLabel}
                        </span>
                        <span className="text-[13px] font-bold text-white leading-snug">
                          {officerName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* แถวกลาง: ความคืบหน้า 3 ขั้นตอน เรียงแนวนอน เชื่อมด้วยเส้น */}
                  <div className="rounded-control bg-white/10 border border-white/15 p-3.5 sm:p-4">
                    <div className="text-[12px] font-semibold text-white/90 mb-3">
                      ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-3">
                      {steps.map((st, idx) => {
                        const prevDone = idx > 0 && steps[idx - 1].nodeState === 'done';
                        return (
                          <div key={st.num} className="relative flex sm:flex-col gap-3 sm:gap-2 min-w-0">
                            <div className="flex sm:w-full items-center gap-2">
                              <span
                                className={`size-8 rounded-full flex items-center justify-center shrink-0 font-bold text-[13px] ${nodeClasses(st.nodeState, st.tone)}`}
                              >
                                {st.nodeState === 'done' ? (
                                  <Icon name="check" className="w-4 h-4" strokeWidth={3} />
                                ) : st.nodeState === 'rejected' ? (
                                  <Icon name="x" className="w-4 h-4" strokeWidth={3} />
                                ) : st.nodeState === 'current' ? (
                                  <span
                                    className={`size-2.5 rounded-full block ${
                                      st.tone === 'info' ? 'bg-info-fg' : 'bg-warn-fg'
                                    }`}
                                  />
                                ) : (
                                  <span className="text-[12px] font-bold">{st.num}</span>
                                )}
                              </span>

                              {idx < steps.length - 1 && (
                                <span
                                  aria-hidden="true"
                                  className={`hidden sm:block h-[2px] flex-1 rounded-full ${
                                    st.nodeState === 'done' || prevDone ? 'bg-ok-border' : 'bg-white/30'
                                  }`}
                                />
                              )}
                            </div>

                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-[12px] font-semibold text-white/90 leading-snug">
                                {st.roleLabel}
                              </span>
                              <b className="text-[14px] font-bold text-white leading-snug break-words">
                                {st.personName}
                              </b>
                              <span className="text-[12px] text-white/90 leading-snug">
                                {st.dateText}
                              </span>
                              <div className="pt-0.5">
                                <Chip tone={st.tone}>{st.statusText}</Chip>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* แถวล่าง: ปุ่มตรวจรับงานของผู้แจ้ง (แสดงเมื่ออยู่ในสถานะรอผู้แจ้งตรวจรับงาน) */}
                  {current.status === 'repair_awaiting_acceptance' && (
                    <div className="pt-4 border-t border-white/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <span className="text-[13.5px] text-white/95 leading-relaxed">
                        กรุณาตรวจสอบรูปภาพหลังซ่อมและผลงานด้านล่างก่อนกดยืนยัน (ไม่ต้องลงลายมือชื่อ)
                      </span>

                      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleAction(current.id, 'reopen')}
                          className="min-h-[44px] px-4 py-2 rounded-control border border-danger-border bg-danger-bg text-danger-fg font-semibold text-[14px] hover:opacity-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ยังไม่เรียบร้อย
                        </button>

                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleAction(current.id, 'confirm')}
                          className="min-h-[44px] px-5 py-2 rounded-control bg-white text-brand-deep font-bold text-[14px] shadow-xs hover:bg-brand-tint transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? 'กำลังบันทึก...' : 'ยืนยันตรวจรับงานซ่อม'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* 3) การ์ดรายละเอียด (พื้นขาว รูปประกอบ 192x192 + ตารางข้อมูล + บันทึกผลการซ่อม) */}
                <section className="jw-card p-4 sm:p-6 flex flex-col gap-5 min-w-0">
                  <div className="grid grid-cols-1 md:grid-cols-[192px_minmax(0,1fr)] gap-5 sm:gap-6 items-start">
                    {/* ซ้าย: รูปภาพประกอบ ขนาด 192x192 */}
                    <div className="flex flex-col gap-2.5">
                      {attachments.length > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewImg(attachments[0])}
                            aria-label="เปิดรูปภาพประกอบการแจ้งซ่อมขนาดเต็ม"
                            className="block w-[192px] h-[192px] rounded-control border border-line overflow-hidden bg-surface-muted hover:opacity-90 transition cursor-pointer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attachments[0]}
                              alt="รูปปัญหาที่ 1"
                              className="w-full h-full object-cover"
                            />
                          </button>

                          {attachments.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                              {attachments.slice(1).map((url, idx) => (
                                <button
                                  key={idx + 1}
                                  type="button"
                                  onClick={() => setPreviewImg(url)}
                                  aria-label={`เปิดรูปปัญหาที่ ${idx + 2} ขนาดเต็ม`}
                                  className="block w-14 h-14 rounded-lg border border-line overflow-hidden bg-surface-muted hover:opacity-90 transition cursor-pointer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`รูปปัญหาที่ ${idx + 2}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}

                          <span className="text-[12.5px] font-medium text-ink-soft">
                            รูปภาพประกอบการแจ้งซ่อม ({attachments.length} รูป)
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-[192px] h-[192px] rounded-control border border-dashed border-line bg-surface-muted flex flex-col items-center justify-center gap-1.5 text-ink-mute">
                            <Icon name="photo" className="w-7 h-7" />
                            <span className="text-[12px] text-ink-soft">ไม่มีรูปภาพแนบ</span>
                          </div>
                          <span className="text-[12.5px] font-medium text-ink-soft">
                            รูปภาพประกอบการแจ้งซ่อม (0 รูป)
                          </span>
                        </>
                      )}
                    </div>

                    {/* ขวา: ปัญหา/อาการ + รายละเอียด + ตารางข้อมูลคั่นเส้นบาง */}
                    <div className="flex flex-col gap-3 min-w-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-[12.5px] font-semibold text-ink-soft">
                          ปัญหา/อาการ
                        </span>
                        <h3 className="text-[20px] sm:text-[22px] font-bold text-ink leading-snug break-words">
                          {problemHeading}
                        </h3>
                        {problemSubDetail && (
                          <p className="text-[14px] text-ink-soft whitespace-pre-wrap leading-relaxed mt-1">
                            {problemSubDetail}
                          </p>
                        )}
                      </div>

                      <dl className="divide-y divide-line-soft border-t border-line mt-1 text-[14px]">
                        <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                          <dt className="font-semibold text-ink-soft">ผู้แจ้งซ่อม</dt>
                          <dd className="text-ink break-words">
                            {current.requesterName}
                            {current.organization ? ` · ${current.organization}` : ''}
                          </dd>
                        </div>

                        <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                          <dt className="font-semibold text-ink-soft">โทรศัพท์</dt>
                          <dd className="text-ink">
                            {current.requesterPhone ? (
                              <a
                                href={`tel:${current.requesterPhone}`}
                                className="inline-flex items-center min-h-[44px] -my-2 text-brand font-semibold hover:underline"
                              >
                                {current.requesterPhone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </dd>
                        </div>

                        <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                          <dt className="font-semibold text-ink-soft">สถานที่/อาคาร</dt>
                          <dd className="text-ink break-words">{locationFull || '-'}</dd>
                        </div>

                        <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-baseline">
                          <dt className="font-semibold text-ink-soft">วันที่แจ้ง</dt>
                          <dd className="text-ink">{formatThaiDateTime(current.createdAt)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {/* แสดงบันทึกผลการซ่อมและรูปหลังซ่อม (กรณีช่างบันทึกผลงานแล้ว) */}
                  {(current.resolution ||
                    (current.afterPhotos && current.afterPhotos.length > 0)) && (
                    <div className="pt-4 border-t border-line flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-[15px] text-ink">บันทึกผลการซ่อมบำรุง</b>
                        <span className="text-[12.5px] text-ink-soft">
                          {current.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-control bg-surface-muted border border-line text-[13.5px] flex flex-col gap-3">
                        <div>
                          <span className="text-[12px] font-semibold text-ink-soft block mb-0.5">
                            รายละเอียดผลการซ่อม
                          </span>
                          <span className="text-ink font-medium whitespace-pre-wrap">
                            {current.resolution || '-'}
                          </span>
                        </div>
                        {current.afterPhotos && current.afterPhotos.length > 0 && (
                          <div>
                            <span className="text-[12px] font-semibold text-ink-soft block mb-1.5">
                              รูปภาพหลังซ่อม ({current.afterPhotos.length} รูป)
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {current.afterPhotos.map((url, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPreviewImg(url)}
                                  aria-label={`เปิดรูปหลังซ่อมที่ ${i + 1} ขนาดเต็ม`}
                                  className="block w-20 h-20 rounded-control border border-line overflow-hidden hover:opacity-90 transition shadow-xs cursor-pointer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`รูปหลังซ่อมที่ ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            );
          })()
        )}
      </div>

      {/* หน้าต่างป็อปอัปแสดงรูปภาพขนาดใหญ่ (Lightbox) */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]">
            <img src={previewImg} alt="ตัวอย่างรูปภาพ" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="w-8 h-8 rounded-full bg-ink text-white absolute -top-3 -right-3 flex items-center justify-center shadow-lg"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
