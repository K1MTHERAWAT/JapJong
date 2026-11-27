'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects และ Memoization
import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Trash2 } from 'lucide-react';
// นำเข้า Link สำหรับการนำทางระหว่างหน้า
import Link from 'next/link';
// นำเข้า useRouter hook สำหรับสั่งเปลี่ยน URL
import { useRouter } from 'next/navigation';
// นำเข้า Type ข้อมูล, ค่าคงที่ และฟังก์ชันตรวจสอบความถูกต้องจากแพ็กเกจกลาง shared
import {
  EQUIPMENT_CATEGORY_LABEL,
  Equipment,
  EquipmentCategory,
  NAME_MAX_LENGTH,
  OfficialFormPurposeItem,
  PublicAccount,
  clampNameInput,
  formatPricingSummary,
  sanitizeHouseNoInput,
  sanitizeMooInput,
  sanitizePhoneInput,
  validateThaiAddressHierarchy,
  validateThaiPhone,
} from '@japjong/shared';
// นำเข้า Auth Context เพื่อตรวจสอบสิทธิ์ของผู้ใช้งานและเส้นทางหน้าแรกตามบทบาท
import { roleHomePath, useAuth } from '@/components/auth-context';
// นำเข้า AppShell คอมโพเนนต์เลย์เอาต์หลักของแอปพลิเคชัน
import { AppShell } from '@/components/shell';
// นำเข้า Icon แสดงรูปไอคอน SVG
import { Icon } from '@/components/icons';
// นำเข้าคอมโพเนนต์ฟอร์มกรอกเบอร์โทร 10 หลัก และเลือกที่อยู่ไทย 3 ระดับ
import { Phone10DigitInput, ThaiAddressSelect } from '@/components/thai-address-select';
// นำเข้า UI Components: ปฏิทิน C4, ป้าย Chip, ฟอร์มราชการ A4, กล่องลายเซ็น, Stepper
import {
  CalendarC4,
  Chip,
  DatePickerField,
  NameLengthBadge,
  NameLimitWarning,
  OfficialGovFormDocument,
  SearchableCombobox,
  SignatureBox,
  Stepper,
  ThumbnailImage,
  equipmentIconName,
} from '@/components/ui';
// นำเข้า API client และฟังก์ชันจัดรูปแบบวันที่ภาษาไทย
import { api, formatThaiDate, serializeAttachmentFiles } from '@/lib/api';

// ขั้นตอนทั้ง 4 ของการขอยืม–คืนอุปกรณ์ราชการ (4-Step Borrow Wizard)
const STEPS = ['เลือกอุปกรณ์', 'วันยืม-คืน', 'กรอกคำขอ', 'ลงนามและส่ง'];

/**
 * หน้าจอคำขอยืม–คืนอุปกรณ์ราชการ (Borrow Wizard Page)
 * ขั้นที่ 1: เลือกอุปกรณ์และระบุจำนวน -> ขั้นที่ 2: ระบุวันยืมและวันคืน (เช็กสต็อกอัตโนมัติ) -> ขั้นที่ 3: กรอกข้อมูลและที่อยู่ -> ขั้นที่ 4: ลงนามลายเซ็นดิจิทัลและส่งคำขอ
 */
