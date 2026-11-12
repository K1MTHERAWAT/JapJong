'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects, Callbacks และ Refs
import React, { useCallback, useEffect, useRef, useState } from 'react';
// นำเข้า Type และข้อมูลคงที่ของงานแจ้งซ่อมบำรุงจากแพ็กเกจกลาง shared
import {
  Equipment,
  PublicAccount,
  REPAIR_CATEGORIES,
  RepairRequest,
  RequestWithTimeline,
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
// นำเข้า UI Components: Chip, StatusChip, Tabs, Timeline
import { Chip, StatusChip, Tabs, Timeline } from '@/components/ui';
// นำเข้า API client, ฟังก์ชันจัดรูปแบบวันเวลาภาษาไทย, และฟังก์ชันบีบอัดรูปภาพ
import { api, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

// กำหนดโหมดหน้าจอ: 'form' (ฟอร์มแจ้งซ่อมใหม่) หรือ 'track' (ติดตามสถานะแจ้งซ่อม)
type Mode = 'form' | 'track';
// กำหนดตัวกรองสถานะติดตาม: 'all' (ทั้งหมด), 'in_progress' (กำลังดำเนินการ), 'acceptance' (รอตรวจรับงาน)
type TrackFilter = 'all' | 'in_progress' | 'acceptance';
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
  const [requesterPhone, setRequesterPhone] = useState(account?.phone || ''); // เบอร์โทรผู้แจ้ง
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
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all'); // ตัวกรองสถานะคำขอ
  const [activeId, setActiveId] = useState<string>(''); // ID คำขอที่กำลังเปิดดูรายละเอียดอยู่ในขณะนี้

  // ตรวจสอบ URL Query Parameters เมื่อเปิดหน้าเว็บ (เช่น ?id=... หรือ ?mode=track)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const idParam = sp.get('id');
    const modeParam = sp.get('mode');
    if (idParam) {
      setActiveId(idParam);
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
  const loadRepairs = useCallback(() => {
    api
      .listRequests({ mine: true, type: 'repair' })
      .then((list) => {
        let typed = list as (RequestWithTimeline & RepairRequest)[];
        if (account?.id) {
          typed = typed.filter((r) => r.requesterId === account.id);
        }
        setRepairs(typed);
        if (typed.length && !typed.some((x) => x.id === activeId)) {
          setActiveId(typed[0].id);
        }
      })
      .catch(() => {});
  }, [activeId, account?.id]);

  // โหลดรายการคำขอเมื่อเปิดหน้าหรือเปลี่ยนบัญชี
  useEffect(() => {
    loadRepairs();
  }, [loadRepairs, account?.id]);

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
    const phoneCheck = validateThaiPhone(requesterPhone || account?.phone || '');
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
      await loadRepairs();
      // นำทางไปยังแท็บติดตามสถานะพร้อมเปิดคำขอที่เพิ่งส่งทันที
      setActiveId(created.id);
      setTrackFilter('all');
      setMode('track');
    } catch (err: any) {
      alert(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอแจ้งซ่อม');
    } finally {
      setSubmitting(false);
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
      await api.updateRepairStatus(id, { action });
      await loadRepairs();
    } finally {
      setSubmitting(false);
    }
  };

  // ค้นหารายการแจ้งซ่อมที่กำลังเลือกดูอยู่ในแท็บติดตาม
  const activeRepair =
    repairs.find((r) => r.id === activeId) ??
    repairs.find((r) => r.status === 'repair_awaiting_acceptance') ??
    repairs[0];

  // กรองรายการคำขอตามตัวกรองที่เลือก (ทั้งหมด, กำลังดำเนินการ, หรือรอตรวจรับ)
  const filteredRepairs = repairs.filter((r) => {
    if (trackFilter === 'in_progress') return r.status === 'repair_in_progress' || r.status === 'repair_submitted';
    if (trackFilter === 'acceptance') return r.status === 'repair_awaiting_acceptance' || r.status === 'repair_done';
    return true;
  });

  return (
    // โครงเลย์เอาต์หลัก พร้อมกำหนดแถบปุ่ม Action Footer ด้านล่าง
    <AppShell
      title={mode === 'form' ? 'แจ้งปัญหา / ซ่อมบำรุง' : 'แจ้งซ่อมของฉัน'}
      backHref={account ? roleHomePath(account.role) : '/'}
      maxWidth="max-w-[1000px]"
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
        ) : activeRepair && activeRepair.status === 'repair_awaiting_acceptance' ? (
          // ปุ่มควบคุมการตรวจรับงานซ่อม (ยังไม่เรียบร้อย / ยืนยันตรวจรับ)
          <div className="flex w-full sm:w-auto gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleAction(activeRepair.id, 'reopen')}
              className="jw-btn-red flex-1 sm:w-44"
            >
              ยังไม่เรียบร้อย
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleAction(activeRepair.id, 'confirm')}
              className="jw-btn flex-1 sm:w-52"
            >
              ยืนยันตรวจรับงานซ่อม
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* แถบสลับแท็บระหว่าง ฟอร์มแจ้งปัญหา กับ ติดตามรายการของฉัน */}
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'form', label: 'แจ้งปัญหา / ซ่อมบำรุง' },
            { value: 'track', label: `แจ้งซ่อมของฉัน (${repairs.length})` },
          ]}
        />

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
                <label className="jw-lbl">ชื่อ-นามสกุลผู้แจ้ง</label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="ระบุชื่อ-นามสกุลผู้แจ้ง"
                  className="jw-in"
                />
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
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="ระบุสถานที่ จุดเกิดเหตุ หรืออุปกรณ์ที่ต้องการแจ้งซ่อม"
                    className="jw-in"
                  />
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
        ) : (
          // ==================== MODE 2: ติดตามสถานะแจ้งซ่อม ====================
          <div className="flex flex-col gap-3.5">
            {/* ตัวกรองสถานะติดตามคำขอ */}
            <Tabs<TrackFilter>
              value={trackFilter}
              onChange={setTrackFilter}
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'in_progress', label: 'กำลังดำเนินการ' },
                { value: 'acceptance', label: 'ตรวจรับงาน' },
              ]}
            />

            {/* การ์ดรายละเอียดคำขอที่เลือก */}
            {activeRepair && (
              <div className="jw-card p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <b className="text-[16px] text-ink block">{activeRepair.title}</b>
                    <span className="text-[13px] text-ink-mute">
                      {activeRepair.code} · {activeRepair.location}
                    </span>
                  </div>
                  <StatusChip status={activeRepair.status} />
                </div>

                {/* รูปภาพแนบของคำขอ */}
                {activeRepair.attachments && activeRepair.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {activeRepair.attachments.map((src, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewImg(src)}
                        className="w-20 h-20 rounded-2xl overflow-hidden border border-line hover:ring-2 hover:ring-brand transition"
                      >
                        <img src={src} alt={`รูปแจ้งซ่อม ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {/* แถบ Timeline ไทม์ไลน์สถานะ */}
                <Timeline steps={activeRepair.timeline} orientation="horizontal" />

                {/* กล่องสรุปความคืบหน้า 3 ขั้นตอน */}
                <div className="pt-2 border-t border-line flex flex-col gap-2.5">
                  <b className="text-[14px] text-ink">ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)</b>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* ขั้นที่ 1: ผู้แจ้งส่งเรื่อง */}
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">1. ผู้แจ้งส่งเรื่อง</span>
                      <span className="text-[13.5px] font-bold text-ink">{activeRepair.requesterName}</span>
                      <span className="text-[12px] text-ink-mute">{formatThaiDateTime(activeRepair.createdAt)}</span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand mt-1">✓ ส่งเรื่องแล้ว</span>
                    </div>
                    {/* ขั้นที่ 2: เจ้าหน้าที่รับเรื่อง & ซ่อม */}
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">2. เจ้าหน้าที่รับเรื่อง & ซ่อม</span>
                      <span className="text-[13.5px] font-bold text-ink">{activeRepair.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}</span>
                      <span className="text-[12px] text-ink-mute">
                        {activeRepair.finishedAt
                          ? `เสร็จ: ${formatThaiDateTime(activeRepair.finishedAt)}`
                          : activeRepair.acceptedAt
                          ? `รับเรื่อง: ${formatThaiDateTime(activeRepair.acceptedAt)}`
                          : 'รอดำเนินการ'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                        activeRepair.finishedAt ? 'text-brand' : activeRepair.acceptedAt ? 'text-amber-600' : 'text-ink-mute'
                      }`}>
                        {activeRepair.finishedAt ? '✓ ซ่อมเสร็จแล้ว' : activeRepair.acceptedAt ? '⟳ กำลังดำเนินการ' : '○ รอช่างรับเรื่อง'}
                      </span>
                    </div>
                    {/* ขั้นที่ 3: ผู้แจ้งตรวจรับงาน */}
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">3. ผู้แจ้งตรวจรับงาน</span>
                      <span className="text-[13.5px] font-bold text-ink">{activeRepair.requesterName}</span>
                      <span className="text-[12px] text-ink-mute">
                        {activeRepair.acceptedByRequesterAt ? formatThaiDateTime(activeRepair.acceptedByRequesterAt) : '-'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                        activeRepair.status === 'repair_done' ? 'text-brand' : activeRepair.status === 'repair_awaiting_acceptance' ? 'text-amber-600' : 'text-ink-mute'
                      }`}>
                        {activeRepair.status === 'repair_done' ? '✓ ตรวจรับเรียบร้อย' : activeRepair.status === 'repair_awaiting_acceptance' ? '⟳ รอคุณตรวจรับ' : '○ รอซ่อมเสร็จ'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* กล่องแสดงผลการซ่อมและรูปถ่ายหลังซ่อมเสร็จ */}
                {(activeRepair.status === 'repair_awaiting_acceptance' || activeRepair.status === 'repair_done') && (
                  <div className={`pt-3 border-t border-line flex flex-col gap-2 p-3.5 rounded-2xl border ${
                    activeRepair.status === 'repair_done'
                      ? 'bg-brand-mint/40 border-brand/30'
                      : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200'
                  }`}>
                    <b className={`text-[14px] ${activeRepair.status === 'repair_done' ? 'text-brand' : 'text-amber-900 dark:text-amber-200'}`}>
                      {activeRepair.status === 'repair_done' ? '✓ งานซ่อมนี้ได้รับการตรวจรับเรียบร้อยแล้ว' : 'งานซ่อมเสร็จเรียบร้อยแล้ว รอการตรวจรับจากคุณ'}
                    </b>
                    <p className={`text-[13px] ${activeRepair.status === 'repair_done' ? 'text-ink' : 'text-amber-800 dark:text-amber-300'}`}>
                      ผลการซ่อม: {activeRepair.resolution || 'ดำเนินการซ่อมเรียบร้อย'}
                    </p>
                    {activeRepair.afterPhotos && activeRepair.afterPhotos.length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-[12px] font-semibold text-ink">รูปภาพหลังซ่อม ({activeRepair.afterPhotos.length} รูป):</span>
                        <div className="flex flex-wrap gap-2">
                          {activeRepair.afterPhotos.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-20 h-20 rounded-xl border border-line overflow-hidden hover:opacity-90 transition shadow-sm"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`รูปหลังซ่อม ${i + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeRepair.status === 'repair_awaiting_acceptance' && (
                      <p className="text-[12px] text-ink-mute">
                        หากผลงานเรียบร้อยดี กรุณากดปุ่ม <b>&quot;ยืนยันตรวจรับงานซ่อม&quot;</b> ด้านล่าง (ไม่ต้องลงนาม)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* รายการคำขอทั้งหมดสำหรับคลิกเลือกดู */}
            <div className="flex flex-col gap-2.5">
              {filteredRepairs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setActiveId(r.id)}
                  className={`jw-card p-4 flex items-center justify-between gap-3 cursor-pointer transition ${
                    activeRepair?.id === r.id ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-brand'
                  }`}
                >
                  <div>
                    <b className="text-[14px] text-ink block">{r.title}</b>
                    <span className="text-[12px] text-ink-mute">
                      {r.code} · {r.location}
                    </span>
                  </div>
                  <StatusChip status={r.status} />
                </div>
              ))}
            </div>
          </div>
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
