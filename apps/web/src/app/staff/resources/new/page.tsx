'use client';

/**
 * =====================================================================
 * หน้าเพิ่มทรัพยากรใหม่ (Add Resource Page: Venue / Equipment)
 * =====================================================================
 * ฟังก์ชันการทำงาน:
 * 1. สลับชนิดทรัพยากร: 'venue' (สถานที่) หรือ 'equipment' (อุปกรณ์/ครุภัณฑ์)
 * 2. อัปโหลดภาพถ่ายจริงสูงสุด 3 รูป พร้อมการย่อบีบอัดอัตโนมัติ
 * 3. กรอกข้อมูลทั่วไป เช่น ชื่อ, ประเภท, อาคาร, ชั้น, ความจุ, สิ่งอำนวยความสะดวก
 * 4. กำหนดเงื่อนไขการจอง: เวลาเปิด-ปิด, วันที่เปิดให้บริการ, จำนวนวันต้องจองล่วงหน้า
 * 5. จัดลำดับสายการอนุมัติ (Drag-and-Drop approval order)
 * 6. เลือกหรือสร้างแบบฟอร์มเอกสารราชการใหม่ผ่าน OfficialDocumentEditor
 */

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DocumentTemplateItem,
  EquipmentCategory,
  FACILITIES,
  NAME_MAX_LENGTH,
  PricingMode,
  VENUE_TYPE_LABEL,
  VenueType,
  clampNameInput,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { NameLengthBadge, NameLimitWarning, SearchableCombobox, Stepper, Tabs, Toggle } from '@/components/ui';
import { FreeformTemplateEditorModal } from '@/components/freeform-a4-editor';
import { api, readAndCompressImages } from '@/lib/api';