export default function BorrowWizardPage() {
  const router = useRouter();
  const { account, accounts } = useAuth();
  const isStaff = account?.role === 'STAFF' || account?.role === 'ADMIN';
  const [step, setStep] = useState(1); // ขั้นตอนปัจจุบัน (1-4)

  // --- Step 1 State: รายการอุปกรณ์และการเลือกจำนวน ---
  const [equipment, setEquipment] = useState<Equipment[]>([]); // แคตตาล็อกอุปกรณ์ทั้งหมด
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [equipmentError, setEquipmentError] = useState('');
  const [cat, setCat] = useState<'all' | EquipmentCategory>('all'); // ตัวกรองหมวดหมู่อุปกรณ์
  const [search, setSearch] = useState(''); // คำค้นหาชื่ออุปกรณ์
  const [onlyAvailable, setOnlyAvailable] = useState(false); // กรองเฉพาะอุปกรณ์ที่พร้อมใช้งาน
  const [quantities, setQuantities] = useState<Record<string, number>>({}); // จำนวนที่ต้องการยืมของแต่ละอุปกรณ์ { [id]: qty }
  const [cardView, setCardView] = useState<'grid' | 'list'>('grid'); // รูปแบบการแสดงผล Grid หรือ List
  const [expandedEquipmentId, setExpandedEquipmentId] = useState<string | null>(null);
  const [inspectedEquipment, setInspectedEquipment] = useState<Equipment | null>(null);
  const [showCartModal, setShowCartModal] = useState(false);
  const toggleEquipmentDetail = (id: string) => {
    setExpandedEquipmentId((prev) => (prev === id ? null : id));
  };

  /**
   * ฟังก์ชันปรับจำนวนยืมของอุปกรณ์ (จำกัดให้อยู่ระหว่าง 0 ถึงจำนวนคงเหลือสูงสุด)
   */
  const setQty = (id: string, max: number, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  // รวมรายการอุปกรณ์ที่ถูกเลือกยืม (จำนวนมากกว่า 0)
  const selectedItems = useMemo(() => {
    return equipment
      .map((eq) => ({ eq, qty: quantities[eq.id] ?? 0 }))
      .filter((x) => x.qty > 0);
  }, [equipment, quantities]);

  // รวมจำนวนชิ้นทั้งหมดที่เลือกยืม
  const totalSelectedUnits = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.qty, 0);
  }, [selectedItems]);

  // --- Walk-in State: โหมดกรอกคำขอแทนผู้มาติดต่อ (สำหรับเจ้าหน้าที่) ---
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInQuery, setWalkInQuery] = useState('');
  const [foundUser, setFoundUser] = useState<PublicAccount | null>(null);

  // --- Step 2 State: กำหนดช่วงวันที่ยืมและวันที่คืน (แบบรายวัน) ---
  const [month, setMonth] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // วันที่รับอุปกรณ์ (ไม่เลือกไว้ล่วงหน้า ให้ผู้ใช้เลือกเอง)
  const [pickupDate, setPickupDate] = useState('');

  // วันที่กำหนดส่งคืนอุปกรณ์ (ไม่เลือกไว้ล่วงหน้า ให้ผู้ใช้เลือกเอง)
  const [returnDate, setReturnDate] = useState('');

  const hasSelectedDates = Boolean(pickupDate && returnDate);

  // คำนวณจำนวนวันยืมรวม
  const borrowDays = useMemo(() => {
    if (!pickupDate || !returnDate) return 0;
    const s = new Date(pickupDate).getTime();
    const e = new Date(returnDate).getTime();
    const diff = Math.round((e - s) / 86400000);
    return Math.max(1, diff + 1);
  }, [pickupDate, returnDate]);

  // โครงสร้างสรุปการตรวจสอบสต็อกคงเหลือของอุปกรณ์ตามช่วงวันที่เลือก
  interface EquipmentSummaryItem {
    equipmentId: string;
    name: string;
    requestedQty: number;
    maxReservedInPeriod: number;
    minAvailableInPeriod: number;
    totalStock: number;
    isShortage: boolean;
  }

  const [equipmentAvailability, setEquipmentAvailability] = useState<any[]>([]);
  const [equipmentSummary, setEquipmentSummary] = useState<EquipmentSummaryItem[]>([]);
  const [isEquipmentAvailable, setIsEquipmentAvailable] = useState(true);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const selectedItemsKey = useMemo(
    () => selectedItems.map((s) => `${s.eq.id}:${s.qty}`).join(','),
    [selectedItems],
  );

  useEffect(() => {
    if (selectedItems.length === 0) {
      setEquipmentAvailability((prev) => (prev.length === 0 ? prev : []));
      setEquipmentSummary((prev) => (prev.length === 0 ? prev : []));
      setIsEquipmentAvailable(true);
      return;
    }

    let active = true;
    const hasDates = Boolean(pickupDate && returnDate);
    if (hasDates) {
      setCheckingAvailability(true);
    } else {
      setEquipmentSummary((prev) => (prev.length === 0 ? prev : []));
      setIsEquipmentAvailable(true);
    }

    api
      .checkEquipmentAvailability({
        items: selectedItems.map((s) => ({ equipmentId: s.eq.id, qty: s.qty })),
        pickupDate: pickupDate || undefined,
        returnDate: returnDate || undefined,
        month,
      })
      .then((res) => {
        if (!active) return;
        setEquipmentAvailability(res.dayAvailability);
        if (hasDates) {
          setEquipmentSummary(res.summary);
          setIsEquipmentAvailable(res.isAvailable);
        }
      })
      .catch(() => {
        if (active) {
          setEquipmentAvailability([]);
          setEquipmentSummary([]);
          setIsEquipmentAvailable(true);
        }
      })
      .finally(() => {
        if (active && hasDates) setCheckingAvailability(false);
      });

    return () => {
      active = false;
    };
  }, [selectedItemsKey, pickupDate, returnDate, month]);

  // Step 3: Form Fields State (ตามแบบคำขอใช้อุปกรณ์ราชการ)
  const parseTitleAndName = (rawName?: string) => {
    const n = (rawName || '').trim();
    if (n.startsWith('นางสาว')) return { title: 'นางสาว', name: n.slice(6).trim() };
    if (n.startsWith('นาง')) return { title: 'นาง', name: n.slice(3).trim() };
    if (n.startsWith('นาย')) return { title: 'นาย', name: n.slice(3).trim() };
    return { title: 'นาย', name: n };
  };

  const [writtenAt, setWrittenAt] = useState('');
  const [requesterTitle, setRequesterTitle] = useState(() => parseTitleAndName(account?.name).title);
  const [requesterTitleOther, setRequesterTitleOther] = useState('');
  const [requesterName, setRequesterName] = useState(() => parseTitleAndName(account?.name).name);
  const effectiveRequesterTitle = requesterTitle === 'อื่นๆ' ? requesterTitleOther.trim() : requesterTitle;
  const fullRequesterName = requesterName.trim() ? `${effectiveRequesterTitle} ${requesterName.trim()}` : '';
  const [requesterPhone, setRequesterPhone] = useState(() => sanitizePhoneInput(account?.phone || '', 10));
  const [requesterPosition, setRequesterPosition] = useState(
    account?.position && account.position !== 'ประชาชน' ? account.position : '',
  );
  const [addressHouseNo, setAddressHouseNo] = useState(() => sanitizeHouseNoInput(account?.addressHouseNo || ''));
  const [addressMoo, setAddressMoo] = useState(() => sanitizeMooInput(account?.addressMoo || ''));
  const [addressSubdistrict, setAddressSubdistrict] = useState(account?.addressSubdistrict || '');
  const [addressDistrict, setAddressDistrict] = useState(account?.addressDistrict || '');
  const [addressProvince, setAddressProvince] = useState(account?.addressProvince || '');
  const [addressSubdistrictId, setAddressSubdistrictId] = useState(account?.addressSubdistrictId || '');
  const [addressDistrictId, setAddressDistrictId] = useState(account?.addressDistrictId || '');
  const [addressProvinceId, setAddressProvinceId] = useState(account?.addressProvinceId || '');
  const [organization, setOrganization] = useState(account?.department || '');

  const [purpose, setPurpose] = useState('');
  const [purposeItems, setPurposeItems] = useState<OfficialFormPurposeItem[]>([
    { item: '', forWhat: '' },
  ]);

  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState<{ name: string; url: string; isImage: boolean } | null>(null);
  const [showRequestErrors, setShowRequestErrors] = useState(false);

  // Step 4: Signature & Submitting State
  const [signature, setSignature] = useState('');
  const [staffSignature, setStaffSignature] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!attachmentPreview) return;
    return () => URL.revokeObjectURL(attachmentPreview.url);
  }, [attachmentPreview]);

  const applyAccountFields = (acc: PublicAccount | null) => {
    const { title, name } = parseTitleAndName(acc?.name);
    setRequesterTitle(title);
    setRequesterTitleOther('');
    setRequesterName(name);
    setRequesterPhone(sanitizePhoneInput(acc?.phone || '', 10));
    setRequesterPosition(acc?.position && acc.position !== 'ประชาชน' ? acc.position : '');
    setOrganization(acc?.department || '');
    setAddressHouseNo(sanitizeHouseNoInput(acc?.addressHouseNo || ''));
    setAddressMoo(sanitizeMooInput(acc?.addressMoo || ''));
    setAddressSubdistrict(acc?.addressSubdistrict || '');
    setAddressDistrict(acc?.addressDistrict || '');
    setAddressProvince(acc?.addressProvince || '');
    setAddressSubdistrictId(acc?.addressSubdistrictId || '');
    setAddressDistrictId(acc?.addressDistrictId || '');
    setAddressProvinceId(acc?.addressProvinceId || '');
  };

  const handleToggleWalkIn = (walkInMode: boolean) => {
    setIsWalkIn(walkInMode);
    setFoundUser(null);
    setWalkInQuery('');
    if (walkInMode) {
      applyAccountFields(null);
      setSignature('');
    } else if (account) {
      applyAccountFields(account);
    }
  };

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
      applyAccountFields(match);
    } else {
      setFoundUser(null);
      if (digits.length >= 9) {
        setRequesterPhone(sanitizePhoneInput(walkInQuery.trim(), 10));
      } else {
        setRequesterName(walkInQuery.trim());
      }
    }
  };

  useEffect(() => {
    api.equipment()
      .then((items) => {
        setEquipment(items);
        setEquipmentError('');
      })
      .catch(() => setEquipmentError('โหลดรายการอุปกรณ์ไม่สำเร็จ ลองโหลดรายการอีกครั้ง'))
      .finally(() => setEquipmentLoading(false));
  }, []);

  useEffect(() => {
    if (account && !isWalkIn) {
      const { title, name } = parseTitleAndName(account.name);
      setRequesterTitle(title);
      setRequesterTitleOther('');
      setRequesterName(name);
      setRequesterPhone(sanitizePhoneInput(account.phone || '', 10));
      setOrganization(account.department || '');
      if (account.position && account.position !== 'ประชาชน') setRequesterPosition(account.position);
      if (account.addressHouseNo) setAddressHouseNo(sanitizeHouseNoInput(account.addressHouseNo));
      if (account.addressMoo) setAddressMoo(sanitizeMooInput(account.addressMoo));
      if (account.addressSubdistrict) setAddressSubdistrict(account.addressSubdistrict);
      if (account.addressDistrict) setAddressDistrict(account.addressDistrict);
      if (account.addressProvince) setAddressProvince(account.addressProvince);
    }
  }, [account, isWalkIn]);

  // ซิงค์รายการอุปกรณ์ที่เลือกลงในแบบคำขอใช้อุปกรณ์ราชการ
  const syncFormPurposeItems = () => {
    if (!selectedItems.length) return;
    setPurposeItems((prev) => {
      const generated: OfficialFormPurposeItem[] = [];
      selectedItems.forEach((it, idx) => {
        generated.push({
          item: `${it.eq.name} จำนวน ${it.qty} ชุด/รายการ`,
          forWhat: prev[idx]?.forWhat || 'ใช้ในกิจกรรมของหน่วยงาน/ชุมชน',
        });
      });
      return generated.length > 0 ? generated : [{ item: '', forWhat: '' }];
    });
  };

  useEffect(() => {
    syncFormPurposeItems();
  }, [selectedItems]);

  const filtered = useMemo(() => {
    return equipment.filter((e) => {
      if (!e.enabled) return false;
      if (onlyAvailable && e.stock <= 0) return false;
      if (cat !== 'all' && e.category !== cat) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const catLabel = (EQUIPMENT_CATEGORY_LABEL[e.category] || '').toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !catLabel.includes(q)) return false;
      }
      return true;
    });
  }, [equipment, cat, search, onlyAvailable]);

  // Handle Calendar Pick
  const handlePickCalendarDate = (dateStr: string) => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    if (dateStr < todayStr) return;

    if (!pickupDate || !returnDate) {
      setPickupDate(dateStr);
      setReturnDate(dateStr);
    } else if (pickupDate === returnDate && dateStr > pickupDate) {
      setReturnDate(dateStr);
    } else if (dateStr < pickupDate) {
      setPickupDate(dateStr);
    } else {
      setPickupDate(dateStr);
      setReturnDate(dateStr);
    }
  };

  const setPresetDays = (days: number) => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const baseStr = pickupDate || todayStr;
    if (!pickupDate) {
      setPickupDate(baseStr);
    }
    const s = new Date(baseStr);
    const e = new Date(s);
    e.setDate(s.getDate() + (days - 1));
    setReturnDate(e.toISOString().slice(0, 10));
  };

  // Missing fields validation for Step 3
  const phoneValidation = validateThaiPhone(requesterPhone);
  const addressValidation =
    addressProvince.trim() && addressDistrict.trim() && addressSubdistrict.trim()
      ? validateThaiAddressHierarchy({
          province: addressProvince,
          district: addressDistrict,
          subdistrict: addressSubdistrict,
          provinceId: addressProvinceId,
          districtId: addressDistrictId,
          subdistrictId: addressSubdistrictId,
        })
      : null;

  const missingRequestFields = [
    ...[
      ['สถานที่เขียนคำขอ', writtenAt],
      ['คำนำหน้า', effectiveRequesterTitle],
      ['ชื่อ-นามสกุลผู้ยื่นคำขอ', requesterName],
      ['ตำแหน่ง', requesterPosition],
      ['บ้านเลขที่', addressHouseNo],
      ['หมู่ที่', addressMoo],
      ['จังหวัด', addressProvince],
      ['อำเภอ / เขต', addressDistrict],
      ['ตำบล / แขวง', addressSubdistrict],
      ['หน่วยงาน / ชุมชน', organization],
    ]
      .filter(([, value]) => !String(value).trim())
      .map(([label]) => label),
    ...(!phoneValidation.valid ? [phoneValidation.error || 'เบอร์โทรศัพท์ติดต่อ (ต้องเป็นตัวเลข 10 หลัก)'] : []),
    ...(addressValidation && !addressValidation.valid && addressValidation.error ? [addressValidation.error] : []),
    ...(attachmentFiles.length === 0 ? ['สำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ'] : []),
    ...purposeItems.flatMap((item, index) => [
      ...(!item.item.trim() ? [`รายการที่ ${index + 1}`] : []),
      ...(!item.forWhat.trim() ? [`วัตถุประสงค์ของรายการที่ ${index + 1}`] : []),
    ]),
  ];

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const serializedAttachments = await serializeAttachmentFiles(attachmentFiles);
      const created = await api.createBorrow({
        items: selectedItems.map((s) => ({ equipmentId: s.eq.id, qty: s.qty })),
        pickupDate,
        returnDate,
        purpose: purpose || 'ใช้ในกิจกรรมของหน่วยงาน/ชุมชน',
        organization,
        requesterId: isWalkIn && foundUser ? foundUser.id : undefined,
        requesterName: fullRequesterName || requesterName,
        requesterPhone: sanitizePhoneInput(requesterPhone, 10),
        requesterSignature: signature,
        createdByStaffSignature: isWalkIn && staffSignature.trim() ? staffSignature : undefined,
        writtenAt,
        requesterPosition,
        addressHouseNo,
        addressMoo,
        addressSubdistrict,
        addressDistrict,
        addressProvince,
        addressSubdistrictId: addressSubdistrictId || undefined,
        addressDistrictId: addressDistrictId || undefined,
        addressProvinceId: addressProvinceId || undefined,
        purposeItems: purposeItems.filter((pi) => pi.item.trim() || pi.forWhat.trim()),
        attachments: serializedAttachments,
      } as any);
      router.push(`/requests/${created.id}`);
    } catch (err: any) {
      alert(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอยืมอุปกรณ์');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={
        step === 1
          ? 'เลือกอุปกรณ์'
          : step === 2
          ? 'วันยืม-คืน'
          : step === 3
          ? 'แบบคำขอยืมอุปกรณ์'
          : 'ลงนามและส่งคำขอ'
      }
      step={step}
      totalSteps={4}
      backHref={step === 1 ? (account ? roleHomePath(account.role) : '/') : undefined}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      maxWidth="max-w-[1360px]"
      footer={
        step === 1 ? (
          <div className="w-full flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowCartModal(true)}
              className="flex items-center gap-3 min-w-0 px-3 py-1.5 rounded-2xl border border-line bg-surface hover:border-brand hover:bg-brand-mint/20 transition text-left cursor-pointer"
            >
              <div className="relative w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShoppingCart className="size-5" />
                {selectedItems.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[11px] font-extrabold flex items-center justify-center shadow">
                    {selectedItems.length}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] sm:text-[14.5px] font-bold text-ink truncate">
                    {totalSelectedUnits > 0 ? `ตะกร้ายืม (${totalSelectedUnits} ชุด)` : 'ตะกร้ายืมว่างอยู่'}
                  </span>
                </div>
                <span className="text-[11.5px] text-ink-mute block truncate">
                  {selectedItems.length > 0
                    ? `${selectedItems.length} รายการ · กดเพื่อปรับจำนวนหรือลบ`
                    : 'เลือกอุปกรณ์จากการ์ดด้านบน'}
                </span>
              </div>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuantities({})}
                  className="hidden sm:inline-flex items-center justify-center h-10 px-3.5 rounded-xl border border-line bg-surface text-[12.5px] font-semibold text-ink-mute hover:text-status-crit hover:bg-soft transition"
                >
                  ล้างทั้งหมด
                </button>
              )}
              <Link
                href="/borrow/my"
                className="hidden md:inline-flex h-10 px-3.5 rounded-xl border border-line bg-surface text-[12.5px] font-semibold text-ink hover:bg-soft transition items-center justify-center"
              >
                รายการของฉัน
              </Link>
              <button
                type="button"
                disabled={selectedItems.length === 0}
                onClick={() => setStep(2)}
                className="jw-btn h-11 px-4 sm:px-5 rounded-control text-body font-semibold flex items-center gap-2 shadow-sm whitespace-nowrap"
              >
                <span>ถัดไป · วันยืม-คืน</span>
                <Icon name="chevron-right" className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(1)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={!hasSelectedDates || !isEquipmentAvailable || checkingAvailability}
              onClick={() => {
                syncFormPurposeItems();
                setStep(3);
              }}
              className="jw-btn flex-[1.5] sm:w-56"
              title={
                !hasSelectedDates
                  ? 'กรุณาเลือกวันรับและวันคืนอุปกรณ์'
                  : !isEquipmentAvailable
                  ? 'อุปกรณ์บางรายการไม่เพียงพอในวันที่เลือก'
                  : undefined
              }
            >
              {!hasSelectedDates
                ? 'กรุณาเลือกวันยืม-คืน'
                : checkingAvailability
                ? 'กำลังตรวจสอบสต็อก...'
                : !isEquipmentAvailable
                ? 'อุปกรณ์ไม่ว่างในวันที่เลือก'
                : `ถัดไป · กรอกคำขอ (${borrowDays} วัน)`}
            </button>
          </div>
        ) : step === 3 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(2)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => {
                if (missingRequestFields.length > 0) {
                  setShowRequestErrors(true);
                  window.setTimeout(() => {
                    document.getElementById('request-form-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 0);
                  return;
                }
                setShowRequestErrors(false);
                setStep(4);
              }}
              className="jw-btn flex-[1.5] sm:w-56"
            >
              ถัดไป · ลงนามและส่ง
            </button>
          </div>
        ) : (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(3)} className="jw-btn-sec flex-1 sm:w-28">
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 2500);
              }}
              className="jw-btn-sec flex-1 sm:w-32"
            >
              บันทึกร่าง
            </button>
            <button
              type="button"
              disabled={submitting || !signature.trim()}
              onClick={handleSubmit}
              className="jw-btn flex-[1.5] sm:w-48"
            >
              {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอยืมอุปกรณ์'}
            </button>
          </div>
        )
      }
    >
      {/* Header สไตล์การ์ดเดี่ยวสำหรับคอมพิวเตอร์ (มือถือใช้ Unified Progress Header ด้านบน) - ตรึงไว้ด้านบน (Sticky Header) */}
      {step === 1 && (
        <div className="hidden md:block sticky top-0 md:top-[48px] lg:top-0 z-20 pt-1 pb-3 -mt-1 bg-background/95 backdrop-blur-md">
          <div className="jw-card p-0 overflow-hidden shadow-card border border-line bg-surface">
            <div className="p-3.5 sm:px-5 sm:py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                  1
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-[15px] sm:text-[16px] text-ink block leading-tight">
                      เลือกอุปกรณ์ที่ต้องการยืม
                    </b>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/20">
                      ขั้นตอนที่ 1 จาก 4
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-mute mt-0.5">
                    เลือกรายการอุปกรณ์และระบุจำนวนที่ต้องการยืม (สามารถเลือกได้หลายรายการในคำขอเดียวกัน)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-brand-mint text-brand border border-brand/20">
                  {selectedItems.length > 0
                    ? `เลือกแล้ว ${selectedItems.length} รายการ (${totalSelectedUnits} ชิ้น)`
                    : 'ยังไม่ได้เลือกอุปกรณ์'}
                </span>
              </div>
            </div>
            <div className="w-full h-[3px] bg-line/30">
              <div className="h-full bg-brand transition-all duration-300" style={{ width: '25%' }} />
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 1: เลือกอุปกรณ์ (Layout B) ================= */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          {/* แถบค้นหาและตัวกรองแบบรวมศูนย์ (Unified Search & Filter Control Bar - Single Row) */}
          <div className="jw-card p-3.5 sm:p-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-ph pointer-events-none">
                  <Icon name="search" className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่ออุปกรณ์ หรือหมวดหมู่อุปกรณ์..."
                  className="w-full h-10 pl-10 pr-8 rounded-xl bg-soft border border-line text-[13.5px] text-ink placeholder:text-ink-ph focus:outline-none focus:border-brand focus:bg-surface transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-hover flex items-center justify-center text-ink-mute hover:text-ink transition"
                    title="ล้างคำค้นหา"
                  >
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* ตัวกรองประเภทอุปกรณ์ (Dropdown List) */}
                <SearchableCombobox
                  size="compact"
                  searchable={false}
                  clearable={false}
                  value={cat}
                  onChange={(val) => setCat(val as 'all' | EquipmentCategory)}
                  prefix={
                    <>
                      <Icon name="filter" className="w-3.5 h-3.5 text-brand shrink-0" />
                      <span className="text-[12.5px] font-bold text-ink leading-none shrink-0">ประเภท:</span>
                    </>
                  }
                  options={(
                    [
                      ['all', 'ทั้งหมด'],
                      ['audio', 'เครื่องเสียง'],
                      ['tent', 'เต็นท์ / โต๊ะ / เก้าอี้'],
                      ['it', 'IT / โสตทัศนูปกรณ์'],
                    ] as const
                  ).map(([val, label]) => {
                    const enabledList = equipment.filter((e) => e.enabled);
                    const count =
                      val === 'all'
                        ? enabledList.length
                        : enabledList.filter((e) => e.category === val).length;
                    return {
                      value: val,
                      label,
                      badge: `${count}`,
                    };
                  })}
                />

                <button
                  type="button"
                  onClick={() => setOnlyAvailable((v) => !v)}
                  className={`h-10 px-3.5 rounded-xl border text-[12.5px] font-semibold transition flex items-center gap-2 ${
                    onlyAvailable
                      ? 'border-brand bg-brand-mint text-brand'
                      : 'border-line bg-soft text-ink-soft hover:bg-hover'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center ${
                      onlyAvailable ? 'bg-brand border-brand text-white' : 'border-line bg-surface'
                    }`}
                  >
                    {onlyAvailable && <Icon name="check" className="w-2.5 h-2.5" strokeWidth={3} />}
                  </span>
                  <span>เฉพาะที่พร้อมใช้งาน</span>
                </button>

                <div className="flex items-center bg-soft border border-line rounded-xl p-1 h-10">
                  <button
                    type="button"
                    onClick={() => setCardView('grid')}
                    className={`px-2.5 h-full rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition ${
                      cardView === 'grid'
                        ? 'bg-brand text-white shadow-xs'
                        : 'text-ink-mute hover:text-ink'
                    }`}
                    title="มุมมองการ์ด"
                  >
                    <Icon name="layout-grid" className="w-3.5 h-3.5" />
                    <span>การ์ด</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardView('list')}
                    className={`px-2.5 h-full rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition ${
                      cardView === 'list'
                        ? 'bg-brand text-white shadow-xs'
                        : 'text-ink-mute hover:text-ink'
                    }`}
                    title="มุมมองแถวแนวนอน"
                  >
                    <Icon name="align-left" className="w-3.5 h-3.5" />
                    <span>แถว</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {equipmentError && (
            <div role="alert" className="rounded-2xl border border-[#F1B8B8] bg-[#FFF1F1] p-4 text-[13px] text-[#8A2424]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{equipmentError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEquipmentLoading(true);
                    setEquipmentError('');
                    api
                      .equipment()
                      .then(setEquipment)
                      .catch(() => setEquipmentError('โหลดรายการอุปกรณ์ไม่สำเร็จ ลองโหลดรายการอีกครั้ง'))
                      .finally(() => setEquipmentLoading(false));
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  ลองอีกครั้ง
                </button>
              </div>
            </div>
          )}

          {equipmentLoading ? (
            <div role="status" className="jw-card p-8 text-center text-[13px] text-ink-mute">
              กำลังโหลดรายการอุปกรณ์…
            </div>
          ) : null}

          {!equipmentLoading && !equipmentError && filtered.length === 0 && (
            <div className="jw-card p-10 text-center flex flex-col items-center gap-2">
              <b className="block text-[15px] text-ink">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไขการค้นหา</b>
              <span className="block text-[13px] text-ink-mute">
                ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองประเภทอุปกรณ์
              </span>
              <button
                type="button"
                onClick={() => {
                  setCat('all');
                  setOnlyAvailable(false);
                  setSearch('');
                }}
                className="mt-2 h-9 px-4 rounded-xl bg-brand-mint text-brand text-[12.5px] font-semibold hover:bg-brand/15 transition"
              >
                รีเซ็ตตัวกรองทั้งหมด
              </button>
            </div>
          )}

          {/* พื้นที่แสดงรายการอุปกรณ์บนมือถือ: แบบจัดกลุ่มตามหมวดหมู่ กด > เพื่อขยายดูรายละเอียดและรูป 4:3 */}
          {!equipmentLoading && filtered.length > 0 && (
            <div className="md:hidden flex flex-col gap-5">
              {(['audio', 'tent', 'it'] as EquipmentCategory[]).map((categoryKey) => {
                const groupItems = filtered.filter((eq) => eq.category === categoryKey);
                if (groupItems.length === 0) return null;
                return (
                  <section key={categoryKey} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-0.5">
                      <h2 className="text-body font-bold text-ink">{EQUIPMENT_CATEGORY_LABEL[categoryKey]}</h2>
                      <span className="text-caption font-medium text-ink-mute">{groupItems.length} รายการ</span>
                    </div>
                    <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line-soft shadow-xs">
                      {groupItems.map((eq) => {
                        const qty = quantities[eq.id] ?? 0;
                        const isSelected = qty > 0;
                        const outOfStock = eq.stock <= 0;
                        const isExpanded = expandedEquipmentId === eq.id;
                        return (
                          <div
                            key={eq.id}
                            className={`flex flex-col transition ${
                              isSelected ? 'bg-brand-tint/40' : 'bg-surface'
                            } ${outOfStock ? 'opacity-60' : ''}`}
                          >
                            <div className="min-h-[64px] flex items-stretch">
                              <label
                                htmlFor={`mob-eq-${eq.id}`}
                                className="w-3/4 min-w-0 flex items-center gap-3 py-3 pl-4 pr-1.5 cursor-pointer select-none"
                              >
                                <input
                                  id={`mob-eq-${eq.id}`}
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={outOfStock}
                                  onChange={() => {
                                    if (!outOfStock) setQty(eq.id, eq.stock, isSelected ? 0 : 1);
                                  }}
                                  className="w-5 h-5 rounded-[6px] accent-brand shrink-0 cursor-pointer"
                                />
                                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                                  <div className="text-body font-semibold text-ink leading-snug">
                                    {eq.name}
                                  </div>
                                  <div className="text-caption font-medium text-ink-soft leading-snug">
                                    คงเหลือ {eq.stock} ชุด{qty > 0 ? ` · เลือก ${qty} ชุด` : ''}
                                  </div>
                                  <div className="text-[12px] text-brand font-medium leading-snug">
                                    {formatPricingSummary(eq.pricingMode, eq.feeAmount, eq.depositAmount)}
                                  </div>
                                </div>
                              </label>
                              <button
                                type="button"
                                aria-label={`รายละเอียด ${eq.name}`}
                                aria-expanded={isExpanded}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleEquipmentDetail(eq.id);
                                }}
                                className="w-1/4 min-h-[44px] shrink-0 flex items-center justify-end pr-4 text-ink-mute hover:text-brand transition cursor-pointer"
                              >
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                  className={`transition-transform duration-150 ${isExpanded ? 'rotate-90 text-brand' : ''}`}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="px-4 pb-3.5 pt-2 border-t border-line-soft bg-soft/60 space-y-2.5 text-[12px]">
                                {eq.images?.[0] && (
                                  <div className="aspect-[4/3] w-full rounded-xl overflow-hidden border border-line bg-brand-mint">
                                    <ThumbnailImage
                                      src={eq.images[0]}
                                      alt={eq.name}
                                      iconName={equipmentIconName(eq.category)}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="p-2 rounded-lg bg-surface border border-line">
                                    <span className="text-ink-mute block text-[11px]">หมวดหมู่</span>
                                    <b className="text-ink">{EQUIPMENT_CATEGORY_LABEL[eq.category]}</b>
                                  </div>
                                  <div className="p-2 rounded-lg bg-surface border border-line">
                                    <span className="text-ink-mute block text-[11px]">คงคลังทั้งหมด</span>
                                    <b className="text-ink">{eq.stock} ชุด</b>
                                  </div>
                                  <div className="col-span-2 p-2 rounded-lg bg-surface border border-line">
                                    <span className="text-ink-mute block text-[11px]">ค่าธรรมเนียม / มัดจำ</span>
                                    <b className="text-brand">
                                      {formatPricingSummary(eq.pricingMode, eq.feeAmount, eq.depositAmount)}
                                    </b>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                  <span className="text-[12px] font-semibold text-ink-soft">จำนวนที่ต้องการยืม</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={qty <= 0}
                                      onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                                      className="w-8 h-8 rounded-full border border-line bg-surface flex items-center justify-center disabled:opacity-30 cursor-pointer"
                                    >
                                      <Icon name="minus" className="w-3.5 h-3.5" />
                                    </button>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      max={eq.stock}
                                      value={qty}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                        setQty(eq.id, eq.stock, Number.isNaN(val) ? 0 : val);
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      aria-label={`จำนวนที่ต้องการยืม ${eq.name}`}
                                      className="w-14 h-9 text-center text-[14px] font-bold rounded-xl border border-line bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      disabled={outOfStock || qty >= eq.stock}
                                      onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                                      className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
                                    >
                                      <Icon name="plus" className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* พื้นที่แสดงรายการอุปกรณ์บน Desktop (Layout B Full-Width Grid / List) */}
          {!equipmentLoading && filtered.length > 0 && cardView === 'list' ? (
            <div className="hidden md:grid grid-cols-1 gap-3">
              {filtered.map((eq) => {
                const qty = quantities[eq.id] ?? 0;
                const isSelected = qty > 0;
                const outOfStock = eq.stock <= 0;

                return (
                  <div
                    key={eq.id}
                    className={`group bg-surface rounded-2xl p-3.5 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      outOfStock ? 'opacity-60 border-line' : 'hover:shadow-card'
                    } ${
                      isSelected
                        ? 'border-brand ring-2 ring-brand/25 bg-brand-mint/20'
                        : 'border-line'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={outOfStock ? -1 : 0}
                      onClick={() => {
                        if (!outOfStock) setQty(eq.id, eq.stock, isSelected ? 0 : 1);
                      }}
                      onKeyDown={(e) => {
                        if (!outOfStock && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setQty(eq.id, eq.stock, isSelected ? 0 : 1);
                        }
                      }}
                      className={`flex items-start sm:items-center gap-3.5 min-w-0 flex-1 ${
                        outOfStock ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <div className="w-16 h-16 rounded-xl bg-brand-mint text-brand flex items-center justify-center shrink-0 relative overflow-hidden">
                        <ThumbnailImage
                          src={eq.images?.[0]}
                          alt={eq.name}
                          iconName={equipmentIconName(eq.category)}
                        />
                        {isSelected && (
                          <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center shadow">
                            <Icon name="check" className="w-3 h-3" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[15px] text-ink break-words leading-snug" title={eq.name}>
                            {eq.name}
                          </span>
                          <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-soft border border-line text-ink-soft font-semibold">
                            {EQUIPMENT_CATEGORY_LABEL[eq.category]}
                          </span>
                          {outOfStock ? (
                            <Chip tone="red">ของหมด</Chip>
                          ) : isSelected ? (
                            <Chip tone="green">เลือกแล้ว {qty} ชุด</Chip>
                          ) : (
                            <Chip tone="green">พร้อมยืม</Chip>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-mute mt-1">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="package" className="w-3.5 h-3.5 text-ink-mute" />
                            <span>หมวดหมู่: {EQUIPMENT_CATEGORY_LABEL[eq.category]}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="archive" className="w-3.5 h-3.5 text-brand" />
                            <span>คงเหลือในคลัง {eq.stock} ชุด</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedEquipment(eq);
                        }}
                        className="text-[12px] font-semibold text-ink-mute hover:text-ink underline-offset-2 hover:underline px-2 py-1 cursor-pointer"
                      >
                        ดูรายละเอียด
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                          className="w-8 h-8 rounded-full border border-line bg-surface hover:border-ink flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="minus" className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={eq.stock}
                          value={qty}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            setQty(eq.id, eq.stock, Number.isNaN(val) ? 0 : val);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-12 h-8 text-center text-[13.5px] font-bold rounded-xl border border-line bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          disabled={outOfStock || qty >= eq.stock}
                          onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                          className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-deep disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !equipmentLoading && filtered.length > 0 ? (
            <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filtered.map((eq) => {
                const qty = quantities[eq.id] ?? 0;
                const isSelected = qty > 0;
                const outOfStock = eq.stock <= 0;

                return (
                  <div
                    key={eq.id}
                    className={`group bg-surface rounded-2xl border overflow-hidden transition flex flex-col justify-between ${
                      outOfStock
                        ? 'opacity-60 border-line'
                        : 'hover:shadow-card hover:-translate-y-0.5'
                    } ${
                      isSelected
                        ? 'border-brand ring-2 ring-brand shadow-low'
                        : 'border-line'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={outOfStock ? -1 : 0}
                      onClick={() => {
                        if (!outOfStock) setQty(eq.id, eq.stock, isSelected ? 0 : 1);
                      }}
                      onKeyDown={(e) => {
                        if (!outOfStock && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setQty(eq.id, eq.stock, isSelected ? 0 : 1);
                        }
                      }}
                      className={outOfStock ? 'cursor-not-allowed' : 'cursor-pointer'}
                    >
                      {/* ส่วนหัวการ์ดและรูปภาพ (แบบที่ 2: ภาพเต็มตา h-56 พร้อม Overlay ชื่อและข้อมูลอุปกรณ์ด้านล่างภาพ) */}
                      <div className="h-56 bg-brand-mint relative flex items-center justify-center text-brand overflow-hidden">
                        <ThumbnailImage
                          src={eq.images?.[0]}
                          alt={eq.name}
                          iconName={equipmentIconName(eq.category)}
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        {/* Gradient Overlay ล่างภาพสำหรับข้อความ */}
                        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

                        {/* มุมบนซ้าย: สถานะสต๊อก & หมวดหมู่อุปกรณ์ */}
                        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-10">
                          {outOfStock ? (
                            <Chip tone="red">ของหมด</Chip>
                          ) : isSelected ? (
                            <Chip tone="green">เลือกแล้ว {qty} ชุด</Chip>
                          ) : (
                            <Chip tone="green">พร้อมยืม</Chip>
                          )}
                          <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-surface/90 backdrop-blur text-ink shadow-xs">
                            {EQUIPMENT_CATEGORY_LABEL[eq.category]}
                          </span>
                        </div>

                        {/* มุมบนขวา: เครื่องหมายเลือก */}
                        <div className="absolute top-2.5 right-2.5 z-10">
                          {isSelected ? (
                            <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center shadow-md">
                              <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-surface/85 border border-line flex items-center justify-center text-transparent group-hover:border-brand transition">
                              <Icon name="check" className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        {/* ข้อความซ้อนด้านล่างของรูปภาพ: ชื่ออุปกรณ์ + หมวดหมู่ & จำนวนคงเหลือ */}
                        <div className="absolute bottom-2.5 inset-x-3 text-white flex items-end justify-between gap-2 z-10">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-[15.5px] leading-snug line-clamp-2 break-words drop-shadow-sm text-white" title={eq.name}>
                              {eq.name}
                            </h3>
                            <p className="text-[12px] text-white/90 truncate flex items-center gap-1 mt-0.5">
                              <Icon name="package" className="w-3.5 h-3.5 text-white/80 shrink-0" />
                              <span className="truncate">{EQUIPMENT_CATEGORY_LABEL[eq.category]}</span>
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/20 backdrop-blur text-white shrink-0 shadow-xs">
                            ในคลัง {eq.stock}
                          </span>
                        </div>
                      </div>

                      {/* เนื้อหาการ์ดส่วนล่าง: ข้อมูลสต๊อกและจำนวนที่เลือกแบบกระชับ */}
                      <div className="p-3">
                        <div className="flex items-center justify-between text-[12px] text-ink bg-soft border border-line rounded-xl px-3 py-2">
                          <span className="font-semibold inline-flex items-center gap-1">
                            <Icon name="archive" className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>คงเหลือ {eq.stock} ชุด</span>
                          </span>
                          <span className="text-line">|</span>
                          <span className="font-semibold inline-flex items-center gap-1 text-brand">
                            <Icon name="check" className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>เลือก {qty} ชุด</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ส่วนท้ายการ์ด: ปุ่มดูรายละเอียด + ตัวปรับจำนวน */}
                    <div className="px-3.5 pb-3.5 pt-2.5 border-t border-line flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedEquipment(eq);
                        }}
                        className="text-[12px] font-semibold text-ink-mute hover:text-ink transition py-1 cursor-pointer"
                      >
                        ดูรายละเอียด
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                          className="w-8 h-8 rounded-full border border-line bg-surface hover:border-ink flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="minus" className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={eq.stock}
                          value={qty}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            setQty(eq.id, eq.stock, Number.isNaN(val) ? 0 : val);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-11 h-8 text-center text-[13.5px] font-bold rounded-xl border border-line bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          disabled={outOfStock || qty >= eq.stock}
                          onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                          className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-deep disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* หน้าต่างแสดงรายละเอียดอุปกรณ์บนคอมพิวเตอร์ (Detail Modal) */}
          {inspectedEquipment && (
            <div
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
              onClick={() => setInspectedEquipment(null)}
            >
              <div
                className="bg-surface border border-line rounded-3xl w-[92vw] sm:w-[85vw] lg:w-[75vw] h-[88vh] sm:h-[75vh] max-w-4xl overflow-hidden shadow-pop flex flex-col my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative h-[52%] sm:h-[58%] bg-brand-mint text-brand overflow-hidden shrink-0">
                  <ThumbnailImage
                    src={inspectedEquipment.images?.[0]}
                    alt={inspectedEquipment.name}
                    iconName={equipmentIconName(inspectedEquipment.category)}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setInspectedEquipment(null)}
                    className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur text-white flex items-center justify-center transition shadow-lg cursor-pointer"
                    title="ปิดหน้าต่าง"
                  >
                    <Icon name="x" className="w-5 h-5" />
                  </button>
                  <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
                    {inspectedEquipment.stock <= 0 ? (
                      <Chip tone="red">ของหมด</Chip>
                    ) : (
                      <Chip tone="green">พร้อมยืม</Chip>
                    )}
                    <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-surface/95 backdrop-blur text-ink shadow-sm">
                      {EQUIPMENT_CATEGORY_LABEL[inspectedEquipment.category]}
                    </span>
                  </div>
                  <div className="absolute bottom-4 inset-x-5 sm:inset-x-7 text-white z-10">
                    <h3 className="text-[22px] sm:text-[28px] lg:text-[32px] font-extrabold leading-snug drop-shadow-md text-white">
                      {inspectedEquipment.name}
                    </h3>
                    <p className="text-[13.5px] sm:text-[15px] text-white/90 flex items-center gap-2 mt-1 drop-shadow-sm">
                      <Icon name="package" className="w-4 h-4 text-white/80 shrink-0" />
                      <span>หมวดหมู่: {EQUIPMENT_CATEGORY_LABEL[inspectedEquipment.category]}</span>
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col justify-between gap-4 bg-surface">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px]">
                    <div className="p-4 rounded-2xl bg-soft border border-line">
                      <span className="text-ink-mute block text-[12px]">หมวดหมู่อุปกรณ์</span>
                      <b className="text-[15.5px] text-ink inline-flex items-center gap-2 mt-1">
                        <Icon name="package" className="w-4 h-4 text-brand shrink-0" />
                        <span>{EQUIPMENT_CATEGORY_LABEL[inspectedEquipment.category]}</span>
                      </b>
                    </div>
                    <div className="p-4 rounded-2xl bg-soft border border-line">
                      <span className="text-ink-mute block text-[12px]">จำนวนคงคลังทั้งหมด</span>
                      <b className="text-[15.5px] text-brand inline-flex items-center gap-2 mt-1">
                        <Icon name="archive" className="w-4 h-4 text-brand shrink-0" />
                        <span>{inspectedEquipment.stock} ชุด</span>
                      </b>
                    </div>
                    <div className="p-4 rounded-2xl bg-soft border border-line">
                      <span className="text-ink-mute block text-[12px]">ค่าธรรมเนียม / มัดจำ</span>
                      <b className="text-[15px] text-brand inline-flex items-center gap-2 mt-1">
                        <span>
                          {formatPricingSummary(
                            inspectedEquipment.pricingMode,
                            inspectedEquipment.feeAmount,
                            inspectedEquipment.depositAmount,
                          )}
                        </span>
                      </b>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-line flex items-center justify-between gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setInspectedEquipment(null)}
                      className="h-11 px-5 rounded-xl border border-line bg-surface hover:bg-soft text-[13px] font-semibold text-ink transition cursor-pointer"
                    >
                      ปิดหน้าต่าง
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-[13.5px] font-semibold text-ink-mute">จำนวนขอยืม:</span>
                      <button
                        type="button"
                        disabled={(quantities[inspectedEquipment.id] ?? 0) <= 0}
                        onClick={() =>
                          setQty(
                            inspectedEquipment.id,
                            inspectedEquipment.stock,
                            (quantities[inspectedEquipment.id] ?? 0) - 1,
                          )
                        }
                        className="w-10 h-10 rounded-full border border-line bg-surface hover:border-ink flex items-center justify-center disabled:opacity-30 transition cursor-pointer"
                      >
                        <Icon name="minus" className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={inspectedEquipment.stock}
                        value={quantities[inspectedEquipment.id] ?? 0}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                          setQty(inspectedEquipment.id, inspectedEquipment.stock, Number.isNaN(val) ? 0 : val);
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-14 h-10 text-center font-bold text-[15px] rounded-xl border border-line bg-surface text-ink focus:border-brand focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        disabled={
                          inspectedEquipment.stock <= 0 ||
                          (quantities[inspectedEquipment.id] ?? 0) >= inspectedEquipment.stock
                        }
                        onClick={() =>
                          setQty(
                            inspectedEquipment.id,
                            inspectedEquipment.stock,
                            (quantities[inspectedEquipment.id] ?? 0) + 1,
                          )
                        }
                        className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-deep disabled:opacity-30 transition cursor-pointer"
                      >
                        <Icon name="plus" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Popup ตะกร้าอุปกรณ์ที่เลือก (ปรับจำนวน / พิมพ์ตัวเลข / ลบรายการ) */}
          {showCartModal && (
            <div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setShowCartModal(false)}
            >
              <div
                className="w-full sm:max-w-lg bg-surface border border-line rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-brand/12 text-brand flex items-center justify-center shrink-0">
                      <ShoppingCart className="size-5" />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-ink m-0">ตะกร้าอุปกรณ์ที่เลือก</h3>
                      <p className="text-[12px] text-ink-mute m-0">
                        {selectedItems.length} รายการ · รวม {totalSelectedUnits} ชุด
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setQuantities({})}
                        className="text-xs font-semibold text-status-crit hover:underline px-2 py-1 cursor-pointer"
                      >
                        ล้างทั้งหมด
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowCartModal(false)}
                      className="w-8 h-8 rounded-lg border border-line flex items-center justify-center text-ink-mute hover:text-ink cursor-pointer"
                      aria-label="ปิดตะกร้า"
                    >
                      <Icon name="x" className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
                  {selectedItems.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-soft text-ink-mute mx-auto flex items-center justify-center">
                        <ShoppingCart className="size-6" />
                      </div>
                      <div className="text-sm font-semibold text-ink">ยังไม่มีอุปกรณ์ในตะกร้า</div>
                      <div className="text-xs text-ink-mute">เลือกอุปกรณ์ที่ต้องการยืมจากรายการด้านบนได้เลย</div>
                    </div>
                  ) : (
                    selectedItems.map(({ eq, qty }) => (
                      <div
                        key={eq.id}
                        className="p-3 rounded-2xl border border-line bg-soft/40 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-brand-mint border border-line shrink-0">
                            <ThumbnailImage
                              src={eq.images?.[0]}
                              alt={eq.name}
                              iconName={equipmentIconName(eq.category)}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-bold text-ink truncate">{eq.name}</div>
                            <div className="text-[11.5px] text-ink-mute">
                              คงเหลือ {eq.stock} ชุด ·{' '}
                              <span className="text-brand font-semibold">
                                {formatPricingSummary(eq.pricingMode, eq.feeAmount, eq.depositAmount)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                            className="w-9 h-9 rounded-xl border border-line bg-surface hover:border-brand flex items-center justify-center text-ink cursor-pointer"
                            title="ลดจำนวน"
                          >
                            <Icon name="minus" className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={eq.stock}
                            value={qty}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                              setQty(eq.id, eq.stock, Number.isNaN(val) ? 0 : val);
                            }}
                            onFocus={(e) => e.target.select()}
                            aria-label={`จำนวน ${eq.name}`}
                            className="w-12 h-9 text-center text-[14px] font-bold rounded-xl border border-line bg-surface text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            disabled={qty >= eq.stock}
                            onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                            className="w-9 h-9 rounded-xl bg-brand text-white hover:bg-brand-deep flex items-center justify-center disabled:opacity-30 cursor-pointer"
                            title="เพิ่มจำนวน"
                          >
                            <Icon name="plus" className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setQty(eq.id, eq.stock, 0)}
                            className="w-9 h-9 rounded-xl border border-line bg-surface text-ink-mute hover:text-status-crit hover:border-status-crit/40 flex items-center justify-center cursor-pointer ml-1"
                            title="ลบออกจากตะกร้า"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="px-5 py-3.5 border-t border-line bg-surface flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCartModal(false)}
                    className="jw-btn-sec h-10 px-4 text-sm"
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() => {
                      setShowCartModal(false);
                      setStep(2);
                    }}
                    className="jw-btn h-10 px-5 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <span>ถัดไป · วันยืม-คืน</span>
                    <Icon name="chevron-right" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 2: วันยืม-คืน (รายวันเท่านั้น) ================= */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          {/* ส่วนหัวแสดงโหมดรายวัน */}
          <div className="hidden md:block bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
            <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                  2
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-[15px] sm:text-[16px] text-ink leading-tight">เลือกกำหนดวันยืมและคืนอุปกรณ์</b>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/20">
                      ขั้นตอนที่ 2 จาก 4
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-mute mt-0.5">
                    {selectedItems.map((s) => s.eq.name).join(', ')} · รูปแบบรายวัน (วันรับ - วันคืน)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-brand bg-brand-mint px-3.5 py-1.5 rounded-full border border-brand/20">
                  ยืม-คืนแบบรายวัน
                </span>
              </div>
            </div>
            <div className="w-full h-[3px] bg-line/30">
              <div className="h-full bg-brand transition-all duration-300" style={{ width: '50%' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
            {/* ซ้าย: ปฏิทินแสดงช่วงวันที่เลือก */}
            <div className="flex flex-col gap-3">
              <CalendarC4
                month={month}
                onMonthChange={setMonth}
                availability={equipmentAvailability}
                periods={
                  hasSelectedDates
                    ? [{ start: `${pickupDate}T09:00:00+07:00`, end: `${returnDate}T16:00:00+07:00` }]
                    : []
                }
                onPickDate={handlePickCalendarDate}
              />

              <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-mute px-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-status-ok" />
                  <span>อุปกรณ์ว่างครบ</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>มีคนจองบางส่วน</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-status-crit" />
                  <span>ของไม่พอในวันนั้น</span>
                </div>
              </div>

              <div className="text-[13px] text-ink-mute flex items-center gap-1.5 px-1">
                <Icon name="calendar" className="w-4 h-4 text-brand" />
                <span>แตะเลือกวันที่ในปฏิทินเพื่อกำหนดวันรับหรือวันคืนอุปกรณ์</span>
              </div>
            </div>

            {/* ขวา: กำหนดช่วงวันและปุ่ม Preset */}
            <div className="flex flex-col gap-4">
              <div className="jw-card p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <b className="text-[16px]">ช่วงวันที่ขอยืมอุปกรณ์</b>
                  {hasSelectedDates ? <Chip tone="green">{borrowDays} วัน</Chip> : <Chip tone="gray">ยังไม่ได้เลือก</Chip>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                  <div className="border border-line rounded-xl p-2.5 bg-white flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-ink-mute">วันที่รับอุปกรณ์</span>
                      <span className="text-[12px] text-brand font-semibold">
                        {pickupDate ? formatThaiDate(pickupDate, false) : 'ยังไม่เลือก'}
                      </span>
                    </div>
                    <DatePickerField
                      value={pickupDate}
                      label="วันที่รับอุปกรณ์"
                      onChange={(value) => {
                        setPickupDate(value);
                        if (returnDate && value > returnDate) {
                          setReturnDate(value);
                        }
                      }}
                    />
                  </div>

                  <span className="hidden sm:inline text-ink-mute self-center">
                    <Icon name="arrow-right" className="w-4 h-4" />
                  </span>

                  <div className="border border-line rounded-xl p-2.5 bg-white flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-ink-mute">กำหนดคืนอุปกรณ์</span>
                      <span className="text-[12px] text-brand font-semibold">
                        {returnDate ? formatThaiDate(returnDate, false) : 'ยังไม่เลือก'}
                      </span>
                    </div>
                    <DatePickerField
                      value={returnDate}
                      label="กำหนดคืนอุปกรณ์"
                      onChange={(value) => {
                        setReturnDate(value);
                        if (pickupDate && value < pickupDate) {
                          setPickupDate(value);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* ทางลัดเลือกระยะเวลายืมด่วน */}
                <div>
                  <span className="block text-[12px] font-semibold text-ink-mute mb-2">เลือกระยะเวลายืมด่วน:</span>
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 5, 7, 14].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPresetDays(d)}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${
                          hasSelectedDates && borrowDays === d
                            ? 'bg-brand border-brand text-white'
                            : 'bg-white border-line text-ink hover:border-brand'
                        }`}
                      >
                        {d} วัน
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* การ์ดตรวจสอบสถานะความว่างและจำนวนติดจองของอุปกรณ์ตามช่วงวันที่เลือก */}
              <div className="jw-card p-4 sm:p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <b className="text-[15px] text-ink flex items-center gap-2">
                    <Icon name="package" className="w-4 h-4 text-brand" />
                    <span>สถานะความว่างของอุปกรณ์</span>
                  </b>
                  {!hasSelectedDates ? (
                    <Chip tone="gray">รอเลือกวันที่</Chip>
                  ) : checkingAvailability ? (
                    <span className="text-[12px] text-ink-mute animate-pulse">กำลังตรวจสอบ...</span>
                  ) : isEquipmentAvailable ? (
                    <Chip tone="green">พร้อมให้ยืมทั้งหมด</Chip>
                  ) : (
                    <Chip tone="red">อุปกรณ์ไม่พอ</Chip>
                  )}
                </div>

                <div className="text-[12.5px] text-ink-mute">
                  {hasSelectedDates ? (
                    <>
                      ช่วงวันที่เลือก: <b className="text-ink">{formatThaiDate(pickupDate, false)} – {formatThaiDate(returnDate, true)}</b> ({borrowDays} วัน)
                    </>
                  ) : (
                    <span>กรุณาเลือกวันที่รับและกำหนดคืนอุปกรณ์จากปฏิทินหรือช่องเลือกวันที่</span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {equipmentSummary.map((item) => (
                    <div
                      key={item.equipmentId}
                      className={`p-3 rounded-xl border text-[13px] flex flex-col gap-1.5 ${
                        item.isShortage
                          ? 'bg-red-50/70 border-red-200 text-red-900'
                          : 'bg-canvas border-line text-ink'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <b className="text-[13.5px] break-words leading-snug">{item.name}</b>
                        <span className={`font-bold ${item.isShortage ? 'text-red-700' : 'text-brand'}`}>
                          ขอยืม {item.requestedQty} ชิ้น
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1 text-[12px] text-ink-mute">
                        <span>
                          ติดจองในช่วงนี้: <b className={item.maxReservedInPeriod > 0 ? 'text-amber-700' : 'text-ink'}>{item.maxReservedInPeriod} ชิ้น</b>
                        </span>
                        <span>
                          คงเหลือว่างให้ยืม: <b className={item.isShortage ? 'text-red-700 font-bold' : 'text-brand font-bold'}>{item.minAvailableInPeriod}</b> / {item.totalStock} ชิ้น
                        </span>
                      </div>

                      {item.isShortage && (
                        <div className="text-[12px] font-semibold text-red-700 flex items-center gap-1.5 mt-0.5">
                          <Icon name="alert-triangle" className="w-3.5 h-3.5 shrink-0 text-red-600" />
                          <span>จำนวนไม่พอในวันที่เลือก (ติดจองแล้ว {item.maxReservedInPeriod} ชิ้น ว่างเพียง {item.minAvailableInPeriod} ชิ้น)</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!isEquipmentAvailable && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-[12.5px] text-red-800">
                    <Icon name="alert-triangle" className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>
                      <b>ไม่สามารถดำเนินการต่อได้:</b> อุปกรณ์บางรายการติดจองจนไม่พอตามจำนวนที่ต้องการ กรุณาเปลี่ยนวันยืม-คืน หรือลดจำนวนอุปกรณ์ที่ต้องการยืม
                    </span>
                  </div>
                )}

                {isEquipmentAvailable && equipmentSummary.length > 0 && (
                  <div className="p-3 bg-brand-mint/50 border border-brand/20 rounded-xl flex items-center gap-2 text-[12.5px] text-brand-dark">
                    <Icon name="check" className="w-4 h-4 text-brand shrink-0" />
                    <span>อุปกรณ์ทุกรายการว่างพร้อมให้ยืมตามจำนวนที่ระบุในวันที่เลือก</span>
                  </div>
                )}
              </div>

              {/* การ์ดสรุปอุปกรณ์ที่ยืมพร้อมวัน-เวลา */}
              <div className="jw-card p-4 sm:p-5 flex flex-col gap-3">
                <b className="text-[15px] text-ink">สรุปรายการคำขอ</b>
                <div className="text-[13.5px] text-ink-soft space-y-1">
                  <p>• อุปกรณ์ที่เลือก: <b className="text-ink">{selectedItems.length} รายการ ({totalSelectedUnits} ชิ้น)</b></p>
                  <p>
                    • ระยะเวลาที่ยืม:{' '}
                    {hasSelectedDates ? (
                      <>
                        <b className="text-ink">{borrowDays} วัน</b> ({formatThaiDate(pickupDate, false)} ถึง {formatThaiDate(returnDate, true)})
                      </>
                    ) : (
                      <span className="text-ink-mute">ยังไม่ได้เลือกวันที่</span>
                    )}
                  </p>
                </div>
                <div className="p-3 bg-brand-mint/40 border border-brand/20 rounded-xl flex items-center gap-2 text-[12.5px] text-brand-dark">
                  <Icon name="info" className="w-4 h-4 text-brand shrink-0" />
                  <span>สามารถติดต่อรับและส่งคืนอุปกรณ์ได้ ณ ที่ทำการ อบต. ในวันและเวลาทำการ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: กรอกคำขอ (Copy UI/UX จากขั้นตอนกรอกคำขอของสถานที่) ================= */}
      {step === 3 && (
        <div className="w-full flex flex-col gap-4">
          <div className="jw-card p-5 sm:p-7 flex flex-col gap-4">
            <div className="hidden md:flex pb-3 border-b border-line flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                  3
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-[17px] text-ink block leading-tight">แบบคำขอใช้อุปกรณ์ราชการ</b>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/20">
                      ขั้นตอนที่ 3 จาก 4
                    </span>
                  </div>
                  <span className="text-[12.5px] text-ink-mute">
                    เรื่อง ขออนุญาตใช้อุปกรณ์ของทางราชการ
                  </span>
                </div>
              </div>
              <span className="text-[12.5px] font-semibold text-brand bg-brand-mint px-3 py-1 rounded-full">
                {selectedItems.length} รายการ · {borrowDays} วัน
              </span>
            </div>

            {/* โหมดเจ้าหน้าที่: กรอกคำขอแทนผู้มาติดต่อ */}
            {isStaff && (
              <div className="rounded-2xl border border-brand/30 bg-brand-mint/25 p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-[14px] text-ink block">สำหรับเจ้าหน้าที่: รูปแบบการยื่นคำขอ</b>
                    <span className="text-[12px] text-ink-mute">
                      เลือกว่าต้องการยื่นคำขอในนามตนเอง หรือกรอกคำขอแทนประชาชนผู้มาติดต่อ
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
                      ยื่นในนามตนเอง
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

                {isWalkIn && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-brand/20">
                    <label className="jw-lbl mb-0">ค้นหาข้อมูลผู้มาติดต่อ (เบอร์โทรหรือชื่อ)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-ph">
                          <Icon name="search" className="w-4 h-4" />
                        </span>
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
                          className="jw-in pl-9 h-10"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSearchWalkInUser}
                        className="jw-btn-sec h-10 px-4 text-[13px] shrink-0"
                      >
                        ค้นหา
                      </button>
                    </div>

                    {foundUser ? (
                      <div className="flex items-center justify-between text-[13px] bg-white p-2.5 rounded-xl border border-line">
                        <span>พบข้อมูล: <b>{foundUser.name}</b> ({foundUser.phone || 'ไม่มีเบอร์โทร'}) · {foundUser.department}</span>
                        <Chip tone="green">ดึงข้อมูลแล้ว</Chip>
                      </div>
                    ) : walkInQuery.trim() ? (
                      <div className="text-[12.5px] text-ink-mute">
                        <Chip tone="amber">ผู้มาติดต่อทั่วไป (กรอกชื่อและเบอร์โทรด้านล่างได้เลย)</Chip>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* ข้อมูลผู้ยื่นคำขอในแบบ Grid ตามมาตรฐาน */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className="jw-lbl mb-0">เขียนที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                  <NameLengthBadge value={writtenAt} maxLength={NAME_MAX_LENGTH.WRITTEN_AT} />
                </div>
                <input
                  type="text"
                  value={writtenAt}
                  maxLength={NAME_MAX_LENGTH.WRITTEN_AT}
                  onChange={(e) => setWrittenAt(clampNameInput(e.target.value, NAME_MAX_LENGTH.WRITTEN_AT))}
                  className="jw-in"
                  placeholder="เช่น ที่ทำการ อบต."
                  required
                />
                <NameLimitWarning value={writtenAt} maxLength={NAME_MAX_LENGTH.WRITTEN_AT} />
              </div>
              <div className="lg:col-span-2">
                <label className="jw-lbl">คำนำหน้า<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <SearchableCombobox
                  searchable={false}
                  clearable={false}
                  value={requesterTitle}
                  onChange={setRequesterTitle}
                  placeholder="เลือกคำนำหน้า"
                  options={[
                    { value: 'นาย', label: 'นาย' },
                    { value: 'นาง', label: 'นาง' },
                    { value: 'นางสาว', label: 'นางสาว' },
                    { value: 'อื่นๆ', label: 'อื่นๆ' },
                  ]}
                />
                {requesterTitle === 'อื่นๆ' && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="jw-lbl mb-0">ระบุคำนำหน้า</label>
                      <NameLengthBadge value={requesterTitleOther} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
                    </div>
                    <input
                      type="text"
                      value={requesterTitleOther}
                      maxLength={NAME_MAX_LENGTH.PERSON_NAME}
                      onChange={(e) => setRequesterTitleOther(clampNameInput(e.target.value, NAME_MAX_LENGTH.PERSON_NAME))}
                      className="jw-in"
                      placeholder="พิมพ์คำนำหน้า"
                      required
                    />
                    <NameLimitWarning value={requesterTitleOther} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
                  </div>
                )}
              </div>
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className="jw-lbl mb-0">ข้าพเจ้า<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                  <NameLengthBadge value={requesterName} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
                </div>
                <input
                  type="text"
                  value={requesterName}
                  maxLength={NAME_MAX_LENGTH.PERSON_NAME}
                  onChange={(e) => setRequesterName(clampNameInput(e.target.value, NAME_MAX_LENGTH.PERSON_NAME))}
                  className="jw-in"
                  placeholder="ชื่อ-นามสกุล"
                  required
                />
                <NameLimitWarning value={requesterName} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
              </div>
              <div className="lg:col-span-2">
                <Phone10DigitInput
                  value={requesterPhone}
                  onChange={setRequesterPhone}
                  label="เบอร์โทรศัพท์ติดต่อ"
                  required
                />
              </div>
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className="jw-lbl mb-0">ตำแหน่ง<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                  <NameLengthBadge value={requesterPosition} maxLength={NAME_MAX_LENGTH.POSITION} />
                </div>
                <input
                  type="text"
                  value={requesterPosition}
                  maxLength={NAME_MAX_LENGTH.POSITION}
                  onChange={(e) => setRequesterPosition(clampNameInput(e.target.value, NAME_MAX_LENGTH.POSITION))}
                  className="jw-in"
                  placeholder="เช่น ประชาชน / ประธานชุมชน"
                  required
                />
                <NameLimitWarning value={requesterPosition} maxLength={NAME_MAX_LENGTH.POSITION} />
              </div>
            </div>

            {/* ที่อยู่ตามทะเบียนราษฎร์ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div>
                <label className="jw-lbl">อยู่บ้านเลขที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  pattern="[0-9]+(\/[0-9]+)*"
                  maxLength={20}
                  value={addressHouseNo}
                  onChange={(e) => setAddressHouseNo(sanitizeHouseNoInput(e.target.value))}
                  onBlur={() => setAddressHouseNo((v) => v.replace(/\/+$/, ''))}
                  className="jw-in font-mono"
                  placeholder="เช่น 124/5"
                  required
                />
              </div>
              <div>
                <label className="jw-lbl">หมู่ที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  pattern="[0-9]+(\/[0-9]+)*"
                  maxLength={10}
                  value={addressMoo}
                  onChange={(e) => setAddressMoo(sanitizeMooInput(e.target.value))}
                  onBlur={() => setAddressMoo((v) => v.replace(/\/+$/, ''))}
                  className="jw-in font-mono"
                  placeholder="เช่น 3 หรือ 14/2"
                  required
                />
              </div>
              <ThaiAddressSelect
                province={addressProvince}
                district={addressDistrict}
                subdistrict={addressSubdistrict}
                onChange={(next) => {
                  setAddressProvince(next.province);
                  setAddressDistrict(next.district);
                  setAddressSubdistrict(next.subdistrict);
                  setAddressProvinceId(next.provinceId || '');
                  setAddressDistrictId(next.districtId || '');
                  setAddressSubdistrictId(next.subdistrictId || '');
                }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="jw-lbl mb-0">หน่วยงาน / ชุมชน<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <NameLengthBadge value={organization} maxLength={NAME_MAX_LENGTH.ORGANIZATION} />
              </div>
              <input
                type="text"
                value={organization}
                maxLength={NAME_MAX_LENGTH.ORGANIZATION}
                onChange={(e) => setOrganization(clampNameInput(e.target.value, NAME_MAX_LENGTH.ORGANIZATION))}
                className="jw-in"
                placeholder="ระบุหน่วยงาน หรือกลุ่มชุมชน"
                required
              />
              <NameLimitWarning value={organization} maxLength={NAME_MAX_LENGTH.ORGANIZATION} />
            </div>

            {/* แสดงกำหนดวันรับและคืนอุปกรณ์ */}
            <div className="rounded-2xl bg-soft/50 border border-line p-3.5 flex items-center justify-between text-[13.5px]">
              <div className="flex items-center gap-2">
                <Icon name="calendar" className="w-4 h-4 text-brand" />
                <span>กำหนดวันยืม-คืน: <b>{formatThaiDate(pickupDate, false)} ถึง {formatThaiDate(returnDate, true)}</b></span>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-brand font-semibold text-[13px] underline"
              >
                แก้ไขวัน ({borrowDays} วัน)
              </button>
            </div>

            {/* มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้ (ล็อกรายการตามที่เลือกไว้) */}
            <div className="rounded-2xl bg-soft/60 border border-line p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[14px] text-ink">มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้</b>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-brand font-semibold text-[13px] underline"
                >
                  แก้ไขอุปกรณ์ ({selectedItems.length} รายการ)
                </button>
              </div>
              {purposeItems.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1.15fr_1fr] gap-2.5 items-center">
                  <div className="flex items-center gap-2">
                    <b className="text-[14px] text-ink shrink-0 w-5">{idx + 1}.</b>
                    <input
                      type="text"
                      value={row.item}
                      readOnly
                      disabled
                      className="jw-in h-10 text-[13.5px] bg-soft/80 text-ink-mute cursor-not-allowed select-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink-mute shrink-0">เพื่อ</span>
                    <input
                      type="text"
                      value={row.forWhat || 'ใช้ในกิจกรรมของหน่วยงาน/ชุมชน'}
                      readOnly
                      disabled
                      className="jw-in h-10 text-[13.5px] bg-soft/80 text-ink-mute cursor-not-allowed select-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* รายละเอียด / วัตถุประสงค์เพิ่มเติม (ไม่บังคับ - สำหรับแจ้ง จนท.) */}
            <div>
              <label className="jw-lbl">
                รายละเอียด / วัตถุประสงค์เพิ่มเติม{' '}
                <span className="text-[12px] font-normal text-ink-mute">
                  (ไม่บังคับ - สำหรับแจ้งเจ้าหน้าที่เพิ่มเติม และจะไม่แสดงในเอกสารราชการ)
                </span>
              </label>
              <textarea
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="jw-in h-20 py-2.5"
                placeholder="ระบุข้อมูลเพิ่มเติมถึงเจ้าหน้าที่ (ถ้ามี) ข้อความนี้จะไม่แสดงในเอกสารราชการ"
              />
            </div>

            {/* แนบสำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ */}
            <div>
              <label className="jw-lbl">แนบสำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="file"
                className="hidden"
                id="borrow-attachment"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                required={attachmentFiles.length === 0}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) {
                    const unique = picked.filter(
                      (file) =>
                        !attachmentFiles.some(
                          (existing) =>
                            existing.name === file.name &&
                            existing.size === file.size &&
                            existing.lastModified === file.lastModified,
                        ),
                    );
                    const combined = [...attachmentFiles, ...unique];
                    setAttachmentError(combined.length > 3 ? 'แนบเอกสารได้สูงสุด 3 ไฟล์' : '');
                    setAttachmentFiles(combined.slice(0, 3));
                  }
                  e.target.value = '';
                }}
              />
              <label
                htmlFor="borrow-attachment"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const picked = Array.from(e.dataTransfer.files ?? []);
                  if (picked.length) {
                    const unique = picked.filter(
                      (file) =>
                        !attachmentFiles.some(
                          (existing) =>
                            existing.name === file.name &&
                            existing.size === file.size &&
                            existing.lastModified === file.lastModified,
                        ),
                    );
                    const combined = [...attachmentFiles, ...unique];
                    setAttachmentError(combined.length > 3 ? 'แนบเอกสารได้สูงสุด 3 ไฟล์' : '');
                    setAttachmentFiles(combined.slice(0, 3));
                  }
                }}
                className="border-[1.5px] border-dashed border-[#7A7A7A] rounded-2xl p-4 text-center text-ink-mute bg-white cursor-pointer block hover:border-brand transition"
              >
                <div className="font-medium text-ink flex items-center justify-center gap-2">
                  <Icon name="upload" className="w-5 h-5 text-brand" />
                  <span>ลากไฟล์มาวาง หรือ แตะเพื่อเลือกสำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ</span>
                </div>
                <div className="text-[12px] text-ink-mute mt-1">
                  รองรับ PDF หรือรูปภาพ JPG, PNG (แนบได้สูงสุด 3 ไฟล์)
                </div>
              </label>

              {attachmentError ? (
                <p className="text-[12px] text-status-crit mt-1 font-medium">{attachmentError}</p>
              ) : null}

              {attachmentFiles.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-2">
                  {attachmentFiles.map((file, index) => {
                    const isImg = file.type.startsWith('image/');
                    return (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-line bg-canvas p-2 text-[13px]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const url = URL.createObjectURL(file);
                            setAttachmentPreview({ name: file.name, url, isImage: isImg });
                          }}
                          className="flex items-center gap-2 text-brand font-medium hover:underline truncate text-left"
                        >
                          <Icon name={isImg ? 'photo' : 'file-text'} className="w-4 h-4 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-[11px] text-ink-mute shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB) · กดเพื่อดูตัวอย่าง
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
                            setAttachmentError('');
                          }}
                          className="text-status-crit hover:opacity-80 p-1 shrink-0"
                          title="ลบไฟล์นี้"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error validation block */}
            {showRequestErrors && missingRequestFields.length > 0 && (
              <div
                id="request-form-errors"
                role="alert"
                className="rounded-2xl border border-[#F1B8B8] bg-[#FFF1F1] p-4 text-[13px] text-[#8A2424]"
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Icon name="alert-triangle" className="w-4 h-4 text-status-crit" />
                  <span>กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนก่อนไปขั้นตอนถัดไป</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[12.5px]">
                  {missingRequestFields.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= STEP 4: ลงนามและส่ง (Copy UI/UX จากขั้นตอนลงนามของสถานที่) ================= */}
      {step === 4 && (
        <div className="w-full flex flex-col gap-4">
          {/* ส่วนหัวขั้นตอนที่ 4 */}
          <div className="hidden md:block jw-card p-0 overflow-hidden border border-line">
            <div className="p-3.5 sm:px-5 sm:py-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                4
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="text-[15px] sm:text-[16px] text-ink block leading-tight">ลงนามและยืนยันส่งคำขอ</b>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/20">
                    ขั้นตอนที่ 4 จาก 4
                  </span>
                </div>
                <p className="text-[12px] text-ink-mute mt-0.5">
                  ตรวจสอบความถูกต้องของรายการอุปกรณ์ ลงลายมือชื่อดิจิทัล และส่งคำขอให้อบต.พิจารณา
                </p>
              </div>
            </div>
            <div className="w-full h-[3px] bg-line/30">
              <div className="h-full bg-brand transition-all duration-300" style={{ width: '100%' }} />
            </div>
          </div>

          {/* แสดงเอกสารจริงตามแบบคำขอใช้อุปกรณ์ราชการ */}
          <OfficialGovFormDocument
            customFields={{
              formTitle: 'แบบคำขอใช้อุปกรณ์ราชการ',
              subject: 'ขออนุญาตใช้อุปกรณ์ของทางราชการ',
              desireLabel: 'มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้',
              requesterRoleCaption: 'ผู้ขออนุญาตใช้อุปกรณ์ราชการ',
              writtenAt,
              requesterName: fullRequesterName || requesterName,
              requesterPosition,
              addressHouseNo,
              addressMoo,
              addressSubdistrict,
              addressDistrict,
              addressProvince,
              organization,
              purposeItems,
              requesterSignature: signature,
            }}
          />

          {purpose.trim() && (
            <div className="rounded-2xl bg-amber-50/80 border border-amber-200/80 p-3.5 flex items-start gap-2.5 text-[13px] text-amber-950">
              <span className="font-semibold text-amber-900 shrink-0">ข้อความเพิ่มเติมถึงเจ้าหน้าที่ (ไม่แสดงในเอกสาร):</span>
              <span className="whitespace-pre-wrap">{purpose}</span>
            </div>
          )}

          <div className="jw-card p-5 flex flex-col gap-3">
            <div>
              <label className="jw-lbl">
                {isWalkIn
                  ? `1. ลงลายมือชื่อผู้ขออนุญาตใช้อุปกรณ์ราชการ (${fullRequesterName || requesterName || 'ผู้ยื่นคำขอ'})`
                  : `ลงลายมือชื่อผู้ขออนุญาตใช้อุปกรณ์ราชการ (${fullRequesterName || requesterName || account?.name || 'ผู้ยื่นคำขอ'})`}
              </label>
              <SignatureBox
                value={signature}
                onChange={setSignature}
                savedSignature={isWalkIn ? undefined : account?.signature}
                signerLabel={`${fullRequesterName || requesterName || account?.name || 'ผู้ยื่นคำขอ'} · ผู้ขออนุญาตใช้อุปกรณ์ราชการ`}
              />
            </div>

            {isWalkIn && (
              <div className="pt-2 border-t border-line">
                <label className="jw-lbl">
                  2. ลงลายมือชื่อเจ้าหน้าที่ผู้รับคำขอแทน ({account?.name || 'เจ้าหน้าที่'})
                </label>
                <SignatureBox
                  value={staffSignature}
                  onChange={setStaffSignature}
                  savedSignature={account?.signature}
                  signerLabel={`${account?.name || 'เจ้าหน้าที่'} · เจ้าหน้าที่ผู้รับคำขอแทน`}
                />
              </div>
            )}

            <p className="text-[13px] text-ink-mute mt-1">
              ต้องลงนามทุกฝ่าย (4 ฝ่าย): (1) ผู้ยื่นคำขอ → (2) เจ้าหน้าที่ผู้ตรวจสอบ → (3) ปลัด อบต. → (4) นายก อบต.
            </p>
            {draftSaved && (
              <div className="rounded-2xl bg-brand-mint text-brand px-3.5 py-2 text-[13px] font-semibold mt-1">
                บันทึกร่างคำขอใช้อุปกรณ์เรียบร้อยแล้ว
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal ดูตัวอย่างไฟล์แนบ */}
      {attachmentPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAttachmentPreview(null)}
        >
          <div
            className="max-h-[90vh] max-w-[90vw] overflow-auto rounded-2xl bg-white p-4 shadow-modal flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
              <b className="text-[15px] truncate">{attachmentPreview.name}</b>
              <button
                type="button"
                onClick={() => setAttachmentPreview(null)}
                className="text-ink-mute hover:text-ink text-[13px] font-semibold px-2 py-1"
              >
                ปิด
              </button>
            </div>
            {attachmentPreview.isImage ? (
              <img
                src={attachmentPreview.url}
                alt={attachmentPreview.name}
                className="max-h-[75vh] w-auto object-contain rounded-xl"
              />
            ) : (
              <iframe
                src={attachmentPreview.url}
                title={attachmentPreview.name}
                className="h-[75vh] w-[80vw] max-w-[800px] rounded-xl border border-line"
              />
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
