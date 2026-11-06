'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Equipment,
  EquipmentCategory,
  FACILITIES,
  VENUE_TYPE_LABEL,
  Venue,
  VenueType,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, Stepper, Tabs, Toggle } from '@/components/ui';
import { OfficialDocumentEditor } from '@/components/official-document-editor';
import { api, readAndCompressImages } from '@/lib/api';
import { FormTemplateItem, getFormTemplates, saveNewFormTemplate } from '@/lib/forms-store';

type Kind = 'venue' | 'equipment';
const DAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function EditResourceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id') || '';
  const kindParam = (searchParams.get('kind') as Kind) || (idParam.startsWith('e') ? 'equipment' : 'venue');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<Kind>(kindParam);
  const [mobileStep, setMobileStep] = useState(1);
  const [loading, setLoading] = useState(true);

  // รูปภาพจริง (สูงสุด 3 รูป)
  const [images, setImages] = useState<string[]>([]);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // Venue / Equipment fields
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
  const [availableForms, setAvailableForms] = useState<FormTemplateItem[]>([]);
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [isCreatingNewForm, setIsCreatingNewForm] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setAvailableForms(getFormTemplates());
  }, []);
  const [approvalOrder, setApprovalOrder] = useState<string[]>([
    'เจ้าหน้าที่ตรวจสอบ',
    'ผู้อนุมัติระดับ 2 (ปลัด อบต.)',
    'ผู้อนุมัติระดับ 1 (นายก อบต.)',
  ]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Equipment fields
  const [eqCategory, setEqCategory] = useState<EquipmentCategory>('audio');
  const [stock, setStock] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!idParam) {
      setLoading(false);
      setError('ไม่พบรหัสรายการ');
      return;
    }
    setLoading(true);
    try {
      if (kindParam === 'venue') {
        const list = await api.venues();
        const v = list.find((item) => item.id === idParam);
        if (!v) throw new Error('ไม่พบข้อมูลสถานที่');
        setName(v.name);
        setVenueType(v.type);
        setBuilding(v.building || '');
        setFloor(v.floor || '');
        setCapacity(v.capacity || 50);
        setFacilities(v.facilities || []);
        setOpenTime(v.openTime || '08:00');
        setCloseTime(v.closeTime || '17:00');
        setOpenDays(v.openDays || [1, 2, 3, 4, 5]);
        setAdvanceDays(v.advanceDays ?? 3);
        setFormName(v.formName || 'แบบคำขอใช้สถานที่');
        setEnabled(v.enabled);
        setImages(v.images || []);
      } else {
        const list = await api.equipment();
        const e = list.find((item) => item.id === idParam);
        if (!e) throw new Error('ไม่พบข้อมูลอุปกรณ์');
        setName(e.name);
        setEqCategory(e.category);
        setStock(e.stock);
        setEnabled(e.enabled);
        setImages(e.images || []);
        setFormName('แบบคำขอยืมครุภัณฑ์');
      }
    } catch (err) {
      setError((err as Error).message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [idParam, kindParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const moveApprovalStep = (from: number, to: number) => {
    if (to < 0 || to >= approvalOrder.length || from === to) return;
    setApprovalOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const toggleFacility = (f: string) => {
    setFacilities((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const toggleDay = (d: number) => {
    setOpenDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

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

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError(kind === 'venue' ? 'กรุณากรอกชื่อสถานที่' : 'กรุณากรอกชื่ออุปกรณ์ / ครุภัณฑ์');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (kind === 'venue') {
        await api.updateVenue(idParam, {
          name: name.trim(),
          type: venueType,
          building: building.trim() || 'อาคารสำนักงาน',
          floor: floor.trim() || 'ชั้น 1',
          capacity,
          facilities,
          openTime,
          closeTime,
          advanceDays,
          enabled,
          images,
        });
      } else {
        await api.updateEquipment(idParam, {
          name: name.trim(),
          category: eqCategory,
          stock,
          enabled,
          images,
        });
      }
      router.push('/admin/resources');
    } catch (err) {
      setError((err as Error).message || 'บันทึกการแก้ไขไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      if (kind === 'venue') {
        await api.deleteVenue(idParam);
      } else {
        await api.deleteEquipment(idParam);
      }
      router.push('/admin/resources');
    } catch (err) {
      setError((err as Error).message || 'ลบรายการไม่สำเร็จ');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AppShell
        title="แก้ไขรายการ"
        backHref="/admin/resources"
        rightLabel="แอดมิน"
      >
        <div className="jw-card p-12 text-center text-ink-mute">
          กำลังโหลดข้อมูลรายการ...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="แก้ไขรายการ"
      backHref="/admin/resources"
      rightLabel="แอดมิน"
      footer={
        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={submitting || deleting}
            className="jw-btn-red flex items-center justify-center gap-1.5 px-4 h-11 text-[13.5px] disabled:opacity-40"
            title="ลบรายการนี้"
          >
            <Icon name="trash" className="w-4 h-4" />
            <span>ลบรายการ</span>
          </button>

          <div className="flex items-center gap-2">
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
                onClick={() => router.push('/admin/resources')}
                className="jw-btn-sec flex-1 sm:w-32"
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
                disabled={submitting || deleting || !name.trim()}
                onClick={handleSave}
                className="lg:hidden jw-btn flex-[1.5]"
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            )}

            <button
              type="button"
              disabled={submitting || deleting || !name.trim()}
              onClick={handleSave}
              className="hidden lg:inline-flex jw-btn w-44"
            >
              {submitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
            </button>
          </div>
        </div>
      }
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-ink">
            แก้ไข{kind === 'venue' ? 'สถานที่' : 'อุปกรณ์ / ครุภัณฑ์'}
          </h1>
          <p className="text-[13px] text-ink-mute">แก้ไขข้อมูล รูปภาพ และสถานะการเปิดให้จอง</p>
        </div>
        <span className="px-3.5 py-1.5 rounded-full bg-brand-mint text-brand text-[13px] font-bold self-start sm:self-auto">
          {kind === 'venue' ? 'สถานที่' : 'อุปกรณ์ / ครุภัณฑ์'}
        </span>
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
          <div>
            <label className="jw-lbl">รูปภาพ (ไม่เกิน 3 รูป)</label>
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
                  className="w-20 h-20 rounded-2xl border border-line bg-surface overflow-hidden relative group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`รูปที่ ${idx + 1}`}
                    onClick={() => setPreviewImg(src)}
                    className="w-full h-full object-cover cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="w-5 h-5 rounded-full bg-ink text-white absolute top-1 right-1 flex items-center justify-center shadow"
                    title="ลบรูปภาพ"
                  >
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {images.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-2xl bg-white border-[1.5px] border-dashed border-[#7A7A7A] text-ink-mute text-[12px] flex flex-col items-center justify-center gap-1 hover:border-brand hover:text-brand transition cursor-pointer"
                >
                  <Icon name="upload" className="w-5 h-5" />
                  <span>เพิ่มรูป</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="jw-lbl">{kind === 'venue' ? 'ชื่อสถานที่' : 'ชื่ออุปกรณ์ / ครุภัณฑ์'}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === 'venue'
                  ? 'เช่น ห้องประชุมใหญ่ อบต. หรือ ศาลาประชาคม'
                  : 'เช่น ชุดเครื่องเสียงเคลื่อนที่ หรือ เต็นท์โค้งขาว'
              }
              className="jw-in"
            />
          </div>

          {kind === 'venue' ? (
            <>
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="jw-lbl">อาคาร</label>
                  <input
                    type="text"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="เช่น อาคารสำนักงาน"
                    className="jw-in"
                  />
                </div>
                <div>
                  <label className="jw-lbl">ชั้น</label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="เช่น ชั้น 1"
                    className="jw-in"
                  />
                </div>
                <div>
                  <label className="jw-lbl">ความจุ (คน)</label>
                  <div className="jw-in flex items-center justify-between px-2.5">
                    <span className="font-semibold text-[13px]">{capacity} คน</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setCapacity((c) => Math.max(10, c - 10))}
                        className="w-6 h-6 rounded-full border border-ink flex items-center justify-center"
                      >
                        <Icon name="minus" className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapacity((c) => c + 10)}
                        className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center"
                      >
                        <Icon name="plus" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="jw-lbl">หมวดหมู่อุปกรณ์</label>
                <select
                  value={eqCategory}
                  onChange={(e) => setEqCategory(e.target.value as EquipmentCategory)}
                  className="jw-in"
                >
                  <option value="audio">เครื่องเสียง</option>
                  <option value="tent">เต็นท์ / เก้าอี้</option>
                  <option value="it">IT</option>
                </select>
              </div>
              <div>
                <label className="jw-lbl">จำนวนคงเหลือ</label>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(Math.max(0, Number(e.target.value)))}
                  className="jw-in"
                />
              </div>
            </div>
          )}
        </div>

        {/* คอลัมน์ที่ 2: เงื่อนไขและการอนุมัติ */}
        <div
          className={`jw-card p-5 sm:p-6 flex flex-col gap-4 ${
            mobileStep === 1 ? 'hidden lg:flex' : 'flex'
          }`}
        >
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
              <div className="jw-in flex items-center justify-between px-2.5">
                <span className="font-semibold text-[13px]">{advanceDays} วัน</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setAdvanceDays((d) => Math.max(0, d - 1))}
                    className="w-6 h-6 rounded-full border border-ink flex items-center justify-center"
                  >
                    <Icon name="minus" className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvanceDays((d) => d + 1)}
                    className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center"
                  >
                    <Icon name="plus" className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="jw-lbl">วันที่เปิดให้จอง</label>
            <div className="flex gap-1.5">
              {DAYS_TH.map((label, idx) => {
                const on = openDays.includes(idx);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`flex-1 h-[38px] rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                      on
                        ? 'bg-brand border-brand text-white'
                        : 'bg-white border-line text-ink hover:border-brand'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-line rounded-2xl px-4 py-2 bg-white">
            <div className="flex items-center justify-between py-2">
              <div>
                <b className="text-[14px] block">ลำดับการอนุมัติ (ลากเรียงลำดับได้)</b>
                <span className="text-[11.5px] text-ink-mute">ลากวางหรือกดลูกศรเพื่อสลับลำดับสายอนุมัติ</span>
              </div>
              <Chip tone="green">
                <Icon name="shield-check" className="w-3.5 h-3.5" /> 3 ระดับ
              </Chip>
            </div>
            {approvalOrder.map((label, idx) => (
              <div
                key={label}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) moveApprovalStep(dragIdx, idx);
                  setDragIdx(null);
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="jw-lbl mb-0">แบบฟอร์มที่ใช้</label>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewForm(true);
                  setShowDocEditor(true);
                }}
                className="text-[12px] font-semibold text-brand flex items-center gap-1 hover:underline"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>+ เพิ่มแบบฟอร์มใหม่</span>
              </button>
            </div>
            <div className="flex gap-2">
              <select value={formName} onChange={(e) => setFormName(e.target.value)} className="jw-in flex-1">
                {availableForms.map((f) => (
                  <option key={f.id} value={f.title}>
                    {f.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewForm(false);
                  setShowDocEditor(true);
                }}
                className="px-3.5 py-2 rounded-xl border border-brand bg-brand-mint text-brand text-[13px] font-semibold hover:bg-brand hover:text-white transition flex items-center gap-1.5 shrink-0"
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

      {/* Modal ตัวจัดการและแก้ไขแบบฟอร์มกระดาษราชการ */}
      {showDocEditor && (
        <OfficialDocumentEditor
          isModal={true}
          initialFormTitle={
            isCreatingNewForm
              ? 'แบบขอใช้สถานที่ราชการ (แบบใหม่)'
              : formName
          }
          isBorrowMode={formName.includes('ครุภัณฑ์') || formName.includes('อุปกรณ์')}
          onClose={() => setShowDocEditor(false)}
          onSave={({ formTitle }) => {
            const trimmed = formTitle.trim();
            if (isCreatingNewForm && trimmed) {
              saveNewFormTemplate(trimmed);
              setAvailableForms(getFormTemplates());
            }
            setFormName(trimmed);
            setShowDocEditor(false);
          }}
        />
      )}

      {/* Modal ยืนยันการลบรายการ */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="jw-card max-w-[420px] w-full p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Icon name="trash" className="w-5 h-5" />
              </div>
              <div>
                <b className="text-[17px] text-ink block">ยืนยันการลบรายการ</b>
                <span className="text-[12.5px] text-ink-mute">การลบนี้ไม่สามารถย้อนกลับได้</span>
              </div>
            </div>

            <p className="text-[14px] text-ink">
              คุณต้องการลบ <b>&quot;{name}&quot;</b> ({kind === 'venue' ? 'สถานที่' : 'อุปกรณ์ / ครุภัณฑ์'}) ออกจากระบบใช่หรือไม่?
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="jw-btn-sec flex-1"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="jw-btn-red flex-1"
              >
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function EditResourcePage() {
  return (
    <Suspense
      fallback={
        <AppShell title="แก้ไขรายการ" backHref="/admin/resources" rightLabel="แอดมิน">
          <div className="jw-card p-12 text-center text-ink-mute">กำลังโหลด...</div>
        </AppShell>
      }
    >
      <EditResourceContent />
    </Suspense>
  );
}

