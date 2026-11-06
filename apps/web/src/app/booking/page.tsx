'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Eye, FileText, Upload, X } from 'lucide-react';
import {
  ConflictInfo,
  DayAvailability,
  EQUIPMENT_CATEGORY_LABEL,
  Equipment,
  EquipmentCategory,
  OfficialFormPurposeItem,
  Period,
  PublicAccount,
  VENUE_TYPE_LABEL,
  Venue,
  VenueType,
  periodDurationText,
} from '@japjong/shared';
import { roleHomePath, useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  CalendarC4,
  Chip,
  DatePickerField,
  OfficialGovFormDocument,
  SignatureBox,
  Stepper,
  ThumbnailImage,
  TimePickerField,
  equipmentIconName,
  venueIconName,
} from '@/components/ui';
import { api, formatMonthTitle, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';
import { HourlyBookingSection } from '@/components/hourly-booking-section';

const STEPS = ['เลือกสถานที่', 'วัน-เวลา', 'อุปกรณ์เสริม', 'กรอกคำขอ', 'ลงนามและส่ง'];

function validateBookingPeriods(periods: Period[], venues: Venue[], attendeesCount?: number): string[] {
  const errors: string[] = [];
  if (!periods || periods.length === 0) {
    errors.push('กรุณาระบุช่วงวันและเวลาที่ต้องการใช้งาน');
    return errors;
  }

  const now = new Date();
  const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const todayBkkMidnight = Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate());

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const s = new Date(p.start).getTime();
    const e = new Date(p.end).getTime();

    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      errors.push(
        `ช่วงที่ ${i + 1}: เวลาเริ่มต้นต้องก่อนเวลาสิ้นสุด (เวลาเริ่มไม่สามารถเท่ากับหรือหลังเวลาสิ้นสุดได้)`,
      );
      continue;
    }

    const startBkk = new Date(s + 7 * 60 * 60 * 1000);
    const endBkk = new Date(e + 7 * 60 * 60 * 1000);
    const startDayBkk = Date.UTC(startBkk.getUTCFullYear(), startBkk.getUTCMonth(), startBkk.getUTCDate());
    const dayDiff = Math.floor((startDayBkk - todayBkkMidnight) / (24 * 60 * 60 * 1000));
    const dayOfWeek = startBkk.getUTCDay();

    const startH = String(startBkk.getUTCHours()).padStart(2, '0');
    const startM = String(startBkk.getUTCMinutes()).padStart(2, '0');
    const endH = String(endBkk.getUTCHours()).padStart(2, '0');
    const endM = String(endBkk.getUTCMinutes()).padStart(2, '0');
    const startTimeStr = `${startH}:${startM}`;
    const endTimeStr = `${endH}:${endM}`;

    for (const v of venues) {
      // 1. ตรวจสอบการจองล่วงหน้า (advanceDays)
      if (v.advanceDays > 0 && dayDiff < v.advanceDays) {
        errors.push(
          `ช่วงที่ ${i + 1}: สถานที่ "${v.name}" ต้องจองล่วงหน้าอย่างน้อย ${v.advanceDays} วัน (วันที่เลือกเร็วเกินไป)`,
        );
      }

      // 2. ตรวจสอบวันเปิดทำการ (openDays)
      if (v.openDays && v.openDays.length > 0 && !v.openDays.includes(dayOfWeek)) {
        const thaiDayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
        errors.push(
          `ช่วงที่ ${i + 1}: สถานที่ "${v.name}" ไม่เปิดให้บริการในวัน${thaiDayNames[dayOfWeek]}`,
        );
      }

      // 3. ตรวจสอบเวลาเปิด-ปิด (openTime / closeTime)
      if (v.openTime && startTimeStr < v.openTime) {
        errors.push(
          `ช่วงที่ ${i + 1}: เวลาเริ่มต้น (${startTimeStr} น.) เร็วกว่าเวลาเปิดทำการของ "${v.name}" (${v.openTime} น.)`,
        );
      }
      if (v.closeTime && endTimeStr > v.closeTime) {
        errors.push(
          `ช่วงที่ ${i + 1}: เวลาสิ้นสุด (${endTimeStr} น.) เกินเวลาปิดทำการของ "${v.name}" (${v.closeTime} น.)`,
        );
      }

      // 4. ตรวจสอบความจุสถานที่ (หากระบุ)
      if (attendeesCount && v.capacity > 0 && attendeesCount > v.capacity) {
        errors.push(
          `จำนวนผู้เข้าร่วม (${attendeesCount} คน) เกินความจุของสถานที่ "${v.name}" (รองรับได้สูงสุด ${v.capacity} คน)`,
        );
      }
    }
  }

  return errors;
}

