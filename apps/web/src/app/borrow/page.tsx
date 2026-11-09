'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EQUIPMENT_CATEGORY_LABEL,
  Equipment,
  EquipmentCategory,
  OfficialFormPurposeItem,
  PublicAccount,
  sanitizePhoneInput,
  validateThaiAddressHierarchy,
  validateThaiPhone,
} from '@japjong/shared';
import { roleHomePath, useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Phone10DigitInput, ThaiAddressSelect } from '@/components/thai-address-select';
import {
  CalendarC4,
  Chip,
  DatePickerField,
  OfficialGovFormDocument,
  SignatureBox,
  Stepper,
  ThumbnailImage,
  equipmentIconName,
} from '@/components/ui';
import { api, formatThaiDate } from '@/lib/api';

const STEPS = ['เลือกอุปกรณ์', 'วันยืม-คืน', 'กรอกคำขอ', 'ลงนามและส่ง'];

export default function BorrowWizardPage() {
  const router = useRouter();
  const { account, accounts } = useAuth();
  const isStaff = account?.role === 'STAFF' || account?.role === 'ADMIN';
  const [step, setStep] = useState(1);

  // Step 1: Equipment Catalog & Selection
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [equipmentError, setEquipmentError] = useState('');
  const [cat, setCat] = useState<'all' | EquipmentCategory>('all');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const setQty = (id: string, max: number, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  const selectedItems = useMemo(() => {
    return equipment
      .map((eq) => ({ eq, qty: quantities[eq.id] ?? 0 }))
      .filter((x) => x.qty > 0);
  }, [equipment, quantities]);

  const totalSelectedUnits = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.qty, 0);
  }, [selectedItems]);

  // โหมดกรอกคำขอแทนผู้มาติดต่อ (สำหรับเจ้าหน้าที่)
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInQuery, setWalkInQuery] = useState('');
  const [foundUser, setFoundUser] = useState<PublicAccount | null>(null);

  // Step 2: Date Range State (รายวันเท่านั้น)
  const [month, setMonth] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [pickupDate, setPickupDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });

  const borrowDays = useMemo(() => {
    if (!pickupDate || !returnDate) return 1;
    const s = new Date(pickupDate).getTime();
    const e = new Date(returnDate).getTime();
    const diff = Math.round((e - s) / 86400000);
    return Math.max(1, diff + 1);
  }, [pickupDate, returnDate]);

  // ตรวจสอบความว่างและจำนวนติดจองของอุปกรณ์ตามช่วงวันที่เลือก
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
    if (selectedItems.length === 0 || !pickupDate || !returnDate) {
      setEquipmentAvailability((prev) => (prev.length === 0 ? prev : []));
      setEquipmentSummary((prev) => (prev.length === 0 ? prev : []));
      setIsEquipmentAvailable(true);
      return;
    }

    let active = true;
    setCheckingAvailability(true);
    api
      .checkEquipmentAvailability({
        items: selectedItems.map((s) => ({ equipmentId: s.eq.id, qty: s.qty })),
        pickupDate,
        returnDate,
        month,
      })
      .then((res) => {
        if (!active) return;
        setEquipmentAvailability(res.dayAvailability);
        setEquipmentSummary(res.summary);
        setIsEquipmentAvailable(res.isAvailable);
      })
      .catch(() => {
        if (active) {
          setEquipmentAvailability([]);
          setEquipmentSummary([]);
          setIsEquipmentAvailable(true);
        }
      })
      .finally(() => {
        if (active) setCheckingAvailability(false);
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
  const [requesterName, setRequesterName] = useState(() => parseTitleAndName(account?.name).name);
  const fullRequesterName = requesterName.trim() ? `${requesterTitle} ${requesterName.trim()}` : '';
  const [requesterPhone, setRequesterPhone] = useState(() => sanitizePhoneInput(account?.phone || '', 10));
  const [requesterPosition, setRequesterPosition] = useState(
    account?.position && account.position !== 'ประชาชน' ? account.position : '',
  );
  const [addressHouseNo, setAddressHouseNo] = useState(account?.addressHouseNo || '');
  const [addressMoo, setAddressMoo] = useState(account?.addressMoo || '');
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
    setRequesterName(name);
    setRequesterPhone(sanitizePhoneInput(acc?.phone || '', 10));
    setRequesterPosition(acc?.position && acc.position !== 'ประชาชน' ? acc.position : '');
    setOrganization(acc?.department || '');
    setAddressHouseNo(acc?.addressHouseNo || '');
    setAddressMoo(acc?.addressMoo || '');
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
        setRequesterPhone(walkInQuery.trim());
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
      setRequesterName(name);
      setRequesterPhone(account.phone || '');
      setOrganization(account.department || '');
      if (account.position && account.position !== 'ประชาชน') setRequesterPosition(account.position);
      if (account.addressHouseNo) setAddressHouseNo(account.addressHouseNo);
      if (account.addressMoo) setAddressMoo(account.addressMoo);
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
      if (search.trim() && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [equipment, cat, search, onlyAvailable]);

  // Handle Calendar Pick
  const handlePickCalendarDate = (dateStr: string) => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    if (dateStr < todayStr) return;

    if (pickupDate === returnDate && dateStr > pickupDate) {
      setReturnDate(dateStr);
    } else if (dateStr < pickupDate) {
      setPickupDate(dateStr);
    } else {
      setPickupDate(dateStr);
      setReturnDate(dateStr);
    }
  };

  const setPresetDays = (days: number) => {
    const s = new Date(pickupDate);
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
        attachments: attachmentFiles.map((file) => file.name),
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
          ? 'อุปกรณ์'
          : step === 2
          ? 'วันยืม-คืน'
          : step === 3
          ? 'แบบคำขอยืมอุปกรณ์'
          : 'ลงนามและส่งคำขอ'
      }
      backHref={step === 1 ? (account ? roleHomePath(account.role) : '/') : undefined}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      maxWidth="max-w-[1360px]"
      footer={
        step === 1 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <Link href="/borrow/my" className="jw-btn-sec flex-1 sm:w-44">
              รายการอุปกรณ์ของฉัน
            </Link>
            <button
              type="button"
              disabled={selectedItems.length === 0}
              onClick={() => setStep(2)}
              className="jw-btn flex-[1.5] sm:w-64"
            >
              ถัดไป · วันยืม-คืน ({selectedItems.length} รายการ)
            </button>
          </div>
        ) : step === 2 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(1)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={!isEquipmentAvailable || checkingAvailability}
              onClick={() => {
                syncFormPurposeItems();
                setStep(3);
              }}
              className="jw-btn flex-[1.5] sm:w-56"
              title={!isEquipmentAvailable ? 'อุปกรณ์บางรายการไม่เพียงพอในวันที่เลือก' : undefined}
            >
              {checkingAvailability
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
      <div className="w-full mb-5">
        <Stepper steps={STEPS} current={step} onSelect={setStep} />
      </div>

      {/* ================= STEP 1: เลือกอุปกรณ์ (Copy UI/UX จากขั้นตอนเลือกสถานที่) ================= */}
      {step === 1 && (
        <div className="flex flex-col gap-3.5">
          {/* แถวค้นหา */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-ph">
              <Icon name="search" className="w-5 h-5" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่ออุปกรณ์..."
              className="jw-in rounded-full pl-11 h-[42px]"
            />
          </div>

          {/* แถวตัวกรองอุปกรณ์ (แนวนอนขนานกัน ทั้งหมดอยู่เหนือรายการที่เลือก) */}
          <div className="jw-card p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3">
            {/* ซ้าย: หมวดหมู่อุปกรณ์ (Pills แนวนอน) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[13px] font-bold text-ink shrink-0 mr-1 flex items-center gap-1.5">
                <Icon name="filter" className="w-3.5 h-3.5 text-brand" />
                <span>หมวดหมู่อุปกรณ์:</span>
              </span>
              {(
                [
                  ['all', 'ทั้งหมด'],
                  ['audio', 'เครื่องเสียง'],
                  ['tent', 'เต็นท์ / โต๊ะ / เก้าอี้'],
                  ['it', 'IT / โสตทัศนูปกรณ์'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCat(val)}
                  className={`h-8 sm:h-9 px-3 sm:px-3.5 rounded-full border text-[12px] sm:text-[13px] font-semibold transition ${
                    cat === val
                      ? 'border-brand bg-brand text-white shadow-xs'
                      : 'border-line bg-white text-ink-soft hover:bg-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ขวา: เฉพาะที่พร้อมใช้งาน */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyAvailable((v) => !v)}
                className={`h-8 sm:h-9 px-3 rounded-xl border text-[12.5px] font-semibold transition flex items-center gap-1.5 ${
                  onlyAvailable
                    ? 'border-brand bg-brand-mint text-brand'
                    : 'border-line bg-white text-ink-soft hover:bg-hover'
                }`}
              >
                <i
                  className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${
                    onlyAvailable ? 'bg-brand border-brand text-white' : 'border-line bg-white'
                  }`}
                >
                  {onlyAvailable && <Icon name="check" className="w-2.5 h-2.5" strokeWidth={3} />}
                </i>
                <span>เฉพาะที่พร้อมใช้งาน</span>
              </button>
            </div>
          </div>

          {/* รายการที่เลือก (ใต้แถวตัวกรอง จัดวางในแถวเดียวกัน Wrap ได้) */}
            <div className="jw-card p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 shrink-0">
                <Icon name="check" className="w-4 h-4 text-brand" />
                <span className="text-[13.5px] font-bold text-ink">รายการที่เลือก</span>
                <span className="text-[12px] font-semibold text-brand bg-brand-mint px-2 py-0.5 rounded-full">
                  {selectedItems.length} รายการ
                </span>
                {totalSelectedUnits > 0 && (
                  <span className="text-[12px] text-ink-mute hidden sm:inline">
                    (รวม {totalSelectedUnits} ชิ้น)
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
                {selectedItems.length === 0 ? (
                  <span className="text-[12.5px] text-ink-mute">ยังไม่ได้เลือกอุปกรณ์ (ระบุจำนวนที่ต้องการยืมด้านล่าง)</span>
                ) : (
                  selectedItems.map(({ eq, qty }) => (
                    <span
                      key={eq.id}
                      className="inline-flex items-center gap-1.5 bg-brand-mint/50 border border-brand/20 text-ink text-[12.5px] font-medium pl-2.5 pr-1.5 py-1 rounded-full animate-fadeIn"
                    >
                      <span className="truncate max-w-[120px] sm:max-w-[160px]">{eq.name}</span>
                      <span className="text-[11px] font-bold text-brand bg-white/80 px-1.5 py-0.5 rounded-full border border-brand/20">
                        {qty} ชุด
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                        className="w-4 h-4 rounded-full hover:bg-brand/10 flex items-center justify-center text-ink-mute hover:text-ink transition"
                        title="ลดจำนวน"
                      >
                        <Icon name="minus" className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        disabled={qty >= eq.stock}
                        onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                        className="w-4 h-4 rounded-full hover:bg-brand/10 flex items-center justify-center text-ink-mute hover:text-ink disabled:opacity-30 transition"
                        title="เพิ่มจำนวน"
                      >
                        <Icon name="plus" className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setQty(eq.id, eq.stock, 0)}
                        className="w-4 h-4 rounded-full hover:bg-red-100 flex items-center justify-center text-ink-mute hover:text-status-crit transition ml-0.5"
                        title="นำออก"
                      >
                        <Icon name="x" className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => setQuantities({})}
                    className="text-[12px] font-semibold text-ink-mute hover:text-status-crit transition px-2 py-1 rounded-lg hover:bg-soft"
                  >
                    ล้างทั้งหมด
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <b className="text-[16px] sm:text-[18px]">อุปกรณ์ทั้งหมด</b>
              <span className="text-[13px] text-ink-mute">{filtered.length} รายการ</span>
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
                      api.equipment()
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
              <div className="jw-card p-8 text-center">
                <b className="block text-[15px] text-ink">ไม่พบอุปกรณ์ที่ค้นหา</b>
                <span className="mt-1 block text-[13px] text-ink-mute">ลองเปลี่ยนหมวดหมู่หรือคำค้นหา อุปกรณ์ที่พร้อมยืมจะแสดงที่นี่</span>
              </div>
            )}

            {/* การ์ดอุปกรณ์ในแบบ Grid เสมือนของสถานที่ */}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5">
              {filtered.map((eq) => {
                const qty = quantities[eq.id] ?? 0;
                const isSelected = qty > 0;
                const outOfStock = eq.stock <= 0;

                return (
                  <div
                    key={eq.id}
                    className={`bg-white rounded-hard shadow-low overflow-hidden relative transition flex flex-col justify-between ${
                      outOfStock
                        ? 'opacity-60'
                        : 'hover:shadow-card'
                    } ${isSelected ? 'ring-2 ring-brand' : 'border border-line/60'}`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-10 w-[22px] h-[22px] rounded-full bg-brand text-white flex items-center justify-center shadow">
                        <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />
                      </div>
                    )}

                    <div>
                      <div className="h-28 sm:h-36 bg-brand-mint text-brand flex items-center justify-center overflow-hidden">
                        <ThumbnailImage
                          src={eq.images?.[0]}
                          alt={eq.name}
                          iconName={equipmentIconName(eq.category)}
                        />
                      </div>

                      <div className="p-3 flex flex-col gap-1">
                        <b className="text-[14px] sm:text-[15px] text-ink truncate" title={eq.name}>{eq.name}</b>
                        <span className="text-[12px] text-ink-mute inline-flex items-center gap-1">
                          <Icon name="package" className="w-3.5 h-3.5" /> {EQUIPMENT_CATEGORY_LABEL[eq.category]}
                        </span>
                        {outOfStock ? (
                          <div className="pt-0.5">
                            <Chip tone="red">ของหมด</Chip>
                          </div>
                        ) : isSelected ? (
                          <div className="pt-0.5">
                            <Chip tone="green">เลือกแล้ว {qty} ชุด</Chip>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="p-3 pt-0 border-t border-line/40 mt-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-ink-mute">จำนวนขอยืม:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                          className="w-[30px] h-[30px] rounded-full border-[1.5px] border-line hover:border-ink flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition"
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
                          className="w-12 h-8 text-center text-[14px] font-bold rounded-xl border border-line bg-white text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          disabled={outOfStock || qty >= eq.stock}
                          onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                          className="w-[30px] h-[30px] rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-deep disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      )}

      {/* ================= STEP 2: วันยืม-คืน (รายวันเท่านั้น) ================= */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          {/* ส่วนหัวแสดงโหมดรายวัน */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-line shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm">
                2
              </span>
              <div>
                <b className="text-[15px] sm:text-[16px] text-ink">เลือกกำหนดวันยืมและคืนอุปกรณ์ (รายวัน)</b>
                <p className="text-[12px] text-ink-mute">
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

          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
            {/* ซ้าย: ปฏิทินแสดงช่วงวันที่เลือก */}
            <div className="flex flex-col gap-3">
              <CalendarC4
                month={month}
                onMonthChange={setMonth}
                availability={equipmentAvailability}
                periods={[{ start: `${pickupDate}T09:00:00+07:00`, end: `${returnDate}T16:00:00+07:00` }]}
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
                  <Chip tone="green">{borrowDays} วัน</Chip>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                  <div className="border border-line rounded-xl p-2.5 bg-white flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-ink-mute">วันที่รับอุปกรณ์</span>
                      <span className="text-[12px] text-brand font-semibold">{formatThaiDate(pickupDate, false)}</span>
                    </div>
                    <DatePickerField
                      value={pickupDate}
                      label="วันที่รับอุปกรณ์"
                      onChange={(value) => {
                        setPickupDate(value);
                        if (value > returnDate) {
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
                      <span className="text-[12px] text-brand font-semibold">{formatThaiDate(returnDate, false)}</span>
                    </div>
                    <DatePickerField
                      value={returnDate}
                      label="กำหนดคืนอุปกรณ์"
                      onChange={(value) => {
                        setReturnDate(value);
                        if (value < pickupDate) {
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
                          borrowDays === d
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
                  {checkingAvailability ? (
                    <span className="text-[12px] text-ink-mute animate-pulse">กำลังตรวจสอบ...</span>
                  ) : isEquipmentAvailable ? (
                    <Chip tone="green">พร้อมให้ยืมทั้งหมด</Chip>
                  ) : (
                    <Chip tone="red">อุปกรณ์ไม่พอ</Chip>
                  )}
                </div>

                <div className="text-[12.5px] text-ink-mute">
                  ช่วงวันที่เลือก: <b className="text-ink">{formatThaiDate(pickupDate, false)} – {formatThaiDate(returnDate, true)}</b> ({borrowDays} วัน)
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
                        <b className="text-[13.5px] truncate">{item.name}</b>
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
                  <p>• ระยะเวลาที่ยืม: <b className="text-ink">{borrowDays} วัน</b> ({formatThaiDate(pickupDate, false)} ถึง {formatThaiDate(returnDate, true)})</p>
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
            <div className="pb-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-[17px] text-ink block">แบบคำขอใช้อุปกรณ์ราชการ</b>
                <span className="text-[12.5px] text-ink-mute">
                  เรื่อง ขออนุญาตใช้อุปกรณ์ของทางราชการ
                </span>
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
                <label className="jw-lbl">เขียนที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  value={writtenAt}
                  onChange={(e) => setWrittenAt(e.target.value)}
                  className="jw-in"
                  placeholder="เช่น ที่ทำการ อบต."
                  required
                />
              </div>
              <div className="lg:col-span-2">
                <label className="jw-lbl">คำนำหน้า<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <select
                  value={requesterTitle}
                  onChange={(e) => setRequesterTitle(e.target.value)}
                  className="jw-in bg-white"
                  required
                >
                  <option value="นาย">นาย</option>
                  <option value="นาง">นาง</option>
                  <option value="นางสาว">นางสาว</option>
                </select>
              </div>
              <div className="lg:col-span-3">
                <label className="jw-lbl">ข้าพเจ้า<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="jw-in"
                  placeholder="ชื่อ-นามสกุล"
                  required
                />
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
                <label className="jw-lbl">ตำแหน่ง<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  value={requesterPosition}
                  onChange={(e) => setRequesterPosition(e.target.value)}
                  className="jw-in"
                  placeholder="เช่น ประชาชน / ประธานชุมชน"
                  required
                />
              </div>
            </div>

            {/* ที่อยู่ตามทะเบียนราษฎร์ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div>
                <label className="jw-lbl">บ้านเลขที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  value={addressHouseNo}
                  onChange={(e) => setAddressHouseNo(e.target.value)}
                  className="jw-in"
                  placeholder="เช่น 123/4"
                  required
                />
              </div>
              <div>
                <label className="jw-lbl">หมู่ที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
                <input
                  type="text"
                  value={addressMoo}
                  onChange={(e) => setAddressMoo(e.target.value)}
                  className="jw-in"
                  placeholder="เช่น 5"
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
              <label className="jw-lbl">หน่วยงาน / ชุมชน<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="jw-in"
                placeholder="ระบุหน่วยงาน หรือกลุ่มชุมชน"
                required
              />
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
                }}
              />
              <label
                htmlFor="borrow-attachment"
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
