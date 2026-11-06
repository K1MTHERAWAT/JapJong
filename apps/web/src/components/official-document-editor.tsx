'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import {
  FormDocumentConfig,
  getFormTemplate,
  saveFormTemplateConfig,
  saveTemplateToDatabase,
  fetchFormTemplatesFromApi,
} from '@/lib/forms-store';

export interface OfficialDocumentEditorProps {
  initialFormTitle?: string;
  initialConfig?: FormDocumentConfig;
  isBorrowMode?: boolean;
  onSave?: (data: { htmlContent: string; logoUrl: string | null; formTitle: string; config?: FormDocumentConfig }) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export interface FieldSlot {
  id: string;
  fieldKey: string;
  label: string;
  width: number; // in pixels (0 means full 100% width)
}

// System binding variables that can be pulled into slots
export const SYSTEM_DATA_SOURCES = [
  { key: 'blank', label: 'ช่องว่างเปล่า (เว้นไว้สำหรับเขียนมือ)' },
  { key: 'requester_name', label: 'ชื่อ-นามสกุลผู้ขอ (requester.name)' },
  { key: 'requester_position', label: 'ตำแหน่ง (requester.position)' },
  { key: 'requester_phone', label: 'เบอร์โทรศัพท์ (requester.phone)' },
  { key: 'requester_id_card', label: 'เลขบัตรประชาชน' },
  { key: 'address_no', label: 'บ้านเลขที่' },
  { key: 'address_moo', label: 'หมู่ที่' },
  { key: 'address_subdistrict', label: 'ตำบล / แขวง' },
  { key: 'address_district', label: 'อำเภอ / เขต' },
  { key: 'address_province', label: 'จังหวัด' },
  { key: 'organization', label: 'หน่วยงาน / สังกัด' },
  { key: 'written_at', label: 'สถานที่เขียน (เช่น ที่ทำการ อบต.)' },
  { key: 'doc_day', label: 'วันที่' },
  { key: 'doc_month', label: 'เดือน' },
  { key: 'doc_year', label: 'ปี พ.ศ.' },
  { key: 'subject', label: 'เรื่อง' },
  { key: 'recipient', label: 'เรียน (ผู้มีอำนาจอนุมัติ)' },
  { key: 'resource_name', label: 'ชื่อสถานที่ / ครุภัณฑ์ที่ขอใช้' },
  { key: 'purpose', label: 'วัตถุประสงค์การใช้' },
  { key: 'booking_date', label: 'วันที่ขอใช้บริการ' },
  { key: 'booking_time', label: 'เวลาที่ขอใช้บริการ' },
  { key: 'attendees_count', label: 'จำนวนผู้เข้าร่วม' },
];

export function OfficialDocumentEditor({
  initialFormTitle = 'แบบขอใช้สถานที่ราชการ',
  initialConfig,
  isBorrowMode = false,
  onSave,
  onClose,
  isModal = false,
}: OfficialDocumentEditorProps) {
  // Mode: design (shows resizable slots, tags, controls) vs preview (authentic official paper)
  const [viewMode, setViewMode] = useState<'design' | 'preview'>('design');
  const [zoomScale, setZoomScale] = useState<number>(100);

  // Logo Settings (ปิดไว้โดยค่าเริ่มต้น แสดงเฉพาะเมื่อมีการอัปโหลดรูปภาพจริง)
  const [logoVisible, setLogoVisible] = useState(false);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>('center');
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  // Active Slot Popover / Settings
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  // Form Title
  const [formTitle, setFormTitle] = useState(() =>
    isBorrowMode ? 'แบบคำขอยืมครุภัณฑ์ราชการ' : initialFormTitle
  );

  // Document Content State (Labels are editable, Slots are resizable data binding slots)
  const [writtenAtLabel, setWrittenAtLabel] = useState('เขียนที่');
  const [writtenAtSlot, setWrittenAtSlot] = useState<FieldSlot>({
    id: 's_written_at',
    fieldKey: 'written_at',
    label: 'สถานที่เขียน',
    width: 240,
  });

  const [dateDaySlot, setDateDaySlot] = useState<FieldSlot>({
    id: 's_date_day',
    fieldKey: 'doc_day',
    label: 'วันที่',
    width: 45,
  });
  const [dateMonthSlot, setDateMonthSlot] = useState<FieldSlot>({
    id: 's_date_month',
    fieldKey: 'doc_month',
    label: 'เดือน',
    width: 110,
  });
  const [dateYearSlot, setDateYearSlot] = useState<FieldSlot>({
    id: 's_date_year',
    fieldKey: 'doc_year',
    label: 'พ.ศ.',
    width: 65,
  });

  // Subject & Recipient (ข้อความพิมพ์แก้ไขได้โดยตรง ไม่ต้องใช้ช่องดึงข้อมูล)
  const [subjectLabel, setSubjectLabel] = useState('เรื่อง');
  const [subjectText, setSubjectText] = useState(() =>
    isBorrowMode ? 'ขออนุญาตใช้อุปกรณ์ของทางราชการ' : 'ขออนุญาตใช้สถานที่ราชการ'
  );

  const [recipientLabel, setRecipientLabel] = useState('เรียน');
  const [recipientText, setRecipientText] = useState('ผู้มีอำนาจอนุมัติ');

  // Requester Info Line 1: ข้าพเจ้า ..... ตำแหน่ง .....
  const [requesterPrefix, setRequesterPrefix] = useState('ข้าพเจ้า');
  const [requesterNameSlot, setRequesterNameSlot] = useState<FieldSlot>({
    id: 's_req_name',
    fieldKey: 'requester_name',
    label: 'ชื่อ-นามสกุลผู้ขอ',
    width: 260,
  });

  const [positionPrefix, setPositionPrefix] = useState('ตำแหน่ง');
  const [positionSlot, setPositionSlot] = useState<FieldSlot>({
    id: 's_req_pos',
    fieldKey: 'requester_position',
    label: 'ตำแหน่ง',
    width: 230,
  });

  // Requester Info Line 2: อยู่บ้านเลขที่ ..... หมู่ที่ ..... ตำบล ..... อำเภอ ..... จังหวัด ..... หน่วยงาน .....
  const [addressNoLabel, setAddressNoLabel] = useState('อยู่บ้านเลขที่');
  const [addressNoSlot, setAddressNoSlot] = useState<FieldSlot>({
    id: 's_addr_no',
    fieldKey: 'address_no',
    label: 'บ้านเลขที่',
    width: 60,
  });

  const [mooLabel, setMooLabel] = useState('หมู่ที่');
  const [mooSlot, setMooSlot] = useState<FieldSlot>({
    id: 's_addr_moo',
    fieldKey: 'address_moo',
    label: 'หมู่ที่',
    width: 45,
  });

  const [subdistrictLabel, setSubdistrictLabel] = useState('ตำบล');
  const [subdistrictSlot, setSubdistrictSlot] = useState<FieldSlot>({
    id: 's_addr_sub',
    fieldKey: 'address_subdistrict',
    label: 'ตำบล',
    width: 100,
  });

  const [districtLabel, setDistrictLabel] = useState('อำเภอ');
  const [districtSlot, setDistrictSlot] = useState<FieldSlot>({
    id: 's_addr_dist',
    fieldKey: 'address_district',
    label: 'อำเภอ',
    width: 100,
  });

  const [provinceLabel, setProvinceLabel] = useState('จังหวัด');
  const [provinceSlot, setProvinceSlot] = useState<FieldSlot>({
    id: 's_addr_prov',
    fieldKey: 'address_province',
    label: 'จังหวัด',
    width: 100,
  });

  const [orgLabel, setOrgLabel] = useState('หน่วยงาน');
  const [orgSlot, setOrgSlot] = useState<FieldSlot>({
    id: 's_addr_org',
    fieldKey: 'organization',
    label: 'หน่วยงาน / สังกัด',
    width: 200,
  });

  // Purpose Heading
  const [purposeLeadText, setPurposeLeadText] = useState(
    isBorrowMode
      ? 'มีความประสงค์ขอยืมครุภัณฑ์ราชการ ดังนี้'
      : 'มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้'
  );

  // Purpose Items (1. ..... เพื่อ .....)
  interface PurposeItemRow {
    id: string;
    itemNum: number;
    resourceSlot: FieldSlot;
    forLabel: string;
    purposeSlot: FieldSlot;
  }

  const [purposeRows, setPurposeRows] = useState<PurposeItemRow[]>([
    {
      id: 'row-1',
      itemNum: 1,
      resourceSlot: { id: 's_res_1', fieldKey: 'resource_name', label: 'สถานที่/อุปกรณ์ที่ขอใช้', width: 300 },
      forLabel: 'เพื่อ',
      purposeSlot: { id: 's_pur_1', fieldKey: 'purpose', label: 'วัตถุประสงค์', width: 300 },
    },
    {
      id: 'row-2',
      itemNum: 2,
      resourceSlot: { id: 's_res_2', fieldKey: 'resource_name', label: 'สถานที่/อุปกรณ์เพิ่มเติม', width: 300 },
      forLabel: 'เพื่อ',
      purposeSlot: { id: 's_pur_2', fieldKey: 'purpose', label: 'วัตถุประสงค์', width: 300 },
    },
    {
      id: 'row-3',
      itemNum: 3,
      resourceSlot: { id: 's_res_3', fieldKey: 'resource_name', label: 'สถานที่/อุปกรณ์เพิ่มเติม', width: 300 },
      forLabel: 'เพื่อ',
      purposeSlot: { id: 's_pur_3', fieldKey: 'purpose', label: 'วัตถุประสงค์', width: 300 },
    },
  ]);

  // Dynamic Custom Slots (เพิ่มช่องการดึงข้อมูลแบบเลือกได้อิสระ)
  const [customSlots, setCustomSlots] = useState<FieldSlot[]>([]);
  const [isAddSlotPickerOpen, setIsAddSlotPickerOpen] = useState(false);

  const addCustomSlot = (fieldKey: string, label: string, defaultWidth: number) => {
    const newSlot: FieldSlot = {
      id: `s_custom_${Date.now()}`,
      fieldKey,
      label,
      width: defaultWidth,
    };
    setCustomSlots((prev) => [...prev, newSlot]);
    setIsAddSlotPickerOpen(false);
    setActiveSlotId(newSlot.id);
  };

  const removeCustomSlot = (id: string) => {
    setCustomSlots((prev) => prev.filter((s) => s.id !== id));
    if (activeSlotId === id) setActiveSlotId(null);
  };

  // Closing Text
  const [closingText, setClosingText] = useState('จึงเรียนมาเพื่อพิจารณาอนุญาต');

  // Signatures
  const [respectText, setRespectText] = useState('ขอแสดงความนับถือ');
  const [requesterSigSlot, setRequesterSigSlot] = useState<FieldSlot>({
    id: 's_sig_req',
    fieldKey: 'requester_name',
    label: 'ชื่อผู้ลงนาม',
    width: 230,
  });
  const [requesterRoleCaption, setRequesterRoleCaption] = useState(
    isBorrowMode ? 'ผู้ขออนุญาตยืมครุภัณฑ์ราชการ' : 'ผู้ขออนุญาตใช้สถานที่ราชการ'
  );

  // Review & Approval Section
  const [reviewHeading, setReviewHeading] = useState('ความเห็นของเจ้าหน้าที่ผู้ตรวจสอบและผู้พิจารณา');
  const [officerNameSlot, setOfficerNameSlot] = useState<FieldSlot>({
    id: 's_sig_off',
    fieldKey: 'blank',
    label: 'ชื่อเจ้าหน้าที่',
    width: 170,
  });
  const [officerRole, setOfficerRole] = useState('เจ้าหน้าที่');

  const [deputyNameSlot, setDeputyNameSlot] = useState<FieldSlot>({
    id: 's_sig_dep',
    fieldKey: 'blank',
    label: 'ชื่อปลัด อบต.',
    width: 170,
  });
  const [deputyRole, setDeputyRole] = useState('ปลัดองค์การบริหารส่วนตำบล');

  // Mayor Section
  const [mayorHeading, setMayorHeading] = useState('คำสั่งของนายกองค์การบริหารส่วนตำบล');
  const [mayorNameSlot, setMayorNameSlot] = useState<FieldSlot>({
    id: 's_sig_may',
    fieldKey: 'blank',
    label: 'ชื่อนายก อบต.',
    width: 180,
  });
  const [mayorRole, setMayorRole] = useState('นายกองค์การบริหารส่วนตำบล');

  // Helper to adjust slot width
  const updateSlotWidth = (slot: FieldSlot, delta: number, setter: React.Dispatch<React.SetStateAction<FieldSlot>>) => {
    setter((prev) => ({
      ...prev,
      width: Math.max(30, Math.min(800, prev.width + delta)),
    }));
  };

  const updateSlotKey = (key: string, setter: React.Dispatch<React.SetStateAction<FieldSlot>>) => {
    const matched = SYSTEM_DATA_SOURCES.find((s) => s.key === key);
    setter((prev) => ({
      ...prev,
      fieldKey: key,
      label: matched?.label || key,
    }));
  };

  // Add a purpose item row
  const addPurposeRow = () => {
    const nextNum = purposeRows.length + 1;
    setPurposeRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        itemNum: nextNum,
        resourceSlot: { id: `s_res_${Date.now()}`, fieldKey: 'resource_name', label: 'สิ่งที่ขอใช้', width: 300 },
        forLabel: 'เพื่อ',
        purposeSlot: { id: `s_pur_${Date.now()}`, fieldKey: 'purpose', label: 'วัตถุประสงค์', width: 300 },
      },
    ]);
  };

  const removePurposeRow = (id: string) => {
    setPurposeRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCustomLogoUrl(reader.result as string);
      setLogoVisible(true);
      setIsLogoModalOpen(false);
    };
    reader.readAsDataURL(file);
  };

  // Hydrate config if available either from props, stored config, or database API
  useEffect(() => {
    let active = true;

    // First try synchronous cache
    const configToLoad =
      initialConfig ||
      getFormTemplate(formTitle)?.config ||
      getFormTemplate(initialFormTitle)?.config;

    const applyConfig = (c: FormDocumentConfig) => {
      if (c.formTitle) setFormTitle(c.formTitle);
      if (c.subjectText !== undefined) setSubjectText(c.subjectText);
      if (c.recipientText !== undefined) setRecipientText(c.recipientText);
      if (c.writtenAtSlot) setWrittenAtSlot(c.writtenAtSlot);
      if (c.dateDaySlot) setDateDaySlot(c.dateDaySlot);
      if (c.dateMonthSlot) setDateMonthSlot(c.dateMonthSlot);
      if (c.dateYearSlot) setDateYearSlot(c.dateYearSlot);
      if (c.requesterNameSlot) setRequesterNameSlot(c.requesterNameSlot);
      if (c.positionSlot) setPositionSlot(c.positionSlot);
      if (c.addressNoSlot) setAddressNoSlot(c.addressNoSlot);
      if (c.mooSlot) setMooSlot(c.mooSlot);
      if (c.subdistrictSlot) setSubdistrictSlot(c.subdistrictSlot);
      if (c.districtSlot) setDistrictSlot(c.districtSlot);
      if (c.provinceSlot) setProvinceSlot(c.provinceSlot);
      if (c.orgSlot) setOrgSlot(c.orgSlot);
      if (c.purposeRows && Array.isArray(c.purposeRows)) {
        setPurposeRows(c.purposeRows);
      }
      if (c.customSlots && Array.isArray(c.customSlots)) {
        setCustomSlots(c.customSlots);
      }
      if (c.closingText !== undefined) setClosingText(c.closingText);
      if (c.logoUrl !== undefined) {
        setCustomLogoUrl(c.logoUrl);
        setLogoVisible(Boolean(c.logoUrl));
      }
    };

    if (configToLoad) {
      applyConfig(configToLoad);
    }

    // Next fetch live from Database API
    fetchFormTemplatesFromApi().then((templates) => {
      if (!active) return;
      const targetName = (formTitle || initialFormTitle).trim().toLowerCase();
      const matched = templates.find(
        (t) => t.title.toLowerCase() === targetName || t.id.toLowerCase() === targetName
      );
      if (matched?.config) {
        applyConfig(matched.config);
      }
    });

    return () => {
      active = false;
    };
  }, [initialConfig, initialFormTitle]);

  // Save template
  const handleSave = async () => {
    const container = document.getElementById('a4-editor-page');
    const content = container ? container.innerHTML : '';
    const fullConfig: FormDocumentConfig = {
      formTitle,
      subjectText,
      recipientText,
      writtenAtSlot,
      dateDaySlot,
      dateMonthSlot,
      dateYearSlot,
      requesterNameSlot,
      positionSlot,
      addressNoSlot,
      mooSlot,
      subdistrictSlot,
      districtSlot,
      provinceSlot,
      orgSlot,
      purposeRows,
      customSlots,
      closingText,
      logoUrl: customLogoUrl,
    };

    // Save directly to database API (NestJS + PostgreSQL)
    await saveTemplateToDatabase(
      formTitle,
      fullConfig,
      isBorrowMode ? 'equipment' : 'venue'
    );

    onSave?.({
      htmlContent: content,
      logoUrl: customLogoUrl,
      formTitle,
      config: fullConfig,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  // Render an Interactive or Pure Dotted Field Slot
  const renderSlot = (
    slot: FieldSlot,
    setter: React.Dispatch<React.SetStateAction<FieldSlot>>,
    onDelete?: () => void
  ) => {
    const isFullWidth = slot.width === 0;
    const isActive = activeSlotId === slot.id;

    if (viewMode === 'preview') {
      // Authentic printed government dotted line (Pure dots, zero edit noise)
      return (
        <span
          style={{ width: isFullWidth ? '100%' : `${slot.width}px` }}
          className="inline-block border-b border-dotted border-black/80 h-[21px] align-baseline mx-1 px-1 text-center"
        >
          &nbsp;
        </span>
      );
    }

    // Design / Edit Mode: Resizable slot with resize buttons, badges & popover
    return (
      <span
        style={{ width: isFullWidth ? '100%' : `${slot.width}px` }}
        className={`relative inline-flex items-center justify-between border-b-2 border-dotted align-baseline mx-1 px-1.5 py-0.5 rounded transition group select-none ${
          isActive
            ? 'border-brand bg-brand-mint/40 ring-1 ring-brand'
            : 'border-slate-500 bg-slate-100 hover:bg-brand-mint/20 hover:border-brand'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setActiveSlotId(isActive ? null : slot.id);
        }}
        title="คลิกเพื่อย่อ/ขยายความกว้าง หรือลากขอบขวาเพื่อย่อขยายอย่างอิสระ"
      >
        <span className="flex items-center gap-0.5 truncate pointer-events-none">
          <span className="text-slate-400 font-mono text-[9px] select-none" title="ลากขยับได้อิสระ">⠿</span>
          <span className="text-[12px] font-medium text-slate-700 truncate block">
            {slot.fieldKey === 'blank' ? '.........' : `[ ${slot.label.split(' ')[0]} ]`}
          </span>
        </span>
        <span className="text-[10px] text-slate-500 font-mono ml-1 shrink-0 pointer-events-none">
          {slot.width}px
        </span>

        {/* Quick Hover +/- Buttons */}
        <span className="absolute -top-4 right-0 hidden group-hover:flex items-center gap-0.5 bg-slate-800 text-white rounded px-1 text-[10px] z-20 shadow-md">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateSlotWidth(slot, -20, setter);
            }}
            className="px-1 hover:text-brand-mint font-bold"
            title="ลดความกว้าง (-20px)"
          >
            −
          </button>
          <span className="text-[9px] text-slate-300 font-mono">{slot.width}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateSlotWidth(slot, +20, setter);
            }}
            className="px-1 hover:text-brand-mint font-bold"
            title="เพิ่มความกว้าง (+20px)"
          >
            +
          </button>
        </span>

        {/* Drag-to-resize handle on the right edge */}
        <span
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startW = slot.width;
            const onMouseMove = (ev: MouseEvent) => {
              const diff = ev.clientX - startX;
              setter((prev) => ({
                ...prev,
                width: Math.max(30, Math.min(650, startW + diff)),
              }));
            };
            const onMouseUp = () => {
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          }}
          className="absolute -right-1 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-brand/40 rounded-r transition z-10"
          title="คลิกลากเมาส์ซ้าย-ขวาเพื่อขยายหรือย่อขนาดช่องได้อย่างอิสระ"
        />

        {/* Popover Settings when active */}
        {isActive && (
          <div
            className="absolute top-full left-0 mt-1.5 z-40 bg-white rounded-xl shadow-high border border-slate-300 p-3 min-w-[270px] text-left cursor-default text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-line mb-2">
              <b className="text-[12.5px] text-ink font-bold">กำหนดช่องดึงข้อมูล</b>
              <button
                type="button"
                onClick={() => setActiveSlotId(null)}
                className="w-5 h-5 rounded-full hover:bg-soft flex items-center justify-center text-ink-mute"
              >
                ✕
              </button>
            </div>

            {/* Width Controls */}
            <div className="space-y-1.5 mb-2.5">
              <div className="flex items-center justify-between">
                <span className="text-ink-mute">ความกว้างช่อง:</span>
                <span className="font-bold text-brand font-mono">{slot.width} px</span>
              </div>
              <input
                type="range"
                min="40"
                max="600"
                step="10"
                value={slot.width}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setter((prev) => ({ ...prev, width: val }));
                }}
                className="w-full accent-brand cursor-pointer h-1.5 bg-slate-200 rounded"
              />
              <div className="flex gap-1 pt-1">
                {[60, 120, 200, 300, 450].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setter((prev) => ({ ...prev, width: w }))}
                    className={`flex-1 py-1 rounded text-[11px] font-mono border ${
                      slot.width === w
                        ? 'border-brand bg-brand-mint text-brand font-bold'
                        : 'border-line hover:bg-soft text-ink'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            {/* Data Binding Selector */}
            <div className="space-y-1">
              <span className="text-ink-mute block">ข้อมูลที่ดึงมาใส่:</span>
              <select
                value={slot.fieldKey}
                onChange={(e) => updateSlotKey(e.target.value, setter)}
                className="w-full p-1.5 rounded-lg border border-line bg-soft text-[11.5px] text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {SYSTEM_DATA_SOURCES.map((ds) => (
                  <option key={ds.key} value={ds.key}>
                    {ds.label}
                  </option>
                ))}
              </select>
            </div>

            {onDelete && (
              <div className="pt-2 mt-2 border-t border-line flex justify-end">
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-red-500 hover:text-red-700 text-[11px] font-semibold"
                >
                  ลบช่องนี้
                </button>
              </div>
            )}
          </div>
        )}
      </span>
    );
  };

  return (
    <div
      className={
        isModal
          ? 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4'
          : 'flex flex-col gap-3'
      }
      onClick={() => setActiveSlotId(null)}
    >
      <div
        className={
          isModal
            ? 'w-[98vw] max-w-[1550px] h-[96vh] bg-[#f8fafc] rounded-2xl md:rounded-3xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden animate-fadeIn'
            : 'bg-[#f8fafc] rounded-2xl border border-line shadow-card flex flex-col overflow-hidden'
        }
      >
        {/* ================= TOP HEADER TOOLBAR ================= */}
        <div className="bg-white border-b border-line px-3.5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center shadow-xs shrink-0">
              <Icon name="file-text" className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <b className="text-[14.5px] text-ink font-bold leading-tight">
                  ออกแบบและปรับแต่งแบบฟอร์มกระดาษราชการ
                </b>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-mint text-brand border border-brand/30">
                  {viewMode === 'design' ? 'โหมดกำหนดขนาดช่องข้อมูล' : 'โหมดตัวอย่างกระดาษจริง'}
                </span>
              </div>
              <span className="text-[11.5px] text-ink-mute block">
                พิมพ์แก้ไขข้อความได้โดยตรง · ช่องข้อมูลขยาย/ย่อส่วนได้ตามขนาดจริง
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-line text-xs">
              <button
                type="button"
                onClick={() => setViewMode('design')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'design'
                    ? 'bg-white text-brand shadow-xs font-bold'
                    : 'text-ink-mute hover:text-ink'
                }`}
              >
                <Icon name="edit" className="w-3.5 h-3.5" />
                <span>ออกแบบ &amp; ปรับช่อง</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'preview'
                    ? 'bg-white text-brand shadow-xs font-bold'
                    : 'text-ink-mute hover:text-ink'
                }`}
              >
                <Icon name="file-text" className="w-3.5 h-3.5" />
                <span>ตัวอย่างกระดาษจริง</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden md:flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl border border-line text-xs">
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.max(70, z - 10))}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white text-ink font-bold"
                title="ย่อมุมมอง"
              >
                −
              </button>
              <span className="w-11 text-center font-mono text-[11.5px] text-ink font-medium">
                {zoomScale}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.min(150, z + 10))}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white text-ink font-bold"
                title="ขยายมุมมอง"
              >
                +
              </button>
            </div>

            {/* Logo Settings */}
            <button
              type="button"
              onClick={() => setIsLogoModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-white hover:bg-slate-50 text-[12px] font-semibold text-ink transition shadow-xs"
              title="ตั้งค่าหรืออัปโหลดตราสัญลักษณ์"
            >
              <Icon name="photo" className="w-3.5 h-3.5 text-ink-soft" />
              <span className="hidden sm:inline">ตราสัญลักษณ์</span>
            </button>

            {/* Add Data Slot Button (Opens Picker Modal) */}
            <button
              type="button"
              onClick={() => setIsAddSlotPickerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand bg-brand-mint text-brand text-[12px] font-semibold hover:bg-brand hover:text-white transition shadow-xs"
              title="เลือกประเภทช่องการดึงข้อมูลเพื่อแทรกลงในเอกสาร"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              <span>+ เพิ่มช่องการดึงข้อมูล</span>
            </button>

            {/* Print / PDF */}
            <button
              type="button"
              onClick={() => {
                setViewMode('preview');
                setTimeout(() => window.print(), 200);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-white hover:bg-slate-50 text-[12px] font-semibold text-ink transition shadow-xs"
              title="พิมพ์เอกสารออกเครื่องพิมพ์หรือดาวน์โหลด PDF"
            >
              <Icon name="file-text" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">พิมพ์ / PDF</span>
            </button>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ink text-white hover:bg-black text-[12.5px] font-semibold transition shadow-xs"
            >
              <Icon name="check" className="w-3.5 h-3.5 text-status-ok" strokeWidth={3} />
              <span>บันทึกแบบฟอร์ม</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-ink-mute hover:text-ink flex items-center justify-center transition"
                title="ปิดหน้าต่าง"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ================= SCROLLABLE CANVAS VIEWPORT ================= */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center bg-slate-200/60">
          <div
            style={{
              transform: `scale(${zoomScale / 100})`,
              transformOrigin: 'top center',
            }}
            className="transition-transform duration-150"
          >
            {/* A4 Paper Canvas: Authentic Government Memo Format */}
            <div
              id="a4-editor-page"
              className="w-[820px] min-h-[1160px] bg-white p-12 sm:p-16 text-black text-[15px] leading-[2.1] shadow-2xl rounded-sm border border-slate-300 relative select-text"
              style={{ fontFamily: "'TH Sarabun New', 'Sarabun', 'Cordia New', sans-serif" }}
            >
              {/* 1. LOGO SECTION (เฉพาะเมื่อมีการอัปโหลดไฟล์ตราสัญลักษณ์จริง) */}
              {logoVisible && customLogoUrl && (
                <div
                  className={`mb-4 ${
                    logoAlign === 'left' ? 'text-left' : logoAlign === 'right' ? 'text-right' : 'text-center'
                  }`}
                >
                  <div
                    className="inline-block cursor-pointer hover:opacity-85 transition"
                    onClick={() => setIsLogoModalOpen(true)}
                    title="คลิกเพื่อปรับแต่งตราสัญลักษณ์"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customLogoUrl}
                      alt="ตราหน่วยงาน"
                      className={`object-contain inline-block ${
                        logoSize === 'small' ? 'max-h-12' : logoSize === 'large' ? 'max-h-24' : 'max-h-16'
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* 2. FORM TITLE (Editable) */}
              <div className="text-center mb-6">
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="text-xl sm:text-2xl font-bold text-center text-black bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-brand focus:outline-none w-full max-w-[500px]"
                  title="คลิกเพื่อแก้ไขชื่อแบบฟอร์ม"
                />
              </div>

              {/* 3. WRITTEN AT & DATE (Right Aligned) */}
              <div className="flex flex-col items-end text-sm space-y-1 mb-5">
                <div className="flex items-center">
                  <input
                    type="text"
                    value={writtenAtLabel}
                    onChange={(e) => setWrittenAtLabel(e.target.value)}
                    className="w-16 text-right font-medium bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  &nbsp;
                  {renderSlot(writtenAtSlot, setWrittenAtSlot)}
                </div>
                <div className="flex items-center">
                  <span className="font-medium">วันที่</span>
                  {renderSlot(dateDaySlot, setDateDaySlot)}
                  <span className="font-medium ml-1">เดือน</span>
                  {renderSlot(dateMonthSlot, setDateMonthSlot)}
                  <span className="font-medium ml-1">พ.ศ.</span>
                  {renderSlot(dateYearSlot, setDateYearSlot)}
                </div>
              </div>

              {/* 4. SUBJECT & RECIPIENT (พิมพ์ได้โดยตรง ไม่ต้องใช้ช่องดึงข้อมูล) */}
              <div className="space-y-1.5 mb-5 text-left">
                <div className="flex items-center">
                  <input
                    type="text"
                    value={subjectLabel}
                    onChange={(e) => setSubjectLabel(e.target.value)}
                    className="w-12 font-bold bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  &nbsp;&nbsp;
                  <input
                    type="text"
                    value={subjectText}
                    onChange={(e) => setSubjectText(e.target.value)}
                    className="flex-1 font-normal text-black bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded px-1.5 py-0.5"
                    title="คลิกเพื่อพิมพ์แก้ไขเรื่อง"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={recipientLabel}
                    onChange={(e) => setRecipientLabel(e.target.value)}
                    className="w-12 font-bold bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  &nbsp;&nbsp;
                  <input
                    type="text"
                    value={recipientText}
                    onChange={(e) => setRecipientText(e.target.value)}
                    className="flex-1 font-normal text-black bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded px-1.5 py-0.5"
                    title="คลิกเพื่อพิมพ์แก้ไขผู้มีอำนาจอนุมัติ"
                  />
                </div>
              </div>

              {/* 5. REQUESTER PROFILE - LINE 1 & 2 */}
              <div className="space-y-2 mb-5 leading-loose text-justify">
                {/* Line 1: ข้าพเจ้า ..... ตำแหน่ง ..... */}
                <div className="flex flex-wrap items-center">
                  <span className="inline-block w-16"></span>
                  <input
                    type="text"
                    value={requesterPrefix}
                    onChange={(e) => setRequesterPrefix(e.target.value)}
                    className="w-16 font-medium bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(requesterNameSlot, setRequesterNameSlot)}

                  <input
                    type="text"
                    value={positionPrefix}
                    onChange={(e) => setPositionPrefix(e.target.value)}
                    className="w-16 font-medium ml-2 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(positionSlot, setPositionSlot)}
                </div>

                {/* Line 2: อยู่บ้านเลขที่ ..... หมู่ที่ ..... ตำบล ..... อำเภอ ..... จังหวัด ..... หน่วยงาน ..... */}
                <div className="flex flex-wrap items-center">
                  <input
                    type="text"
                    value={addressNoLabel}
                    onChange={(e) => setAddressNoLabel(e.target.value)}
                    className="w-20 font-medium bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(addressNoSlot, setAddressNoSlot)}

                  <input
                    type="text"
                    value={mooLabel}
                    onChange={(e) => setMooLabel(e.target.value)}
                    className="w-12 font-medium ml-1 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(mooSlot, setMooSlot)}

                  <input
                    type="text"
                    value={subdistrictLabel}
                    onChange={(e) => setSubdistrictLabel(e.target.value)}
                    className="w-12 font-medium ml-1 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(subdistrictSlot, setSubdistrictSlot)}

                  <input
                    type="text"
                    value={districtLabel}
                    onChange={(e) => setDistrictLabel(e.target.value)}
                    className="w-12 font-medium ml-1 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(districtSlot, setDistrictSlot)}

                  <input
                    type="text"
                    value={provinceLabel}
                    onChange={(e) => setProvinceLabel(e.target.value)}
                    className="w-14 font-medium ml-1 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(provinceSlot, setProvinceSlot)}

                  <input
                    type="text"
                    value={orgLabel}
                    onChange={(e) => setOrgLabel(e.target.value)}
                    className="w-16 font-medium ml-1 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded"
                  />
                  {renderSlot(orgSlot, setOrgSlot)}
                </div>

                {/* Custom User Added Slots */}
                {customSlots.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-dashed border-slate-200">
                    <span className="text-xs font-bold text-slate-500 mr-1">ช่องข้อมูลที่เพิ่ม:</span>
                    {customSlots.map((cSlot) => (
                      <span key={cSlot.id} className="relative inline-flex items-center group/cslot">
                        {renderSlot(cSlot, (action) => {
                          setCustomSlots((prev) =>
                            prev.map((s) =>
                              s.id === cSlot.id
                                ? typeof action === 'function' ? action(s) : action
                                : s
                            )
                          );
                        })}
                        {viewMode === 'design' && (
                          <button
                            type="button"
                            onClick={() => removeCustomSlot(cSlot.id)}
                            className="text-red-400 hover:text-red-600 text-xs ml-0.5"
                            title="ลบช่องนี้"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 6. PURPOSE HEADER */}
              <div className="mb-3">
                <input
                  type="text"
                  value={purposeLeadText}
                  onChange={(e) => setPurposeLeadText(e.target.value)}
                  className="font-bold text-black bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full max-w-[450px]"
                />
              </div>

              {/* 7. PURPOSE ITEMS (1. ..... เพื่อ .....) */}
              <div className="space-y-2 mb-6">
                {purposeRows.map((row) => (
                  <div key={row.id} className="flex items-center group relative">
                    <span className="w-10 text-right pr-2 font-bold">{row.itemNum}.</span>

                    {/* Resource Slot */}
                    <span className="flex-1 flex items-center">
                      {renderSlot(
                        row.resourceSlot,
                        (action) => {
                          setPurposeRows((rows) =>
                            rows.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    resourceSlot:
                                      typeof action === 'function' ? action(r.resourceSlot) : action,
                                  }
                                : r
                            )
                          );
                        }
                      )}

                      <span className="mx-2 font-medium">{row.forLabel}</span>

                      {/* Purpose Slot */}
                      {renderSlot(
                        row.purposeSlot,
                        (action) => {
                          setPurposeRows((rows) =>
                            rows.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    purposeSlot:
                                      typeof action === 'function' ? action(r.purposeSlot) : action,
                                  }
                                : r
                            )
                          );
                        }
                      )}
                    </span>

                    {viewMode === 'design' && purposeRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePurposeRow(row.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-2 text-xs"
                        title="ลบแถวนี้"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {viewMode === 'design' && (
                  <button
                    type="button"
                    onClick={addPurposeRow}
                    className="text-xs font-semibold text-brand hover:underline flex items-center gap-1 mt-1 pl-10"
                    title="เพิ่มแถวรายการสถานที่หรืออุปกรณ์ที่ต้องการขอใช้"
                  >
                    <Icon name="plus" className="w-3 h-3" />
                    <span>+ เพิ่มแถวขอใช้สถานที่/อุปกรณ์</span>
                  </button>
                )}
              </div>

              {/* 8. CLOSING TEXT */}
              <div className="mb-6 flex items-center">
                <span className="inline-block w-16"></span>
                <input
                  type="text"
                  value={closingText}
                  onChange={(e) => setClosingText(e.target.value)}
                  className="font-medium bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full max-w-[350px]"
                />
              </div>

              {/* 9. SIGNATURE REQUESTER (Right Aligned) */}
              <div className="flex flex-col items-end mb-8 space-y-1">
                <div className="w-[300px] text-center space-y-2">
                  <input
                    type="text"
                    value={respectText}
                    onChange={(e) => setRespectText(e.target.value)}
                    className="text-center font-medium bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full"
                  />
                  <div className="h-4"></div>
                  <div className="flex items-center justify-center">
                    <span>(</span>
                    {renderSlot(requesterSigSlot, setRequesterSigSlot)}
                    <span>)</span>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={requesterRoleCaption}
                      onChange={(e) => setRequesterRoleCaption(e.target.value)}
                      className="text-center text-xs text-black/85 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full"
                    />
                  </div>
                </div>
              </div>

              {/* 10. REVIEW & CONSIDERATION SECTION (2 Columns) */}
              <div className="space-y-3 pt-3 border-t border-slate-300">
                <div className="mb-2">
                  <input
                    type="text"
                    value={reviewHeading}
                    onChange={(e) => setReviewHeading(e.target.value)}
                    className="font-bold underline text-black bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full max-w-[420px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6 text-center text-sm pt-2">
                  {/* Left: Officer */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-center">
                      <span className="font-medium">ลงชื่อ</span>
                      <span className="border-b border-dotted border-black/80 w-[170px] inline-block h-[18px]"></span>
                    </div>
                    <div className="flex items-center justify-center">
                      <span>(</span>
                      {renderSlot(officerNameSlot, setOfficerNameSlot)}
                      <span>)</span>
                    </div>
                    <input
                      type="text"
                      value={officerRole}
                      onChange={(e) => setOfficerRole(e.target.value)}
                      className="text-center text-xs text-black/80 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full"
                    />
                  </div>

                  {/* Right: Deputy */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-center">
                      <span className="font-medium">ลงชื่อ</span>
                      <span className="border-b border-dotted border-black/80 w-[170px] inline-block h-[18px]"></span>
                    </div>
                    <div className="flex items-center justify-center">
                      <span>(</span>
                      {renderSlot(deputyNameSlot, setDeputyNameSlot)}
                      <span>)</span>
                    </div>
                    <input
                      type="text"
                      value={deputyRole}
                      onChange={(e) => setDeputyRole(e.target.value)}
                      className="text-center text-xs text-black/80 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full"
                    />
                  </div>
                </div>
              </div>

              {/* 11. MAYOR ORDER SECTION */}
              <div className="space-y-3 pt-5 mt-4">
                <div className="mb-2">
                  <input
                    type="text"
                    value={mayorHeading}
                    onChange={(e) => setMayorHeading(e.target.value)}
                    className="font-bold underline text-black bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full max-w-[420px]"
                  />
                </div>

                <div className="flex flex-col items-end pt-1">
                  <div className="w-[300px] text-center space-y-2">
                    <div className="flex items-center justify-center">
                      <span className="font-medium">ลงชื่อ</span>
                      <span className="border-b border-dotted border-black/80 w-[180px] inline-block h-[18px]"></span>
                    </div>
                    <div className="flex items-center justify-center">
                      <span>(</span>
                      {renderSlot(mayorNameSlot, setMayorNameSlot)}
                      <span>)</span>
                    </div>
                    <input
                      type="text"
                      value={mayorRole}
                      onChange={(e) => setMayorRole(e.target.value)}
                      className="text-center text-xs text-black/80 bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:outline-none rounded w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        {savedToast && (
          <div className="p-3 bg-brand text-white text-center text-xs font-semibold flex items-center justify-center gap-2 shrink-0 animate-fadeIn">
            <Icon name="check" className="w-4 h-4" strokeWidth={3} />
            <span>บันทึกโครงสร้างแบบฟอร์มและการผูกช่องข้อมูลเรียบร้อยแล้ว</span>
          </div>
        )}
      </div>

      {/* ================= MODAL LOGO SETTINGS ================= */}
      {isLogoModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-high border border-line space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <b className="text-[15px] font-bold text-ink">ตั้งค่าตราสัญลักษณ์ / โลโก้</b>
              <button
                type="button"
                onClick={() => setIsLogoModalOpen(false)}
                className="w-7 h-7 rounded-full bg-soft text-ink-mute flex items-center justify-center hover:bg-slate-200 transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1.5">อัปโหลดไฟล์รูปภาพตราสัญลักษณ์:</label>
                <div className="space-y-2">
                  <label className="p-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand bg-slate-50 hover:bg-brand-mint/20 text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer transition">
                    <Icon name="upload" className="w-5 h-5 text-brand" />
                    <span className="font-semibold text-ink text-[12.5px]">คลิกเลือกไฟล์รูปภาพ (PNG, JPG)</span>
                    <span className="text-[11px] text-ink-mute">สำหรับใส่ตราหน่วยงานหรือสัญลักษณ์ราชการ</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>

                  {customLogoUrl && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl border border-line bg-white shadow-xs">
                      <div className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={customLogoUrl} alt="ตัวอย่างตรา" className="w-10 h-10 object-contain rounded border border-line/60 bg-white" />
                        <div>
                          <span className="text-[12px] text-ink font-semibold block">รูปภาพตราสัญลักษณ์</span>
                          <span className="text-[11px] text-status-ok font-medium">พร้อมใช้งาน</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomLogoUrl(null);
                          setLogoVisible(false);
                        }}
                        className="text-status-crit hover:underline text-xs font-semibold px-2 py-1"
                      >
                        ลบรูปภาพ
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {customLogoUrl && (
                <>
                  <div>
                    <label className="block font-semibold text-ink-soft mb-1">ขนาดของตราสัญลักษณ์:</label>
                    <div className="flex gap-2">
                      {(['small', 'medium', 'large'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setLogoSize(s)}
                          className={`flex-1 py-1.5 rounded-lg border text-center font-medium ${
                            logoSize === s ? 'border-brand bg-brand-mint text-brand font-bold' : 'border-line bg-white'
                          }`}
                        >
                          {s === 'small' ? 'เล็ก' : s === 'medium' ? 'กลาง' : 'ใหญ่'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-ink-soft mb-1">ตำแหน่งการจัดวาง:</label>
                    <div className="flex gap-2">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setLogoAlign(a)}
                          className={`flex-1 py-1.5 rounded-lg border text-center font-medium ${
                            logoAlign === a ? 'border-brand bg-brand-mint text-brand font-bold' : 'border-line bg-white'
                          }`}
                        >
                          {a === 'left' ? 'ชิดซ้าย' : a === 'center' ? 'กึ่งกลาง' : 'ชิดขวา'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line flex items-center justify-between">
                    <span className="font-semibold text-ink">แสดงตราสัญลักษณ์บนกระดาษ</span>
                    <input
                      type="checkbox"
                      checked={logoVisible}
                      onChange={(e) => setLogoVisible(e.target.checked)}
                      className="w-4 h-4 accent-brand cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsLogoModalOpen(false)}
                className="jw-btn px-4 py-2 text-xs"
              >
                เรียบร้อย
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: เลือกประเภทช่องการดึงข้อมูลที่ต้องการเพิ่ม */}
      {isAddSlotPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col text-left">
            <div className="flex items-center justify-between pb-3 border-b border-line shrink-0">
              <div>
                <b className="text-base font-bold text-ink block">เลือกประเภทช่องการดึงข้อมูล</b>
                <span className="text-xs text-ink-mute">
                  เลือกตัวแปรข้อมูลที่ต้องการดึงจากระบบ หรือช่องว่างเขียนมือเพื่อแทรกลงในเอกสาร
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSlotPickerOpen(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-ink-mute hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1 text-left">
              {/* หมวด: ข้อมูลผู้ยื่นคำขอ */}
              <div>
                <span className="text-xs font-bold text-brand uppercase tracking-wider block mb-2">
                  ข้อมูลผู้ยื่นคำขอ
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'requester_name', label: 'ชื่อ-นามสกุลผู้ขอ', width: 240 },
                    { key: 'requester_position', label: 'ตำแหน่ง', width: 180 },
                    { key: 'requester_phone', label: 'เบอร์โทรศัพท์', width: 140 },
                    { key: 'requester_id_card', label: 'เลขประจำตัวประชาชน', width: 160 },
                    { key: 'organization', label: 'หน่วยงาน / สังกัด', width: 200 },
                    { key: 'address_no', label: 'ที่อยู่ / บ้านเลขที่', width: 140 },
                  ].map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => addCustomSlot(it.key, it.label, it.width)}
                      className="p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/40 text-left text-xs transition"
                    >
                      <b className="block text-ink">{it.label}</b>
                      <span className="text-[11px] text-ink-mute font-mono">{it.key}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* หมวด: ข้อมูลคำขอและสถานที่ */}
              <div>
                <span className="text-xs font-bold text-brand uppercase tracking-wider block mb-2">
                  ข้อมูลคำขอและสถานที่
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'resource_name', label: 'สถานที่ที่ขอใช้', width: 260 },
                    { key: 'purpose', label: 'วัตถุประสงค์', width: 280 },
                    { key: 'doc_day', label: 'วันที่ขอใช้', width: 130 },
                    { key: 'written_at', label: 'สถานที่เขียนเอกสาร', width: 200 },
                  ].map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => addCustomSlot(it.key, it.label, it.width)}
                      className="p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/40 text-left text-xs transition"
                    >
                      <b className="block text-ink">{it.label}</b>
                      <span className="text-[11px] text-ink-mute font-mono">{it.key}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* หมวด: ช่องว่างสำหรับเขียนมือ */}
              <div>
                <span className="text-xs font-bold text-brand uppercase tracking-wider block mb-2">
                  ช่องว่างสำหรับเขียนมือ (ไม่ผูกข้อมูล)
                </span>
                <button
                  type="button"
                  onClick={() => addCustomSlot('blank', 'ช่องว่างเขียนมือ', 160)}
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/40 text-left text-xs transition"
                >
                  <b className="block text-ink">ช่องว่างสำหรับกรอกด้วยมือ (เส้นประเปล่า)</b>
                  <span className="text-[11px] text-ink-mute font-mono">
                    manual.blank (ปรับขนาดย่อขยาย px ได้อิสระ)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