type Kind = 'venue' | 'equipment';
const DAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function AddResourcePage() {
  const router = useRouter();
  // Ref สำหรับคลิกเปิด File picker
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // ชนิดทรัพยากรที่ต้องการเพิ่ม (สถานที่ หรือ อุปกรณ์)
  const [kind, setKind] = useState<Kind>('venue');
  // สเต็ปบนมุมมองมือถือ (1: ข้อมูลทั่วไป, 2: เงื่อนไขและอนุมัติ)
  const [mobileStep, setMobileStep] = useState(1);

  // รายการแม่แบบฟอร์มที่มีในระบบ
  const [availableForms, setAvailableForms] = useState<DocumentTemplateItem[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplateItem | null>(null);

  const loadForms = () => {
    api.listDocumentTemplates().then(setAvailableForms).catch(() => {});
  };

  // โหลดรายการแม่แบบฟอร์มเมื่อเข้าหน้าจอ
  useEffect(() => {
    loadForms();
  }, []);

  // รูปภาพจริง (สูงสุด 3 รูป เก็บเป็น Base64 Data URL)
  const [images, setImages] = useState<string[]>([]);
  // State ข้อมูลรูปภาพที่กำลังเปิดดูตัวอย่างขนาดใหญ่
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // ฟิลด์ข้อมูลสถานที่
  const [name, setName] = useState('');
  const [venueType, setVenueType] = useState<VenueType>('meeting');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [capacity, setCapacity] = useState(50);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('17:00');
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [advanceDays, setAdvanceDays] = useState(3);
  const [formName, setFormName] = useState('แบบคำขอใช้สถานที่');
  const [enabled, setEnabled] = useState(true);
  const [approvalOrder, setApprovalOrder] = useState<string[]>([
    'เจ้าหน้าที่ตรวจสอบ',
    'ผู้อนุมัติระดับ 2 (ปลัด อบต.)',
    'ผู้อนุมัติระดับ 1 (นายก อบต.)',
  ]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // ฟิลด์ข้อมูลอุปกรณ์/ครุภัณฑ์
  const [eqCategory, setEqCategory] = useState<EquipmentCategory>('audio');
  const [stock, setStock] = useState(1);

  // ฟิลด์ค่าธรรมเนียมและค่ามัดจำ
  const [pricingMode, setPricingMode] = useState<PricingMode>('free');
  const [feeAmount, setFeeAmount] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);

  // State การส่งบันทึกและข้อผิดพลาด
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ฟังก์ชันจัดเรียงลำดับขั้นตอนสายการอนุมัติ
  const moveApprovalStep = (from: number, to: number) => {
    if (to < 0 || to >= approvalOrder.length || from === to) return;
    setApprovalOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // เปิด/ปิดสิ่งอำนวยความสะดวก
  const toggleFacility = (f: string) => {
    setFacilities((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  // เปิด/ปิดวันเปิดให้บริการในสัปดาห์
  const toggleDay = (d: number) => {
    setOpenDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  // เลือกและบีบอัดรูปภาพ
  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const remaining = Math.max(0, 3 - images.length);
    if (remaining === 0) return;
    try {
      const added = await readAndCompressImages(e.target.files, remaining);
      if (added.length > 0) {
        setImages((prev) => [...prev, ...added].slice(0, 3));
      }
    } catch (err) {
      setError((err as Error).message || 'ไม่สามารถอ่านไฟล์รูปภาพได้');
    } finally {
      e.target.value = '';
    }
  };

  // ลบรูปภาพที่เลือก
  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // ฟังก์ชันบันทึกข้อมูลทรัพยากรใหม่
  const handleSave = async () => {
    if (!name.trim()) {
      setError(kind === 'venue' ? 'กรุณากรอกชื่อสถานที่' : 'กรุณากรอกชื่ออุปกรณ์ / ครุภัณฑ์');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (kind === 'venue') {
        await api.createVenue({
          name: name.trim(),
          type: venueType,
          building: building.trim() || 'อาคารสำนักงาน',
          floor: floor.trim() || 'ชั้น 1',
          capacity,
          facilities,
          openTime,
          closeTime,
          openDays,
          advanceDays,
          formName,
          enabled,
          images,
          pricingMode,
          feeAmount: pricingMode === 'free' ? 0 : feeAmount,
          depositAmount,
        });
      } else {
        await api.createEquipment({
          name: name.trim(),
          category: eqCategory,
          stock,
          enabled,
          images,
          pricingMode,
          feeAmount: pricingMode === 'free' ? 0 : feeAmount,
          depositAmount,
        });
      }
      router.push('/staff/resources');
    } catch (err) {
      setError((err as Error).message || 'บันทึกรายการไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="เพิ่มรายการ"
      backHref="/staff/resources"
      rightLabel="เจ้าหน้าที่"
      footer={
        <div className="flex w-full sm:w-auto gap-2.5">
          {mobileStep === 2 ? (
            <button
              type="button"
              onClick={() => setMobileStep(1)}
              className="lg:hidden jw-btn-sec flex-1"
            >
              ย้อนกลับ
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/staff/resources')}
              className="jw-btn-sec flex-1 sm:w-36"
            >
              ยกเลิก
            </button>
          )}

          {mobileStep === 1 ? (
            <button
              type="button"
              onClick={() => setMobileStep(2)}
              className="lg:hidden jw-btn flex-[1.5]"
            >
              ถัดไป · เงื่อนไข
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !name.trim()}
              onClick={handleSave}
              className="lg:hidden jw-btn flex-[1.5]"
            >
              {submitting ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
            </button>
          )}

          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={handleSave}
            className="hidden lg:inline-flex jw-btn w-52"
          >
            {submitting ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
          </button>
        </div>
      }
    >
      {/* ส่วนหัวและแท็บสลับชนิดทรัพยากร */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-ink">เพิ่มรายการ</h1>
          <p className="text-[13px] text-ink-mute">สถานที่หรืออุปกรณ์ครุภัณฑ์ใหม่ที่เปิดให้จอง</p>
        </div>
        <Tabs<Kind>
          value={kind}
          onChange={(nextKind) => {
            setKind(nextKind);
            setError('');
            setFormName(nextKind === 'venue' ? 'แบบคำขอใช้สถานที่' : 'แบบคำขอยืมครุภัณฑ์');
          }}
          className="w-full sm:w-80"
          options={[
            { value: 'venue', label: 'สถานที่' },
            { value: 'equipment', label: 'อุปกรณ์ / ครุภัณฑ์' },
          ]}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-4 py-2.5 text-[13px] text-[#7a1010]">
          {error}
        </div>
      )}

      {/* Stepper บนมือถือ */}
      <div className="lg:hidden mb-4">
        <Stepper
          steps={['ข้อมูลทั่วไป', 'เงื่อนไขและอนุมัติ']}
          current={mobileStep}
          onSelect={setMobileStep}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* คอลัมน์ที่ 1: ข้อมูลทั่วไป */}
        <div
          className={`jw-card p-5 sm:p-6 flex flex-col gap-4 ${
            mobileStep === 2 ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* อัปโหลดรูปภาพ */}
          <div>
            <label className="jw-lbl">รูปภาพ (ไม่เกิน 3 รูป)</label>
            <p className="text-[12px] text-ink-mute mb-2">แนะนำขนาด 4:3 แนวนอน (สูงสุด 3 รูป)</p>
            <div className="flex flex-wrap gap-2.5">
              {images.map((src, i) => (
                <div
                  key={i}
                  className="relative w-24 h-24 rounded-2xl overflow-hidden border border-line group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`รูปที่ ${i + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewImg(src)}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="w-6 h-6 rounded-full bg-black/70 text-white absolute top-1 right-1 flex items-center justify-center text-[12px] opacity-0 group-hover:opacity-100 transition"
                  >
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {images.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center gap-1 text-[12px] text-ink-mute hover:text-brand transition bg-soft/40"
                >
                  <Icon name="upload" className="w-5 h-5" />
                  <span>เพิ่มรูป</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleSelectFiles}
              className="hidden"
            />
          </div>

          {/* ชื่อสถานที่ หรือ ชื่ออุปกรณ์ */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="jw-lbl mb-0">
                {kind === 'venue' ? 'ชื่อสถานที่' : 'ชื่ออุปกรณ์ / ครุภัณฑ์'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <NameLengthBadge
                value={name}
                maxLength={kind === 'venue' ? NAME_MAX_LENGTH.VENUE_NAME : NAME_MAX_LENGTH.EQUIPMENT_NAME}
              />
            </div>
            <input
              type="text"
              placeholder={
                kind === 'venue'
                  ? 'เช่น ห้องประชุมใหญ่ อบต. หรือ ศาลาประชาคม'
                  : 'เช่น ชุดเครื่องเสียงเคลื่อนที่ หรือ เต็นท์โค้งขาว'
              }
              value={name}
              maxLength={kind === 'venue' ? NAME_MAX_LENGTH.VENUE_NAME : NAME_MAX_LENGTH.EQUIPMENT_NAME}
              onChange={(e) =>
                setName(
                  clampNameInput(
                    e.target.value,
                    kind === 'venue' ? NAME_MAX_LENGTH.VENUE_NAME : NAME_MAX_LENGTH.EQUIPMENT_NAME,
                  ),
                )
              }
              className="jw-in"
            />
            <NameLimitWarning
              value={name}
              maxLength={kind === 'venue' ? NAME_MAX_LENGTH.VENUE_NAME : NAME_MAX_LENGTH.EQUIPMENT_NAME}
            />
          </div>

          {kind === 'venue' ? (
            <>
              {/* ประเภทสถานที่ */}
              <div>
                <label className="jw-lbl">ประเภท</label>
                <div className="flex flex-wrap gap-2">
                  {(['meeting', 'pavilion', 'field', 'yard', 'training'] as VenueType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVenueType(t)}
                      className={`h-[38px] px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                        venueType === t
                          ? 'bg-brand border-brand text-white'
                          : 'bg-white border-line text-ink hover:border-brand'
                      }`}
                    >
                      {VENUE_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* อาคารและชั้น */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="jw-lbl mb-0">อาคาร</label>
                    <NameLengthBadge value={building} maxLength={NAME_MAX_LENGTH.BUILDING_NAME} />
                  </div>
                  <input
                    type="text"
                    placeholder="เช่น อาคารสำนักงาน"
                    value={building}
                    maxLength={NAME_MAX_LENGTH.BUILDING_NAME}
                    onChange={(e) => setBuilding(clampNameInput(e.target.value, NAME_MAX_LENGTH.BUILDING_NAME))}
                    className="jw-in"
                  />
                  <NameLimitWarning value={building} maxLength={NAME_MAX_LENGTH.BUILDING_NAME} />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="jw-lbl mb-0">ชั้น</label>
                    <NameLengthBadge value={floor} maxLength={NAME_MAX_LENGTH.FLOOR_NAME} />
                  </div>
                  <input
                    type="text"
                    placeholder="เช่น ชั้น 1"
                    value={floor}
                    maxLength={NAME_MAX_LENGTH.FLOOR_NAME}
                    onChange={(e) => setFloor(clampNameInput(e.target.value, NAME_MAX_LENGTH.FLOOR_NAME))}
                    className="jw-in"
                  />
                  <NameLimitWarning value={floor} maxLength={NAME_MAX_LENGTH.FLOOR_NAME} />
                </div>
              </div>

              {/* ความจุ */}
              <div>
                <label className="jw-lbl">ความจุ (คน)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
                    className="jw-in flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCapacity((c) => Math.max(1, c - 10))}
                      className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-ink font-bold hover:bg-soft"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setCapacity((c) => c + 10)}
                      className="w-10 h-10 rounded-xl bg-ink text-white flex items-center justify-center font-bold hover:bg-ink-dark"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* สิ่งอำนวยความสะดวก */}
              <div>
                <label className="jw-lbl">สิ่งอำนวยความสะดวก</label>
                <div className="flex flex-wrap gap-2">
                  {FACILITIES.map((f) => {
                    const on = facilities.includes(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleFacility(f)}
                        className={`h-[38px] px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                          on
                            ? 'bg-brand border-brand text-white'
                            : 'bg-white border-line text-ink hover:border-brand'
                        }`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* หมวดหมู่อุปกรณ์ */}
              <div>
                <label className="jw-lbl">หมวดหมู่อุปกรณ์</label>
                <SearchableCombobox
                  searchable={false}
                  clearable={false}
                  value={eqCategory}
                  onChange={(val) => setEqCategory(val as EquipmentCategory)}
                  options={[
                    { value: 'audio', label: 'เครื่องเสียง / ไมโครโฟน' },
                    { value: 'tent', label: 'เต็นท์ / โต๊ะ / เก้าอี้' },
                    { value: 'it', label: 'โปรเจกเตอร์ / จอภาพ' },
                  ]}
                />
              </div>

              {/* จำนวนสต็อกคงเหลือ */}
              <div>
                <label className="jw-lbl">จำนวนที่มีให้ยืม (ชิ้น/ชุด)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={stock}
                    onChange={(e) => setStock(Math.max(1, Number(e.target.value) || 1))}
                    className="jw-in flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStock((s) => Math.max(1, s - 1))}
                      className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-ink font-bold hover:bg-soft"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setStock((s) => s + 1)}
                      className="w-10 h-10 rounded-xl bg-ink text-white flex items-center justify-center font-bold hover:bg-ink-dark"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* คอลัมน์ที่ 2: เงื่อนไขและอนุมัติ */}
        <div
          className={`jw-card p-5 sm:p-6 flex flex-col gap-4 ${
            mobileStep === 1 ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {kind === 'venue' && (
            <>
              {/* เวลาเปิด-ปิด และขอล่วงหน้า */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="jw-lbl">เปิด</label>
                  <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="jw-in"
                  />
                </div>
                <div>
                  <label className="jw-lbl">ปิด</label>
                  <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="jw-in"
                  />
                </div>
                <div>
                  <label className="jw-lbl">ขอล่วงหน้า</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={advanceDays}
                      onChange={(e) => setAdvanceDays(Math.max(0, Number(e.target.value) || 0))}
                      className="jw-in text-center flex-1"
                    />
                    <span className="text-[12px] text-ink-mute shrink-0">วัน</span>
                  </div>
                </div>
              </div>

              {/* วันที่เปิดให้จอง */}
              <div>
                <label className="jw-lbl">วันที่เปิดให้จอง</label>
                <div className="flex gap-1.5">
                  {DAYS_TH.map((d, i) => {
                    const active = openDays.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`flex-1 h-9 rounded-full text-[12px] font-semibold transition ${
                          active
                            ? 'bg-brand text-white shadow-xs'
                            : 'bg-soft text-ink-mute hover:bg-brand-mint'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ลำดับการอนุมัติ (Drag-and-Drop) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="jw-lbl mb-0">ลำดับการอนุมัติ (ลากเรียงลำดับได้)</label>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-mint text-brand font-semibold">
                {approvalOrder.length} ระดับ
              </span>
            </div>
            {approvalOrder.map((label, idx) => (
              <div
                key={label}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) {
                    moveApprovalStep(dragIdx, idx);
                    setDragIdx(null);
                  }
                }}
                className="flex items-center gap-2.5 py-2.5 border-t border-line text-[14px] cursor-grab active:cursor-grabbing"
              >
                <span className="w-6 h-6 rounded-full bg-brand-mint text-brand font-bold text-[12px] flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1">{label}</span>
                <div className="flex items-center gap-1 text-[#9A9A9A]">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveApprovalStep(idx, idx - 1)}
                    className="px-1.5 py-0.5 rounded border border-line text-[11px] text-ink disabled:opacity-30"
                    title="เลื่อนขึ้น"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === approvalOrder.length - 1}
                    onClick={() => moveApprovalStep(idx, idx + 1)}
                    className="px-1.5 py-0.5 rounded border border-line text-[11px] text-ink disabled:opacity-30"
                    title="เลื่อนลง"
                  >
                    ↓
                  </button>
                  <Icon name="grip-vertical" className="w-4 h-4 ml-1" />
                </div>
              </div>
            ))}
          </div>

          {/* แบบฟอร์มราชการที่ผูกกับทรัพยากรนี้ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="jw-lbl mb-0">แบบฟอร์มที่ใช้</label>
              <button
                type="button"
                onClick={async () => {
                  const title = window.prompt('ตั้งชื่อแบบฟอร์มเอกสารใหม่:', 'แบบขอใช้สถานที่ราชการ (แบบใหม่)');
                  if (!title || !title.trim()) return;
                  try {
                    const created = await api.createDocumentTemplate({
                      name: title.trim(),
                      category: kind,
                      structure: {
                        editorMode: 'freeform',
                        freeformElements: [],
                        title: title.trim(),
                        writtenAt: '',
                        writtenDate: '',
                        subject: '',
                        recipient: '',
                        requesterClause: '',
                        requesterSlots: [],
                        purposeText: '',
                        purposeItems: [],
                        closingText: '',
                        signatures: [],
                      },
                    });
                    loadForms();
                    setFormName(created.name);
                    setEditingTemplate(created);
                  } catch (err) {
                    alert((err as Error).message || 'สร้างแบบฟอร์มไม่สำเร็จ');
                  }
                }}
                className="text-[12px] font-semibold text-brand flex items-center gap-1 hover:underline"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>+ เพิ่มแบบฟอร์มใหม่</span>
              </button>
            </div>
            <div className="flex gap-2">
              <SearchableCombobox
                clearable={false}
                value={formName}
                onChange={setFormName}
                className="flex-1"
                placeholder="เลือกแบบฟอร์ม"
                searchPlaceholder="ค้นหาแบบฟอร์ม..."
                options={
                  availableForms.length === 0
                    ? [{ value: formName, label: formName }]
                    : availableForms.map((f) => ({ value: f.name, label: f.name }))
                }
              />
              <button
                type="button"
                onClick={() => {
                  const found = availableForms.find((f) => f.name === formName) || availableForms[0];
                  if (found) setEditingTemplate(found);
                }}
                disabled={availableForms.length === 0}
                className="px-3.5 py-2 rounded-xl border border-brand bg-brand-mint text-brand text-[13px] font-semibold hover:bg-brand hover:text-white disabled:opacity-40 transition flex items-center gap-1.5 shrink-0"
                title="เปิดตัวจัดการและแก้ไขแบบฟอร์ม"
              >
                <Icon name="file-text" className="w-4 h-4" />
                <span>เปิดตัวจัดการแบบฟอร์ม</span>
              </button>
            </div>
            <p className="text-[12px] text-ink-mute mt-1.5">
              กด <b>+ เพิ่มแบบฟอร์มใหม่</b> หรือ <b>เปิดตัวจัดการแบบฟอร์ม</b> เพื่อแก้ไขและปรับแต่งเนื้อหากระดาษราชการ
            </p>
          </div>

          {/* ค่าธรรมเนียมและค่ามัดจำ */}
          <div className="border border-line rounded-2xl p-4 bg-surface-muted/35 space-y-3">
            <div>
              <b className="block text-[14px] text-ink">ค่าธรรมเนียมและค่ามัดจำ</b>
              <span className="text-[12px] text-ink-mute">
                ตั้งค่าเป็น &quot;ฟรี&quot; หากไม่มีค่าใช้จ่าย (หากมีค่าใช้จ่าย ระบบจะแจ้งให้ชำระหลังอนุมัติ)
              </span>
            </div>
            <div>
              <label className="jw-lbl">รูปแบบการคิดค่าบริการ</label>
              <SearchableCombobox
                searchable={false}
                clearable={false}
                value={pricingMode}
                onChange={(val) => {
                  const m = val as PricingMode;
                  setPricingMode(m);
                  if (m === 'free') setFeeAmount(0);
                }}
                options={
                  kind === 'venue'
                    ? [
                        { value: 'free', label: 'ฟรี (ไม่มีค่าใช้จ่าย)' },
                        { value: 'flat', label: 'เหมาต่อครั้ง' },
                        { value: 'per_hour', label: 'รายชั่วโมง' },
                        { value: 'per_day', label: 'รายวัน' },
                      ]
                    : [
                        { value: 'free', label: 'ฟรี (ไม่มีค่าใช้จ่าย)' },
                        { value: 'flat', label: 'เหมาต่อชิ้น / ครั้ง' },
                        { value: 'per_day', label: 'รายวัน (ต่อชิ้น/วัน)' },
                      ]
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pricingMode !== 'free' && (
                <div>
                  <label className="jw-lbl">
                    ค่าบริการ (บาท{pricingMode === 'per_hour' ? '/ชม.' : pricingMode === 'per_day' ? '/วัน' : '/ครั้ง'})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="jw-in"
                  />
                </div>
              )}
              <div>
                <label className="jw-lbl">ค่ามัดจำความเสียหาย (บาท{kind === 'equipment' ? '/ชิ้น' : ''})</label>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="jw-in"
                />
              </div>
            </div>
          </div>

          {/* สวิตช์เปิดให้จอง */}
          <div className="border border-line rounded-2xl p-3.5 flex items-center justify-between bg-white">
            <div>
              <b className="block text-[14px]">เปิดให้จอง</b>
              <span className="text-[12px] text-ink-mute">
                สถานะ: {enabled ? 'พร้อมใช้งาน' : 'ปิดปรับปรุงชั่วคราว'}
              </span>
            </div>
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>
        </div>
      </div>

      {/* Modal ดูรูปภาพขนาดใหญ่ */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImg}
              alt="ตัวอย่างรูปภาพ"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain bg-white"
            />
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="w-8 h-8 rounded-full bg-black/80 text-white absolute -top-3 -right-3 flex items-center justify-center"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal ตัวแก้ไขแม่แบบเอกสารแบบอิสระบนกระดาษ A4 */}
      {editingTemplate && (
        <FreeformTemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setEditingTemplate(null);
            loadForms();
          }}
          onSaved={(updated) => {
            setAvailableForms((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setFormName(updated.name);
          }}
        />
      )}
    </AppShell>
  );
}