export default function BookingWizardPage() {
  const router = useRouter();
  const { account, accounts } = useAuth();
  const isStaff = account?.role === 'STAFF' || account?.role === 'ADMIN';
  const [step, setStep] = useState(1);

  // โหมดกรอกคำขอแทนผู้มาติดต่อ (สำหรับเจ้าหน้าที่)
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInQuery, setWalkInQuery] = useState('');
  const [foundUser, setFoundUser] = useState<PublicAccount | null>(null);

  // Step 1 state
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState<'all' | VenueType>('all');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [search, setSearch] = useState('');

  // Step 2 state (ค่าเริ่มต้น 1 ช่วงเวลา)
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [periods, setPeriods] = useState<Period[]>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return [{ start: `${dateStr}T09:00:00+07:00`, end: `${dateStr}T16:00:00+07:00` }];
  });
  const [activePeriodIdx, setActivePeriodIdx] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  // Step 3 state (เลือกอุปกรณ์เสริม)
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [equipmentQuantities, setEquipmentQuantities] = useState<Record<string, number>>({});
  const [equipmentCat, setEquipmentCat] = useState<'all' | EquipmentCategory>('all');
  const [equipmentSearch, setEquipmentSearch] = useState('');

  // Step 4 state (ตามแบบขอใช้สถานที่ราชการ)
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
  const [requesterPhone, setRequesterPhone] = useState(account?.phone || '');
  const [requesterPosition, setRequesterPosition] = useState(
    account?.position && account.position !== 'ประชาชน'
      ? account.position
      : '',
  );
  const [addressHouseNo, setAddressHouseNo] = useState(account?.addressHouseNo || '');
  const [addressMoo, setAddressMoo] = useState(account?.addressMoo || '');
  const [addressSubdistrict, setAddressSubdistrict] = useState(account?.addressSubdistrict || '');
  const [addressDistrict, setAddressDistrict] = useState(account?.addressDistrict || '');
  const [addressProvince, setAddressProvince] = useState(account?.addressProvince || '');
  const [organization, setOrganization] = useState(
    account?.department || '',
  );
  const [activity, setActivity] = useState('');
  const [purpose, setPurpose] = useState('');
  const [purposeItems, setPurposeItems] = useState<OfficialFormPurposeItem[]>([
    { item: '', forWhat: '' },
  ]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentPanelOpen, setAttachmentPanelOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ file: File; url: string } | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [showRequestErrors, setShowRequestErrors] = useState(false);

  useEffect(() => {
    if (!attachmentPreview) return;
    return () => URL.revokeObjectURL(attachmentPreview.url);
  }, [attachmentPreview]);

  const missingRequestFields = [
    ...[
      ['สถานที่เขียนคำขอ', writtenAt],
      ['ชื่อ-นามสกุลผู้ยื่นคำขอ', requesterName],
      ['เบอร์โทรศัพท์ติดต่อ', requesterPhone],
      ['ตำแหน่ง', requesterPosition],
      ['บ้านเลขที่', addressHouseNo],
      ['หมู่ที่', addressMoo],
      ['ตำบล / แขวง', addressSubdistrict],
      ['อำเภอ / เขต', addressDistrict],
      ['จังหวัด', addressProvince],
      ['หน่วยงาน / ชุมชน', organization],
    ]
      .filter(([, value]) => !String(value).trim())
      .map(([label]) => label),
    ...(attachmentFiles.length === 0 ? ['สำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ'] : []),
    ...purposeItems.flatMap((item, index) => [
      ...(!item.item.trim() ? [`รายการที่ ${index + 1}`] : []),
      ...(!item.forWhat.trim() ? [`วัตถุประสงค์ของรายการที่ ${index + 1}`] : []),
    ]),
  ];

  // Step 5 state (ต้องวาดลายเซ็นบนหน้าจอ ไม่ใช้การพิมพ์)
  const [signature, setSignature] = useState('');
  const [staffSignature, setStaffSignature] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const applyAccountFields = (acc: PublicAccount | null) => {
    const { title, name } = parseTitleAndName(acc?.name);
    setRequesterTitle(title);
    setRequesterName(name);
    setRequesterPhone(acc?.phone || '');
    setRequesterPosition(acc?.position && acc.position !== 'ประชาชน' ? acc.position : '');
    setOrganization(acc?.department || '');
    setAddressHouseNo(acc?.addressHouseNo || '');
    setAddressMoo(acc?.addressMoo || '');
    setAddressSubdistrict(acc?.addressSubdistrict || '');
    setAddressDistrict(acc?.addressDistrict || '');
    setAddressProvince(acc?.addressProvince || '');
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
    if (account && !isWalkIn) {
      setRequesterName(account.name);
      setRequesterPhone(account.phone || '');
      setOrganization(account.department);
      if (account.addressHouseNo) setAddressHouseNo(account.addressHouseNo);
      if (account.addressMoo) setAddressMoo(account.addressMoo);
      if (account.addressSubdistrict) setAddressSubdistrict(account.addressSubdistrict);
      if (account.addressDistrict) setAddressDistrict(account.addressDistrict);
      if (account.addressProvince) setAddressProvince(account.addressProvince);
    }
  }, [account, isWalkIn]);

  useEffect(() => {
    api.venues().then(setVenues).catch(() => {});
    api.equipment().then(setEquipmentList).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedIds.length) return;
    api
      .availability(selectedIds, month)
      .then(setAvailability)
      .catch(() => {});
  }, [selectedIds, month]);

  useEffect(() => {
    if (!selectedIds.length || !periods.length) {
      setConflicts([]);
      return;
    }
    api
      .checkConflicts(selectedIds, periods)
      .then((res) => setConflicts(res.conflicts))
      .catch(() => setConflicts([]));
  }, [selectedIds, periods]);

  const toggleVenue = (v: Venue) => {
    if (v.status !== 'available' || !v.enabled) return;
    setSelectedIds((prev) => (prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id]));
  };

  const filteredVenues = venues.filter((v) => {
    if (catFilter !== 'all' && v.type !== catFilter) return false;
    if (buildingFilter !== 'all' && v.building !== buildingFilter) return false;
    if (onlyAvailable && (v.status !== 'available' || !v.enabled)) return false;
    if (search.trim() && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selectedVenues = venues.filter((v) => selectedIds.includes(v.id));
  const buildings = Array.from(new Set(venues.map((v) => v.building)));

  const [bookingMode, setBookingMode] = useState<'hourly' | 'daily'>('hourly');

  // เงื่อนไขจองล่วงหน้าขั้นต่ำตามที่สถานที่กำหนด (Dynamic minAdvanceDays)
  const minAdvanceDays = React.useMemo(() => {
    if (!selectedVenues.length) return 0;
    return Math.max(...selectedVenues.map((v) => Number(v.advanceDays ?? 0)));
  }, [selectedVenues]);

  const earliestBookableDate = React.useMemo(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + minAdvanceDays));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }, [minAdvanceDays]);

  // ปรับวันเริ่มต้นอัตโนมัติหากวันเดิมที่เลือกยังไม่ถึงระยะเวลาจองล่วงหน้าขั้นต่ำ
  useEffect(() => {
    if (selectedVenues.length > 0 && periods.length > 0) {
      const firstDate = periods[0].start.slice(0, 10);
      if (firstDate < earliestBookableDate) {
        const openTime = selectedVenues[0]?.openTime || '09:00';
        const closeTime = selectedVenues[0]?.closeTime || '16:00';
        setPeriods([
          {
            start: `${earliestBookableDate}T${openTime}:00+07:00`,
            end: `${earliestBookableDate}T${closeTime}:00+07:00`,
          },
        ]);
      }
    }
  }, [selectedVenues, earliestBookableDate]);

  // ตรวจสอบเงื่อนไขวันและเวลา (Real-time Validation)
  const periodValidationErrors = React.useMemo(() => {
    return validateBookingPeriods(periods, selectedVenues);
  }, [periods, selectedVenues]);

  // การจัดการจำนวนอุปกรณ์เสริม และตรวจสอบสต๊อกความพร้อมใช้งานตามช่วงวัน-เวลาที่เลือก
  const [equipmentStockSummary, setEquipmentStockSummary] = useState<
    Record<string, { availableQty: number; reservedQty: number; totalStock: number }>
  >({});
  const [checkingEquipmentStock, setCheckingEquipmentStock] = useState(false);

  useEffect(() => {
    if (!periods.length || equipmentList.length === 0) return;
    const sortedStarts = periods.map((p) => p.start.slice(0, 10)).filter(Boolean).sort();
    const sortedEnds = periods.map((p) => p.end.slice(0, 10)).filter(Boolean).sort();
    if (!sortedStarts.length || !sortedEnds.length) return;

    setCheckingEquipmentStock(true);
    api
      .checkEquipmentAvailability({
        items: equipmentList.map((eq) => ({
          equipmentId: eq.id,
          qty: equipmentQuantities[eq.id] ?? 0,
        })),
        pickupDate: sortedStarts[0],
        returnDate: sortedEnds[sortedEnds.length - 1],
        periods,
        month,
      })
      .then((res) => {
        const map: Record<string, { availableQty: number; reservedQty: number; totalStock: number }> = {};
        for (const item of res.summary) {
          map[item.equipmentId] = {
            availableQty: item.minAvailableInPeriod,
            reservedQty: item.maxReservedInPeriod,
            totalStock: item.totalStock,
          };
        }
        setEquipmentStockSummary(map);
      })
      .catch(() => {
        // กรณีเชื่อมต่อไม่ได้ ให้คงค่าสต๊อกเดิม
      })
      .finally(() => {
        setCheckingEquipmentStock(false);
      });
  }, [periods, equipmentList, month]);

  const setEquipmentQty = (id: string, max: number, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setEquipmentQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  const selectedExtraItems = equipmentList
    .map((eq) => ({ eq, qty: equipmentQuantities[eq.id] ?? 0 }))
    .filter((x) => x.qty > 0);

  const hasEquipmentShortage = selectedExtraItems.some((s) => {
    const info = equipmentStockSummary[s.eq.id];
    const available = info ? info.availableQty : s.eq.stock;
    return s.qty > available;
  });

  const filteredEquipment = equipmentList.filter((e) => {
    if (equipmentCat !== 'all' && e.category !== equipmentCat) return false;
    if (equipmentSearch.trim() && !e.name.toLowerCase().includes(equipmentSearch.toLowerCase())) return false;
    return true;
  });

  // ซิงค์ชื่อสถานที่และอุปกรณ์เสริมที่เลือกมาใส่ในแบบฟอร์ม
  const syncFormPurposeItems = (
    venueList = selectedVenues,
    extraList = selectedExtraItems,
  ) => {
    if (!venueList.length) return;
    setPurposeItems((prev) => {
      const generated: OfficialFormPurposeItem[] = [];

      // ใส่สถานที่ทั้งหมดที่เลือก
      venueList.forEach((v, idx) => {
        generated.push({
          item: v.name,
          forWhat: prev[idx]?.forWhat || activity || 'ใช้จัดกิจกรรมและประชุม',
        });
      });

      // ใส่อุปกรณ์เสริมทั้งหมดที่เลือก
      extraList.forEach((ex, idx) => {
        const offset = venueList.length + idx;
        generated.push({
          item: `${ex.eq.name} จำนวน ${ex.qty} ชุด/รายการ`,
          forWhat: prev[offset]?.forWhat || 'ใช้ประกอบการจัดกิจกรรมและประชุม',
        });
      });

      return generated.length > 0 ? generated : [{ item: '', forWhat: '' }];
    });
  };

  // ซิงค์รายการลงแบบฟอร์มอัตโนมัติทุกครั้งที่สถานที่หรืออุปกรณ์เสริมเปลี่ยน
  useEffect(() => {
    if (selectedVenues.length > 0) {
      syncFormPurposeItems(selectedVenues, selectedExtraItems);
    }
  }, [selectedIds, venues, equipmentQuantities, equipmentList]);

  const effectiveConflicts: ConflictInfo[] = conflicts;

  const handlePickCalendarDate = (dateStr: string) => {
    if (dateStr < earliestBookableDate) return;
    setPeriods((prev) => {
      const idx = Math.min(activePeriodIdx, Math.max(0, prev.length - 1));
      return prev.map((p, i) => {
        if (i !== idx) return p;
        const sd = p.start.slice(0, 10);
        const st = p.start.slice(11, 16);
        const ed = p.end.slice(0, 10);
        const et = p.end.slice(11, 16);
        // ถ้าเดิมเป็นวันเดียว และแตะวันที่มากกว่าเดิม → ขยายเป็นช่วงวันที่ (Start → End)
        if (sd === ed && dateStr > sd) {
          return {
            start: `${sd}T${st}:00+07:00`,
            end: `${dateStr}T${et}:00+07:00`,
          };
        }
        return {
          start: `${dateStr}T${st}:00+07:00`,
          end: `${dateStr}T${et}:00+07:00`,
        };
      });
    });
  };

  const updatePeriodPart = (idx: number, field: 'startDate' | 'startTime' | 'endDate' | 'endTime', val: string) => {
    setPeriods((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const sd = p.start.slice(0, 10);
        const st = p.start.slice(11, 16);
        const ed = p.end.slice(0, 10);
        const et = p.end.slice(11, 16);
        const nextSd = field === 'startDate' ? val : sd;
        const nextSt = field === 'startTime' ? val : st;
        const nextEd = field === 'endDate' ? val : field === 'startDate' && val > ed ? val : ed;
        const nextEt = field === 'endTime' ? val : et;
        return {
          start: `${nextSd}T${nextSt}:00+07:00`,
          end: `${nextEd}T${nextEt}:00+07:00`,
        };
      }),
    );
  };

  const handleSubmit = async () => {
    // ตรวจสอบเงื่อนไขวันและเวลาการจอง (Pre-validation)
    const periodErrors = validateBookingPeriods(periods, selectedVenues);
    if (periodErrors.length > 0) {
      const msg = periodErrors.join('\n');
      setSubmitError(msg);
      alert(`ไม่สามารถส่งคำขอได้:\n${msg}`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await api.createBooking({
        venueIds: selectedIds,
        periods,
        attendees: undefined, // ตัดจำนวนผู้เข้าร่วมออกตามข้อกำหนด
        activity: purposeItems[0]?.forWhat || activity,
        purpose,
        organization,
        attachments: attachmentFiles.map((file) => file.name),
        extraItems: selectedExtraItems.map((s) => ({ equipmentId: s.eq.id, qty: s.qty })),
        requesterId: isWalkIn && foundUser ? foundUser.id : undefined,
        requesterName: fullRequesterName || requesterName,
        requesterPhone,
        requesterSignature: signature,
        createdByStaffSignature: isWalkIn && staffSignature.trim() ? staffSignature : undefined,
        writtenAt,
        requesterPosition,
        addressHouseNo,
        addressMoo,
        addressSubdistrict,
        addressDistrict,
        addressProvince,
        purposeItems: purposeItems.filter((pi) => pi.item.trim() || pi.forWhat.trim()),
      });
      router.push(`/requests/${created.id}`);
    } catch (err: any) {
      const errorMsg =
        err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง';
      setSubmitError(errorMsg);
      alert(`เกิดข้อผิดพลาดในการส่งคำขอ:\n${errorMsg}`);
      setTimeout(() => {
        document.getElementById('booking-submit-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={
        step === 1
          ? 'สถานที่'
          : step === 2
          ? 'เลือกวัน-เวลา'
          : step === 3
          ? 'เลือกอุปกรณ์เสริม'
          : step === 4
          ? 'แบบคำขอใช้สถานที่'
          : 'ลงนามและส่งคำขอ'
      }
      backHref={step === 1 ? (account ? roleHomePath(account.role) : '/') : undefined}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      rightLabel={account?.name}
      maxWidth="max-w-[1440px]"
      footer={
        step === 1 ? (
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setStep(2)}
            className="jw-btn w-full sm:w-auto sm:min-w-[260px]"
          >
            ถัดไป · เลือกวัน-เวลา ({selectedIds.length} รายการ)
          </button>
        ) : step === 2 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(1)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={
                effectiveConflicts.length > 0 ||
                periods.length === 0 ||
                periods.some((p) => !p?.start || !p?.end)
              }
              onClick={() => {
                if (periodValidationErrors.length > 0) {
                  const msg = periodValidationErrors.join('\n');
                  alert(`ไม่สามารถดำเนินการต่อได้:\n${msg}`);
                  return;
                }
                setStep(3);
              }}
              className="jw-btn flex-[1.5] sm:w-56"
            >
              ถัดไป · เลือกอุปกรณ์เสริม
            </button>
          </div>
        ) : step === 3 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(2)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={hasEquipmentShortage}
              onClick={() => {
                syncFormPurposeItems(selectedVenues, selectedExtraItems);
                setStep(4);
              }}
              className="jw-btn flex-[1.5] sm:w-56 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedExtraItems.length > 0
                ? `ถัดไป · กรอกคำขอ (${selectedExtraItems.length} รายการ)`
                : 'ถัดไป · กรอกคำขอ'}
            </button>
          </div>
        ) : step === 4 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(3)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => {
                if (missingRequestFields.length > 0) {
                  setShowRequestErrors(true);
                  window.setTimeout(() => document.getElementById('request-form-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
                  return;
                }
                setShowRequestErrors(false);
                setStep(5);
              }}
              className="jw-btn flex-[1.5] sm:w-56"
            >
              ถัดไป · ลงนามและส่ง
            </button>
          </div>
        ) : (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(4)} className="jw-btn-sec flex-1 sm:w-28">
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
              {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอ'}
            </button>
          </div>
        )
      }
    >
      <div className="w-full mb-5">
        <Stepper steps={STEPS} current={step} onSelect={setStep} />
      </div>

      {/* ================= STEP 1: เลือกสถานที่ ================= */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_320px] gap-4 lg:gap-5 items-start">
          {/* ตัวกรองด้านซ้าย (Desktop) */}
          <aside className="hidden lg:flex jw-card p-5 flex-col gap-4">
            <b className="text-[16px] flex items-center gap-2">
              <Icon name="filter" className="w-4 h-4 text-brand" /> ตัวกรอง
            </b>
            <div>
              <label className="jw-lbl">ประเภท</label>
              <div className="flex flex-col gap-2 text-[14px]">
                {(
                  [
                    ['all', 'ทั้งหมด'],
                    ['meeting', 'ห้องประชุม'],
                    ['pavilion', 'ศาลา'],
                    ['field', 'สนามกีฬา'],
                    ['yard', 'ลานกิจกรรม'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCatFilter(val)}
                    className="flex items-center gap-2.5 text-left"
                  >
                    <i
                      className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center ${
                        catFilter === val ? 'bg-brand border-brand text-white' : 'border-line bg-white'
                      }`}
                    >
                      {catFilter === val && <Icon name="check" className="w-3 h-3" strokeWidth={3} />}
                    </i>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="jw-lbl">อาคาร</label>
              <select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="jw-in"
              >
                <option value="all">ทั้งหมด</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setOnlyAvailable((v) => !v)}
              className="flex items-center gap-2.5 text-[14px]"
            >
              <i
                className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center ${
                  onlyAvailable ? 'bg-brand border-brand text-white' : 'border-line bg-white'
                }`}
              >
                {onlyAvailable && <Icon name="check" className="w-3 h-3" strokeWidth={3} />}
              </i>
              <span>เฉพาะที่พร้อมใช้งาน</span>
            </button>
          </aside>

          {/* กลาง: ค้นหา + หมวดหมู่ + การ์ดสถานที่ */}
          <div className="flex flex-col gap-3.5">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-ph">
                <Icon name="search" className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาสถานที่"
                className="jw-in rounded-full pl-11 h-[42px]"
              />
            </div>

            {/* ปุ่มหมวดหมู่ (Mobile/Tablet) */}
            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {(
                [
                  ['all', 'ทั้งหมด'],
                  ['meeting', 'ห้องประชุม'],
                  ['pavilion', 'ศาลา'],
                  ['field', 'สนาม'],
                  ['yard', 'ลานกิจกรรม'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCatFilter(val)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition ${
                    catFilter === val ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-soft hover:bg-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <details className="lg:hidden jw-card p-3.5">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink">ตัวกรองเพิ่มเติม</summary>
              <div className="mt-3 flex flex-col gap-3">
                <label className="text-caption font-semibold text-ink-soft" htmlFor="mobile-building-filter">อาคาร</label>
                <select
                  id="mobile-building-filter"
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                  className="jw-in"
                >
                  <option value="all">ทั้งหมด</option>
                  {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setOnlyAvailable((v) => !v)}
                  className="flex min-h-11 items-center gap-2.5 text-left text-[14px]"
                >
                  <i className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center ${onlyAvailable ? 'bg-brand border-brand text-white' : 'border-line bg-white'}`}>
                    {onlyAvailable && <Icon name="check" className="w-3 h-3" strokeWidth={3} />}
                  </i>
                  <span>เฉพาะที่พร้อมใช้งาน</span>
                </button>
              </div>
            </details>

            <div className="flex items-center justify-between">
              <b className="text-[16px] sm:text-[18px]">สถานที่ทั้งหมด</b>
              <span className="text-[13px] text-ink-mute">{filteredVenues.length} แห่ง</span>
            </div>

            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-3.5">
              {filteredVenues.map((v) => {
                const isSelected = selectedIds.includes(v.id);
                const disabled = v.status !== 'available' || !v.enabled;
                return (
                  <div
                    key={v.id}
                    onClick={() => toggleVenue(v)}
                    className={`bg-white rounded-hard shadow-low overflow-hidden relative transition ${
                      disabled
                        ? 'opacity-55 cursor-not-allowed'
                        : 'cursor-pointer hover:shadow-card'
                    } ${isSelected ? 'ring-2 ring-brand' : 'border border-line/60'}`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-10 w-[22px] h-[22px] rounded-full bg-brand text-white flex items-center justify-center shadow">
                        <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />
                      </div>
                    )}
                    <div className="h-28 sm:h-36 bg-brand-mint text-brand flex items-center justify-center overflow-hidden">
                      <ThumbnailImage
                        src={v.images?.[0]}
                        alt={v.name}
                        iconName={venueIconName(v.type)}
                      />
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <b className="text-[14px] sm:text-[15px] text-ink truncate">{v.name}</b>
                      <span className="text-[12px] text-ink-mute inline-flex items-center gap-1">
                        <Icon name="users" className="w-3.5 h-3.5" /> {v.capacity} คน · {VENUE_TYPE_LABEL[v.type]}
                      </span>
                      <div className="pt-0.5">
                        {disabled ? (
                          <Chip tone="red">ปิดปรับปรุง</Chip>
                        ) : (
                          <Chip tone="green">พร้อมใช้งาน</Chip>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ขวา: รายการที่เลือก (Desktop) */}
          <aside className="jw-card p-4 sm:p-5 flex flex-col gap-3.5 lg:col-span-2 2xl:col-span-1">
            <b className="text-[17px]">รายการที่เลือก ({selectedVenues.length})</b>
            {selectedVenues.length === 0 ? (
              <div className="text-[13px] text-ink-mute py-4">กรุณาแตะเลือกสถานที่อย่างน้อย 1 แห่ง</div>
            ) : (
              selectedVenues.map((v) => (
                <div key={v.id} className="border border-line rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0 overflow-hidden">
                    <ThumbnailImage
                      src={v.images?.[0]}
                      alt={v.name}
                      iconName={venueIconName(v.type)}
                      fallbackClassName="w-6 h-6"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[14px] truncate">{v.name}</b>
                    <span className="text-[12px] text-ink-mute">
                      {v.building} {v.floor !== '-' ? v.floor : ''} · {v.capacity} คน
                    </span>
                  </div>
                </div>
              ))
            )}
            <span className="text-[12px] text-ink-mute">เลือกได้หลายรายการต่อหนึ่งคำขอ</span>
          </aside>
        </div>
      )}

      {/* ================= STEP 2: เลือกวัน-เวลา ================= */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          {periodValidationErrors.length > 0 && (
            <div className="rounded-2xl bg-[#FDE8E8] border-2 border-[#f9b4b4] p-4 flex items-start gap-3 text-[13px] text-[#7a1010] shadow-sm animate-fadeIn">
              <Icon name="alert-triangle" className="w-5 h-5 text-status-crit shrink-0 mt-0.5" />
              <div>
                <b className="block font-bold text-[14px]">เงื่อนไขวันและเวลาไม่ถูกต้อง ({periodValidationErrors.length} รายการ):</b>
                <ul className="list-disc pl-4 mt-1.5 space-y-1">
                  {periodValidationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {bookingMode === 'hourly' ? (
            <HourlyBookingSection
              selectedVenues={selectedVenues}
              availability={availability}
              month={month}
              onMonthChange={setMonth}
              periods={periods}
              onSelectPeriods={setPeriods}
              onSwitchToDaily={() => setBookingMode('daily')}
              bookingMode={bookingMode}
            />
          ) : (
            <div className="flex flex-col gap-4">
            {/* ส่วนหัวสลับโหมดในหน้าจองรายวัน */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-line shadow-card">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  2
                </span>
                <div>
                  <b className="text-[15px] sm:text-[16px] text-ink">เลือกวันและเวลาใช้งาน (จองรายวัน)</b>
                  <p className="text-[12px] text-ink-mute">
                    {selectedVenues.map((v) => v.name).join(', ')} · รูปแบบดั้งเดิม (ช่วงวันไป-กลับ)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBookingMode('hourly')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-brand hover:text-brand-dark hover:bg-brand-mint border border-brand/30 transition font-semibold"
                  title="สลับไปใช้งานแบบเลือกรอบรายชั่วโมง (ค่าเริ่มต้น)"
                >
                  <Icon name="clock" className="w-3.5 h-3.5" />
                  <span>สลับไปจองรายชั่วโมง</span>
                </button>
                <span className="text-[12px] font-semibold text-ink-soft bg-soft px-3 py-1.5 rounded-full border border-line">
                  จองรายวัน
                </span>
              </div>
            </div>

            {minAdvanceDays > 0 && (
              <div className="p-3 bg-brand-mint/50 border border-brand/20 rounded-xl flex items-center gap-2.5 text-[12px] text-brand-dark">
                <Icon name="info" className="w-4 h-4 text-brand shrink-0" />
                <span>
                  <b>เงื่อนไขการจองล่วงหน้า:</b> สถานที่นี้กำหนดให้ต้องจองล่วงหน้าอย่างน้อย <b>{minAdvanceDays} วัน</b>{' '}
                  (สามารถเลือกวันได้ตั้งแต่วันที่ <b>{formatThaiDate(earliestBookableDate, true)}</b> เป็นต้นไป)
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
              <div className="flex flex-col gap-3">
                <CalendarC4
                  month={month}
                  onMonthChange={setMonth}
                  availability={availability}
                  periods={periods}
                  conflictPeriodIndexes={effectiveConflicts.map((c) => c.periodIndex)}
                  onPickDate={handlePickCalendarDate}
                  minAdvanceDays={minAdvanceDays}
                />

                <div className="text-[13px] text-ink-mute flex items-center gap-1.5 px-1">
                  <Icon name="calendar" className="w-4 h-4 text-brand" />
                  <span>แตะเลือกวันที่ในปฏิทินเพื่อเปลี่ยนวันของ <b>ช่วงที่ {activePeriodIdx + 1}</b></span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <b className="text-[17px]">ช่วงเวลาที่ขอใช้</b>
                {periods.map((p, idx) => {
                  const hasConflict = effectiveConflicts.some((c) => c.periodIndex === idx);
                  const isEditing = activePeriodIdx === idx;
                  const sd = p.start.slice(0, 10);
                  const st = p.start.slice(11, 16);
                  const ed = p.end.slice(0, 10);
                  const et = p.end.slice(11, 16);

                  return (
                    <div
                      key={idx}
                      onClick={() => setActivePeriodIdx(idx)}
                      className={`jw-card p-3.5 flex flex-col gap-2.5 cursor-pointer transition ${
                        hasConflict
                          ? 'border-[1.5px] border-status-crit'
                          : isEditing
                          ? 'ring-2 ring-brand'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <b className="flex-1 text-[14px]">ช่วงที่ {idx + 1}</b>
                        {hasConflict ? (
                          <Chip tone="red">ไม่ว่าง</Chip>
                        ) : (
                          <Chip tone="green">{periodDurationText(p)}</Chip>
                        )}
                        {periods.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPeriods((prev) => prev.filter((_, i) => i !== idx));
                              setActivePeriodIdx(0);
                            }}
                            className="w-7 h-7 rounded-full bg-soft text-ink-mute flex items-center justify-center hover:text-status-crit"
                          >
                            <Icon name="x" className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="border border-line rounded-xl p-2 bg-white flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-ink-mute">เริ่มต้น</span>
                            <span className="text-[11px] text-brand font-semibold">{formatThaiDate(sd, false)}</span>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_94px] gap-2">
                            <DatePickerField value={sd} minDate={earliestBookableDate} label={`วันที่เริ่มต้น ช่วงที่ ${idx + 1}`} onChange={(value) => updatePeriodPart(idx, 'startDate', value)} />
                            <TimePickerField value={st} label={`เวลาเริ่มต้น ช่วงที่ ${idx + 1}`} onChange={(value) => updatePeriodPart(idx, 'startTime', value)} />
                          </div>
                        </div>

                        <span className="hidden sm:inline text-ink-mute">
                          <Icon name="arrow-right" className="w-4 h-4" />
                        </span>

                        <div className="border border-line rounded-xl p-2 bg-white flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-ink-mute">สิ้นสุด</span>
                            <span className="text-[11px] text-brand font-semibold">{formatThaiDate(ed, false)}</span>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_94px] gap-2">
                            <DatePickerField value={ed} minDate={sd || earliestBookableDate} label={`วันที่สิ้นสุด ช่วงที่ ${idx + 1}`} onChange={(value) => updatePeriodPart(idx, 'endDate', value)} />
                            <TimePickerField value={et} label={`เวลาสิ้นสุด ช่วงที่ ${idx + 1}`} onChange={(value) => updatePeriodPart(idx, 'endTime', value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setPeriods((prev) => {
                      const last = prev[prev.length - 1];
                      const nextDate = last
                        ? last.end.slice(0, 10)
                        : earliestBookableDate;
                      const next = [
                        ...prev,
                        { start: `${nextDate}T09:00:00+07:00`, end: `${nextDate}T12:00:00+07:00` },
                      ];
                      setActivePeriodIdx(next.length - 1);
                      return next;
                    });
                  }}
                  className="h-11 border-[1.5px] border-dashed border-brand rounded-sq text-brand font-semibold flex items-center justify-center gap-1.5 hover:bg-brand-mint/50"
                >
                  <Icon name="plus" className="w-4 h-4" /> เพิ่มช่วงเวลา
                </button>

                {periodValidationErrors.length > 0 && (
                  <div className="rounded-2xl bg-[#FDE8E8] border-2 border-[#f9b4b4] p-3.5 flex items-start gap-2.5 text-[13px] text-[#7a1010] shadow-sm animate-fadeIn">
                    <Icon name="alert-triangle" className="w-5 h-5 text-status-crit shrink-0 mt-0.5" />
                    <div>
                      <b className="block font-bold">เงื่อนไขวันและเวลาไม่ถูกต้อง:</b>
                      <ul className="list-disc pl-4 mt-1 space-y-1">
                        {periodValidationErrors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {effectiveConflicts.length > 0 ? (
                  <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] p-3.5 flex items-start gap-2.5 text-[13px] text-[#7a1010]">
                    <Icon name="x" className="w-5 h-5 text-status-crit shrink-0 mt-0.5" />
                    <div>
                      <b>{effectiveConflicts[0].venueName} ไม่ว่างในช่วงนี้</b>
                      <br />
                      วันที่ {formatThaiDateTime(effectiveConflicts[0].start)}–
                      {new Date(effectiveConflicts[0].end).toTimeString().slice(0, 5)} มีผู้ขอใช้แล้ว กรุณาปรับวัน-เวลาใหม่
                    </div>
                  </div>
                ) : (
                  <div className="jw-card p-3.5 bg-brand-mint flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <b className="text-[14px]">{selectedVenues.map((v) => v.name).join(', ')}</b>
                      <Chip tone="green">
                        <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} /> ว่าง
                      </Chip>
                    </div>
                    <span className="text-[13px] text-ink-mute">
                      รวม {periods.length} ช่วง · ไม่ซ้ำกับรายการอื่นทุกช่วง
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ================= STEP 3: เลือกอุปกรณ์เสริม ================= */}
      {step === 3 && (
        <div className="max-w-[900px] mx-auto flex flex-col gap-4">
          <div className="jw-card p-4 sm:p-5 flex flex-col gap-2 bg-gradient-to-r from-soft to-white">
            <div className="flex items-center justify-between">
              <div>
                <b className="text-[16px] text-ink block">อุปกรณ์เสริมและสิ่งอำนวยความสะดวก</b>
                <span className="text-[13px] text-ink-mute">
                  เลือกอุปกรณ์ที่ต้องการใช้ร่วมกับสถานที่ เช่น เครื่องเสียง ไมโครโฟน โปรเจกเตอร์ เต็นท์ หรือโต๊ะ-เก้าอี้
                </span>
              </div>
              {selectedExtraItems.length > 0 && (
                <span className="px-3 py-1 rounded-full text-[12px] font-bold bg-brand text-white shrink-0">
                  เลือก {selectedExtraItems.reduce((acc, x) => acc + x.qty, 0)} ชิ้น
                </span>
              )}
            </div>

            {selectedVenues.length > 0 && (
              <div className="pt-2 border-t border-line/60 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-mute">
                <span>สำหรับสถานที่:</span>
                {selectedVenues.map((v) => (
                  <span key={v.id} className="font-semibold text-brand bg-brand-mint px-2 py-0.5 rounded-full">
                    {v.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ค้นหาและตัวกรอง */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              placeholder="ค้นหาอุปกรณ์เสริม..."
              className="jw-in flex-1"
            />
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {(
                [
                  ['all', 'ทั้งหมด'],
                  ['audio', 'เครื่องเสียง'],
                  ['tent', 'เต็นท์ / โต๊ะ-เก้าอี้'],
                  ['it', 'อุปกรณ์ IT'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEquipmentCat(val)}
                  className={`h-[38px] px-3.5 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                    equipmentCat === val
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white border-line text-ink hover:border-brand'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* รายการอุปกรณ์ */}
          <div className="flex flex-col gap-2.5">
            {filteredEquipment.length === 0 ? (
              <div className="jw-card p-8 text-center text-ink-mute text-[14px]">
                ไม่พบอุปกรณ์ในหมวดหมู่นี้
              </div>
            ) : (
              filteredEquipment.map((eq) => {
                const qty = equipmentQuantities[eq.id] ?? 0;
                const isSelected = qty > 0;
                const stockInfo = equipmentStockSummary[eq.id];
                const maxAvailable = stockInfo ? stockInfo.availableQty : eq.stock;
                const reservedCount = stockInfo ? stockInfo.reservedQty : 0;
                const isOutOfStock = maxAvailable <= 0;
                const isOverStock = qty > maxAvailable;

                return (
                  <div
                    key={eq.id}
                    className={`jw-card p-3.5 sm:p-4 flex flex-col gap-2 transition ${
                      isSelected ? 'ring-2 ring-brand bg-brand-mint/10' : ''
                    } ${isOutOfStock ? 'opacity-85' : ''}`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden ${
                          isSelected ? 'bg-brand text-white' : 'bg-brand-mint text-brand'
                        }`}
                      >
                        <ThumbnailImage
                          src={eq.images?.[0]}
                          alt={eq.name}
                          iconName={equipmentIconName(eq.category)}
                          fallbackClassName="w-6 h-6"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <b className="block text-[15px] text-ink truncate">{eq.name}</b>
                        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] mt-0.5">
                          <span className="text-ink-mute">{EQUIPMENT_CATEGORY_LABEL[eq.category]}</span>
                          <span className="text-ink-mute">·</span>
                          {isOutOfStock ? (
                            <span className="text-red-700 font-semibold flex items-center gap-1">
                              <Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span>ของหมดในช่วงวัน-เวลาที่เลือก (ติดจอง {reservedCount} ชิ้น)</span>
                            </span>
                          ) : reservedCount > 0 ? (
                            <span className="text-amber-800 font-medium">
                              คงเหลือว่าง <b className="text-brand font-bold">{maxAvailable}</b> / {eq.stock} ชิ้น{' '}
                              <span className="text-ink-mute">(ติดจอง {reservedCount})</span>
                            </span>
                          ) : (
                            <span className="text-ink-mute">
                              พร้อมให้บริการ <b className="text-ink font-semibold">{maxAvailable}</b> ชิ้น
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() => setEquipmentQty(eq.id, maxAvailable, qty - 1)}
                          className="w-[34px] h-[34px] rounded-full border-[1.5px] border-line hover:border-ink flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="minus" className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={maxAvailable}
                          disabled={isOutOfStock}
                          value={qty}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            setEquipmentQty(eq.id, maxAvailable, Number.isNaN(val) ? 0 : val);
                          }}
                          onFocus={(e) => e.target.select()}
                          className={`w-12 h-9 text-center text-[15px] font-bold rounded-xl border border-line bg-white text-ink focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-line/20 disabled:text-ink-mute [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            isSelected ? 'text-brand border-brand/60' : ''
                          }`}
                        />
                        <button
                          type="button"
                          disabled={qty >= maxAvailable}
                          onClick={() => setEquipmentQty(eq.id, maxAvailable, qty + 1)}
                          className="w-[34px] h-[34px] rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-deep disabled:opacity-30 disabled:pointer-events-none transition"
                        >
                          <Icon name="plus" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {isOverStock && (
                      <div className="text-[12px] font-semibold text-red-700 flex items-center gap-1.5 pl-1">
                        <Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        <span>จำนวนที่เลือกเกินสต๊อกที่ว่างในช่วงเวลานี้ (ว่างเพียง {maxAvailable} ชิ้น)</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* แจ้งเตือนเมื่อมีอุปกรณ์เสริมเกินสต๊อกที่ว่าง */}
          {hasEquipmentShortage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-[13px] text-red-800">
              <Icon name="alert-triangle" className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                <b>ไม่สามารถดำเนินการต่อได้:</b> อุปกรณ์เสริมบางรายการติดจองจนไม่พอตามจำนวนที่เลือก กรุณาลดจำนวนอุปกรณ์ที่ต้องการ
              </span>
            </div>
          )}

          {/* สรุปรายการอุปกรณ์ที่เลือก (ถ้ามี) */}
          {selectedExtraItems.length > 0 && (
            <div className="rounded-2xl bg-brand-mint/30 border border-brand/20 p-3.5 flex flex-col gap-2">
              <b className="text-[13px] text-brand block">รายการอุปกรณ์เสริมที่เลือกไว้:</b>
              <div className="flex flex-wrap gap-2">
                {selectedExtraItems.map((item) => (
                  <span
                    key={item.eq.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-line text-[12.5px] font-medium text-ink shadow-sm"
                  >
                    <span>{item.eq.name}</span>
                    <b className="text-brand font-bold">x{item.qty}</b>
                    <button
                      type="button"
                      onClick={() => setEquipmentQty(item.eq.id, item.eq.stock, 0)}
                      className="ml-1 text-ink-mute hover:text-ink font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 4: กรอกคำขอ (แบบขอใช้สถานที่ราชการ) ================= */}
      {step === 4 && (
        <div className="max-w-[960px] mx-auto jw-card p-5 sm:p-7 flex flex-col gap-4">
          {showRequestErrors && missingRequestFields.length > 0 && (
            <div id="request-form-errors" role="alert" className="rounded-2xl border border-status-crit/30 bg-status-crit/5 p-4 text-[13px] text-status-crit">
              <b className="mb-1 block">กรุณากรอกข้อมูลและแนบเอกสารให้ครบก่อนดำเนินการต่อ</b>
              <span>ยังขาด: {missingRequestFields.join(' · ')}</span>
            </div>
          )}
          <div className="pb-3 border-b border-line">
            <b className="text-[17px] text-ink block">แบบขอใช้สถานที่ราชการ</b>
            <span className="text-[12.5px] text-ink-mute">
              เรื่อง ขออนุญาตใช้สถานที่ราชการ
            </span>
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
            <div className="lg:col-span-3">
              <label className="jw-lbl">เขียนที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="text"
                value={writtenAt}
                onChange={(e) => setWrittenAt(e.target.value)}
                className="jw-in"
                placeholder="ระบุสถานที่เขียนคำขอ"
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
                placeholder="ระบุชื่อ-นามสกุล"
                required
              />
            </div>
            <div className="lg:col-span-2">
              <label className="jw-lbl">เบอร์โทรศัพท์ติดต่อ<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="tel"
                value={requesterPhone}
                onChange={(e) => setRequesterPhone(e.target.value)}
                className="jw-in"
                placeholder="เช่น 081-234-5678"
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

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="jw-lbl">อยู่บ้านเลขที่<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="text"
                value={addressHouseNo}
                onChange={(e) => setAddressHouseNo(e.target.value)}
                className="jw-in"
                placeholder="เลขที่"
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
                placeholder="หมู่ที่"
                required
              />
            </div>
            <div>
              <label className="jw-lbl">ตำบล / แขวง<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="text"
                value={addressSubdistrict}
                onChange={(e) => setAddressSubdistrict(e.target.value)}
                className="jw-in"
                placeholder="ตำบล / แขวง"
                required
              />
            </div>
            <div>
              <label className="jw-lbl">อำเภอ / เขต<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="text"
                value={addressDistrict}
                onChange={(e) => setAddressDistrict(e.target.value)}
                className="jw-in"
                placeholder="อำเภอ / เขต"
                required
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="jw-lbl">จังหวัด<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
              <input
                type="text"
                value={addressProvince}
                onChange={(e) => setAddressProvince(e.target.value)}
                className="jw-in"
                placeholder="ระบุจังหวัด"
                required
              />
            </div>
          </div>

          <div>
            <label className="jw-lbl">หน่วยงาน / ชุมชน<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="jw-in"
              placeholder="ระบุหน่วยงานหรือกลุ่มชุมชน"
              required
            />
          </div>

          {/* มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้ (ล็อกรายการตามที่เลือกไว้) */}
          <div className="rounded-2xl bg-soft/60 border border-line p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <b className="text-[14px] text-ink">มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้</b>
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
                    value={row.forWhat}
                    readOnly
                    disabled
                    className="jw-in h-10 text-[13.5px] bg-soft/80 text-ink-mute cursor-not-allowed select-none"
                  />
                </div>
              </div>
            ))}
          </div>

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

          <div>
            <label className="jw-lbl">แนบสำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ<span className="text-[9px] font-semibold leading-none text-status-crit">*</span></label>
            <input
              type="file"
              className="hidden"
              id="booking-attachment"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              required={attachmentFiles.length === 0}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length) {
                  const unique = picked.filter((file) => !attachmentFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified));
                  const combined = [...attachmentFiles, ...unique];
                  setAttachmentError(combined.length > 3 ? 'แนบเอกสารได้สูงสุด 3 ไฟล์' : '');
                  setAttachmentFiles(combined.slice(0, 3));
                }
                e.target.value = '';
              }}
            />
            <div className="rounded-2xl border-[1.5px] border-dashed border-brand/70 bg-white p-3">
              {attachmentFiles.length ? (
                <div className="flex flex-col gap-2">
                  {attachmentFiles.map((file) => (
                    <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-ink"><FileText className="size-[18px]" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ink" title={file.name}>{file.name}</div>
                        <div className="text-[11px] text-ink-mute">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                      </div>
                      <button type="button" aria-label={`ดูไฟล์ ${file.name}`} title="ดูไฟล์" onClick={() => setAttachmentPreview({ file, url: URL.createObjectURL(file) })} className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-brand-ink transition hover:bg-brand-tint"><Eye className="size-[18px]" /></button>
                      <button type="button" aria-label={`นำไฟล์ ${file.name} ออก`} title="นำไฟล์ออก" onClick={() => setAttachmentFiles((current) => current.filter((item) => item !== file))} className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-mute transition hover:bg-danger-bg hover:text-danger-fg"><X className="size-4" /></button>
                    </div>
                  ))}
                  {attachmentFiles.length < 3 && <button type="button" onClick={() => setAttachmentPanelOpen(true)} className="self-start px-2 pt-1 text-[12px] font-semibold text-brand-ink hover:underline">+ เพิ่มไฟล์ ({attachmentFiles.length}/3)</button>}
                </div>
              ) : (
                <button type="button" onClick={() => setAttachmentPanelOpen(true)} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl px-3 py-4 text-center text-ink-mute transition hover:bg-canvas">
                  <Upload className="size-4 text-brand" />
                  <span><span className="font-medium text-ink">คลิกเพื่อเลือกสำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ</span><span className="mt-0.5 block text-[12px]">PDF / JPG / PNG ไม่เกิน 10 MB ต่อไฟล์</span></span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {attachmentPanelOpen && createPortal((
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setAttachmentPanelOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="attachment-dialog-title" className="flex max-h-[min(86dvh,680px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-high">
            <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-ink"><FileText className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="attachment-dialog-title" className="text-[16px] font-bold text-ink">สำเนาบัตรประชาชนหรือเอกสารประกอบคำขอ</h2>
                <p className="text-[12px] text-ink-mute">แนบได้สูงสุด 3 ไฟล์ · {attachmentFiles.length}/3</p>
              </div>
              <button type="button" aria-label="ปิดหน้าต่างเอกสาร" onClick={() => setAttachmentPanelOpen(false)} className="flex size-9 items-center justify-center rounded-full text-ink-mute hover:bg-soft hover:text-ink"><X className="size-5" /></button>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
              {attachmentFiles.length ? attachmentFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-ink"><FileText className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink" title={file.name}>{file.name}</div>
                    <div className="text-[11px] text-ink-mute">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                  </div>
                  <button type="button" aria-label={`ดูไฟล์ ${file.name}`} title="ดูไฟล์" onClick={() => setAttachmentPreview({ file, url: URL.createObjectURL(file) })} className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-brand-ink transition hover:bg-brand-tint"><Eye className="size-[18px]" /></button>
                  <button type="button" aria-label={`นำไฟล์ ${file.name} ออก`} title="นำไฟล์ออก" onClick={() => setAttachmentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-mute transition hover:bg-danger-bg hover:text-danger-fg"><X className="size-4" /></button>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-line p-8 text-center">
                  <Upload className="mx-auto size-7 text-brand" />
                  <p className="mt-2 text-[13px] font-semibold text-ink">ยังไม่มีเอกสารแนบ</p>
                  <p className="mt-1 text-[12px] text-ink-mute">เลือกไฟล์ PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB</p>
                </div>
              )}
              {attachmentError && <div role="alert" className="text-[12px] font-medium text-danger-fg">{attachmentError}</div>}
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-between sm:px-5">
              {attachmentFiles.length < 3 ? (
                <label htmlFor="booking-attachment" className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-line px-4 text-[13px] font-semibold text-brand-ink hover:bg-brand-tint">+ เพิ่มไฟล์</label>
              ) : <span className="self-center text-[12px] text-ink-mute">แนบครบ 3 ไฟล์แล้ว</span>}
              <button type="button" onClick={() => setAttachmentPanelOpen(false)} className="jw-btn-sec h-10 px-5">เสร็จสิ้น</button>
            </footer>
          </section>
        </div>
      ), document.body)}

      {attachmentPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setAttachmentPreview(null); }}>
          <div className="flex h-[min(90dvh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-high">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <FileText className="size-5 shrink-0 text-brand-ink" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{attachmentPreview.file.name}</span>
              <button type="button" aria-label="ปิดตัวอย่างไฟล์" onClick={() => setAttachmentPreview(null)} className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-soft hover:text-ink"><X className="size-5" /></button>
            </div>
            <div className="min-h-0 flex-1 bg-canvas">
              {attachmentPreview.file.type === 'application/pdf' || attachmentPreview.file.name.toLowerCase().endsWith('.pdf') ? (
                <iframe title={`ตัวอย่าง ${attachmentPreview.file.name}`} src={attachmentPreview.url} className="size-full border-0" />
              ) : (
                <div className="flex size-full items-center justify-center overflow-auto p-3"><img src={attachmentPreview.url} alt={attachmentPreview.file.name} className="max-h-full max-w-full object-contain" /></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 5: ลงนามและส่ง ================= */}
      {step === 5 && (
        <div className="max-w-[960px] mx-auto flex flex-col gap-4">
          {submitError && (
            <div
              id="booking-submit-error"
              className="rounded-2xl bg-[#FDE8E8] border-2 border-[#f9b4b4] p-4 flex items-start gap-3 text-[14px] text-[#7a1010] shadow-md animate-fadeIn"
            >
              <Icon name="alert-triangle" className="w-5 h-5 text-status-crit shrink-0 mt-0.5" />
              <div className="flex-1">
                <b className="block text-[15px] font-bold">ไม่สามารถส่งคำขอได้</b>
                <p className="mt-1 leading-relaxed whitespace-pre-line">{submitError}</p>
              </div>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="text-[#7a1010] hover:text-black p-1"
                title="ปิดการแจ้งเตือน"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* แสดงเอกสารจริงตามแบบขอใช้สถานที่ราชการ */}
          <OfficialGovFormDocument
            customFields={{
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
                {isWalkIn ? `1. ลงลายมือชื่อผู้ขออนุญาตใช้สถานที่ราชการ (${fullRequesterName || requesterName})` : `ลงลายมือชื่อผู้ขออนุญาตใช้สถานที่ราชการ (${fullRequesterName || requesterName})`}
              </label>
              <SignatureBox
                value={signature}
                onChange={setSignature}
                savedSignature={isWalkIn ? undefined : account?.signature}
                signerLabel={`${fullRequesterName || requesterName} · ผู้ขออนุญาตใช้สถานที่ราชการ`}
              />
            </div>

            {isWalkIn && (
              <div className="pt-2 border-t border-line">
                <label className="jw-lbl">
                  2. ลงลายมือชื่อเจ้าหน้าที่ผู้กรอกแทน ({account?.name || 'เจ้าหน้าที่'})
                </label>
                <SignatureBox
                  value={staffSignature}
                  onChange={setStaffSignature}
                  savedSignature={account?.signature}
                  signerLabel={`${account?.name || 'เจ้าหน้าที่'} · เจ้าหน้าที่ผู้กรอกคำขอแทน`}
                />
              </div>
            )}

            <p className="text-[13px] text-ink-mute mt-1">
              ต้องลงนามทุกฝ่าย (4 ฝ่าย): (1) ผู้ขออนุญาตใช้สถานที่ราชการ → (2) ความเห็นของเจ้าหน้าที่ → (3) ความเห็นของปลัด → (4) คำสั่งของผู้มีอำนาจอนุมัติ
            </p>
            {draftSaved && (
              <div className="rounded-2xl bg-brand-mint text-brand px-3.5 py-2 text-[13px] font-semibold">
                บันทึกร่างคำขอเรียบร้อยแล้ว
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
