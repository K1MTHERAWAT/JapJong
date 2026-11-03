'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EquipmentCategory, FACILITIES, VENUE_TYPE_LABEL, VenueType } from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, Stepper, Tabs, Toggle } from '@/components/ui';
import { api } from '@/lib/api';

type Kind = 'venue' | 'equipment';
const DAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function AddResourcePage() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('venue');
  const [mobileStep, setMobileStep] = useState(1);

  // Venue fields (Step 1/2 ข้อมูลทั่วไป + Step 2/2 เงื่อนไขและการอนุมัติ)
  const [photos, setPhotos] = useState(2);
  const [name, setName] = useState('ห้องประชุมใหญ่ อบต.');
  const [venueType, setVenueType] = useState<VenueType>('meeting');
  const [building, setBuilding] = useState('อาคารสำนักงาน');
  const [floor, setFloor] = useState('ชั้น 2');
  const [capacity, setCapacity] = useState(120);
  const [facilities, setFacilities] = useState<string[]>([
    'เครื่องเสียง',
    'โปรเจกเตอร์',
    'เครื่องปรับอากาศ',
  ]);
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('17:00');
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [advanceDays, setAdvanceDays] = useState(7);
  const [formName, setFormName] = useState('แบบคำขอใช้สถานที่');
  const [enabled, setEnabled] = useState(true);
  const [approvalOrder, setApprovalOrder] = useState<string[]>([
    'เจ้าหน้าที่ตรวจสอบ',
    'ผู้อนุมัติระดับ 2 (ปลัด อบต.)',
    'ผู้อนุมัติระดับ 1 (นายก อบต.)',
  ]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const moveApprovalStep = (from: number, to: number) => {
    if (to < 0 || to >= approvalOrder.length || from === to) return;
    setApprovalOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Equipment fields
  const [eqCategory, setEqCategory] = useState<EquipmentCategory>('audio');
  const [stock, setStock] = useState(5);

  const [submitting, setSubmitting] = useState(false);

  const toggleFacility = (f: string) => {
    setFacilities((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const toggleDay = (d: number) => {
    setOpenDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (kind === 'venue') {
        await api.createVenue({
          name,
          type: venueType,
          building,
          floor,
          capacity,
          facilities,
          openTime,
          closeTime,
          openDays,
          advanceDays,
          formName,
          enabled,
        });
      } else {
        await api.createEquipment({
          name,
          category: eqCategory,
          stock,
          enabled,
        });
      }
      router.push('/admin/resources');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="เพิ่มรายการ"
      backHref="/admin/resources"
      rightLabel="แอดมิน"
      footer={
        <div className="flex w-full sm:w-auto gap-2.5">
          {/* บนมือถือแสดงปุ่มสลับขั้นตอน 1/2 และ 2/2 */}
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
              บันทึกรายการ
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
      {/* Header + Tabs สถานที่ / อุปกรณ์ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-ink">เพิ่มรายการ</h1>
          <p className="text-[13px] text-ink-mute">สถานที่หรืออุปกรณ์ครุภัณฑ์ใหม่ที่เปิดให้จอง</p>
        </div>
        <Tabs<Kind>
          value={kind}
          onChange={setKind}
          className="w-full sm:w-80"
          options={[
            { value: 'venue', label: 'สถานที่' },
            { value: 'equipment', label: 'อุปกรณ์ / ครุภัณฑ์' },
          ]}
        />
      </div>

      {/* Stepper บนมือถือ (1/2 ข้อมูลทั่วไป · 2/2 เงื่อนไขและอนุมัติ) */}
      <div className="lg:hidden mb-4">
        <Stepper
          steps={['ข้อมูลทั่วไป', 'เงื่อนไขและอนุมัติ']}
          current={mobileStep}
          onSelect={setMobileStep}
        />
      </div>

      {/* บน Desktop แสดง 2 คอลัมน์เคียงกันเหมือนหน้า "เพิ่มรายการ (แอดมิน) · Desktop 1440×900" */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* คอลัมน์ที่ 1: ข้อมูลทั่วไป */}
        <div
          className={`jw-card p-5 sm:p-6 flex flex-col gap-4 ${
            mobileStep === 2 ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div>
            <label className="jw-lbl">รูปภาพ (ไม่เกิน 3 รูป)</label>
            <div className="flex gap-3">
              {Array.from({ length: photos }).map((_, idx) => (
                <div
                  key={idx}
                  className="w-20 h-20 rounded-2xl bg-brand-mint text-brand flex items-center justify-center relative"
                >
                  <Icon name="photo" className="w-7 h-7" strokeWidth={1.6} />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => Math.max(0, p - 1))}
                    className="w-5 h-5 rounded-full bg-ink text-white absolute -top-1.5 -right-1.5 flex items-center justify-center"
                  >
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photos < 3 && (
                <button
                  type="button"
                  onClick={() => setPhotos((p) => Math.min(3, p + 1))}
                  className="w-20 h-20 rounded-2xl bg-white border-[1.5px] border-dashed border-[#7A7A7A] text-ink-mute text-[12px] flex flex-col items-center justify-center gap-1 hover:border-brand"
                >
                  <Icon name="upload" className="w-5 h-5" />
                  <span>เพิ่มรูป</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="jw-lbl">{kind === 'venue' ? 'ชื่อสถานที่' : 'ชื่ออุปกรณ์ / ครุภัณฑ์'}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="jw-in" />
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
                    className="jw-in"
                  />
                </div>
                <div>
                  <label className="jw-lbl">ชั้น</label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
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
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value))}
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
            <label className="jw-lbl">แบบฟอร์มที่ใช้</label>
            <select value={formName} onChange={(e) => setFormName(e.target.value)} className="jw-in">
              <option>แบบคำขอใช้สถานที่</option>
              <option>แบบคำขอยืมครุภัณฑ์</option>
            </select>
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
    </AppShell>
  );
}
