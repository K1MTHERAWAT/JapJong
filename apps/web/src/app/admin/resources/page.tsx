'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  EQUIPMENT_CATEGORY_LABEL,
  Equipment,
  VENUE_TYPE_LABEL,
  Venue,
} from '@japjong/shared';
import { roleHomePath, useAuth } from '@/components/auth-context';
import { Icon } from '@/components/icons';
import { AppShell } from '@/components/shell';
import { OfficialGovFormDocument, Tabs, Toggle } from '@/components/ui';
import { api } from '@/lib/api';

type ResourceTab = 'venues' | 'equipment' | 'vehicles' | 'forms';

export default function ManageResourcesPage() {
  const { account } = useAuth();
  const [tab, setTab] = useState<ResourceTab>('venues');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedForm, setSelectedForm] = useState<'venue' | 'borrow' | 'repair'>('venue');
  const [formPreviewMode, setFormPreviewMode] = useState<'sample' | 'blank'>('sample');
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const load = useCallback(() => {
    api.venues().then(setVenues).catch(() => { });
    api.equipment().then(setEquipment).catch(() => { });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVenue = async (v: Venue, enabled: boolean) => {
    await api.updateVenue(v.id, { enabled });
    load();
  };

  const toggleEquipment = async (e: Equipment, enabled: boolean) => {
    await api.updateEquipment(e.id, { enabled });
    load();
  };

  return (
    <AppShell
      title="ทรัพยากรและแบบฟอร์ม"
      backHref={roleHomePath(account?.role)}
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth="max-w-[960px]"
      footer={
        <Link href="/admin/resources/new" className="jw-btn w-full sm:w-56">
          + เพิ่มรายการ
        </Link>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Tabs<ResourceTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'venues', label: 'สถานที่' },
            { value: 'equipment', label: 'อุปกรณ์' },
            { value: 'vehicles', label: 'ยานพาหนะ' },
            { value: 'forms', label: 'แบบฟอร์ม' },
          ]}
        />

        {tab === 'venues' && (
          <div className="flex flex-col gap-2.5">
            {venues.length === 0 ? (
              <div className="jw-card p-6 text-center text-[14px] text-ink-mute">
                ยังไม่มีรายการสถานที่ สามารถกด <b>+ เพิ่มรายการ</b> ด้านล่างเพื่อเพิ่มสถานที่ใหม่
              </div>
            ) : (
              venues.map((v, i) => (
                <div
                  key={v.id}
                  className={`p-4 rounded-2xl border bg-white flex flex-col gap-2.5 ${i === 0 ? 'border-ink bg-brand-mint/40' : 'border-line'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {v.images?.[0] && (
                        <button
                          type="button"
                          onClick={() => setPreviewImg(v.images![0])}
                          className="w-12 h-12 rounded-xl overflow-hidden border border-line shrink-0"
                        >
                          <img src={v.images[0]} alt={v.name} className="w-full h-full object-cover" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <b className="text-[15px] text-ink block truncate">{v.name}</b>
                        <span className="text-[13px] text-ink-mute block">
                          {VENUE_TYPE_LABEL[v.type]} · {v.capacity} คน · ล่วงหน้า {v.advanceDays} วัน
                          {!v.enabled ? ' · ปิดชั่วคราว' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <Link
                        href={`/admin/resources/edit?id=${v.id}&kind=venue`}
                        className="h-8 px-2.5 rounded-full border border-line bg-white hover:border-brand hover:text-brand text-ink text-[12px] font-semibold inline-flex items-center gap-1 transition"
                        title="แก้ไขสถานที่"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                        <span>แก้ไข</span>
                      </Link>
                      <Toggle checked={v.enabled} onChange={(next) => toggleVenue(v, next)} />
                    </div>
                  </div>
                  {v.images && v.images.length > 1 && (
                    <div className="flex gap-2">
                      {v.images.map((src, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewImg(src)}
                          className="w-14 h-14 rounded-xl overflow-hidden border border-line hover:ring-2 hover:ring-brand transition"
                        >
                          <img src={src} alt={`${v.name} ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'equipment' && (
          <div className="flex flex-col gap-2.5">
            {equipment.length === 0 ? (
              <div className="jw-card p-6 text-center text-[14px] text-ink-mute">
                ยังไม่มีรายการอุปกรณ์ / ครุภัณฑ์ สามารถกด <b>+ เพิ่มรายการ</b> ด้านล่างเพื่อเพิ่มอุปกรณ์ใหม่
              </div>
            ) : (
              equipment.map((e) => (
                <div key={e.id} className="p-4 rounded-2xl border border-line bg-white flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {e.images?.[0] && (
                        <button
                          type="button"
                          onClick={() => setPreviewImg(e.images![0])}
                          className="w-12 h-12 rounded-xl overflow-hidden border border-line shrink-0"
                        >
                          <img src={e.images[0]} alt={e.name} className="w-full h-full object-cover" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <b className="text-[15px] text-ink block truncate">{e.name}</b>
                        <span className="text-[13px] text-ink-mute block">
                          {EQUIPMENT_CATEGORY_LABEL[e.category]} · คงเหลือ {e.stock} รายการ
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <Link
                        href={`/admin/resources/edit?id=${e.id}&kind=equipment`}
                        className="h-8 px-2.5 rounded-full border border-line bg-white hover:border-brand hover:text-brand text-ink text-[12px] font-semibold inline-flex items-center gap-1 transition"
                        title="แก้ไขอุปกรณ์"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                        <span>แก้ไข</span>
                      </Link>
                      <Toggle checked={e.enabled} onChange={(next) => toggleEquipment(e, next)} />
                    </div>
                  </div>
                  {e.images && e.images.length > 1 && (
                    <div className="flex gap-2">
                      {e.images.map((src, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewImg(src)}
                          className="w-14 h-14 rounded-xl overflow-hidden border border-line hover:ring-2 hover:ring-brand transition"
                        >
                          <img src={src} alt={`${e.name} ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'vehicles' && (
          <div className="jw-card p-6 text-center text-[14px] text-ink-mute">
            ยังไม่มีรายการยานพาหนะ สามารถกด <b>+ เพิ่มรายการ</b> ด้านล่างเพื่อเพิ่มทรัพยากรใหม่
          </div>
        )}

        {tab === 'forms' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              {(
                [
                  {
                    key: 'venue',
                    title: 'แบบขอใช้สถานที่ราชการ',
                    sub: 'เรื่อง ขออนุญาตใช้สถานที่ราชการ · อนุมัติ 3 ระดับ',
                  },
                  {
                    key: 'borrow',
                    title: 'แบบคำขอใช้อุปกรณ์ราชการ',
                    sub: 'เรื่อง ขออนุญาตใช้อุปกรณ์ของทางราชการ · อนุมัติ 3 ระดับ · สร้าง PDF อัตโนมัติ',
                  },
                  {
                    key: 'repair',
                    title: 'แบบแจ้งปัญหา / ซ่อมบำรุงสาธารณูปโภค',
                    sub: 'แจ้งปัญหาพร้อมรูปประกอบ · เส้นเวลาติดตาม 4 ขั้นตอน',
                  },
                ] as const
              ).map((f) => {
                const active = selectedForm === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setSelectedForm(f.key)}
                    className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${active
                        ? 'border-brand ring-2 ring-brand bg-brand-mint/40'
                        : 'border-line bg-white hover:bg-soft/40'
                      }`}
                  >
                    <div>
                      <b className="block text-[15px] text-ink">{f.title}</b>
                      <span className="text-[12px] text-ink-mute">{f.sub}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-brand shrink-0">
                      {active ? 'กำลังแสดงตัวอย่าง' : 'แตะเพื่อดูแบบฟอร์ม'}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedForm !== 'repair' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-[15px] text-ink">
                    ตัวอย่างหน้ากระดาษราชการ (
                    {selectedForm === 'venue' ? 'แบบขอใช้สถานที่ราชการ.doc' : 'แบบคำขอยืมครุภัณฑ์ราชการ'})
                  </b>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormPreviewMode('sample')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${formPreviewMode === 'sample'
                          ? 'bg-brand text-white'
                          : 'bg-brand-mint text-brand hover:bg-brand hover:text-white'
                        }`}
                    >
                      -ตัวอย่าง- (นายสุข แสนสบาย)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormPreviewMode('blank')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${formPreviewMode === 'blank'
                          ? 'bg-brand text-white'
                          : 'bg-brand-mint text-brand hover:bg-brand hover:text-white'
                        }`}
                    >
                      แบบฟอร์มเปล่า
                    </button>
                  </div>
                </div>

                <OfficialGovFormDocument
                  blankMode={formPreviewMode === 'blank'}
                  sampleDocMode={formPreviewMode === 'sample'}
                  customFields={
                    selectedForm === 'borrow'
                      ? {
                        formTitle: 'แบบคำขอยืมครุภัณฑ์ราชการ',
                        subject: 'ขออนุญาตยืมครุภัณฑ์ของทางราชการ',
                        desireLabel: 'มีความประสงค์ขอยืมครุภัณฑ์ราชการ ดังนี้',
                        requesterRoleCaption: 'ผู้ขออนุญาตยืมครุภัณฑ์ราชการ',
                        purposeItems:
                          formPreviewMode === 'blank'
                            ? [
                              { item: '', forWhat: '' },
                              { item: '', forWhat: '' },
                              { item: '', forWhat: '' },
                            ]
                            : [
                              { item: 'เต็นท์ทรงโค้งขาว 4 หลัง', forWhat: 'จัดงานบุญประจำปีหมู่บ้าน' },
                              { item: 'ชุดเครื่องเสียงเคลื่อนที่ 1 ชุด', forWhat: 'ใช้ประชาสัมพันธ์ภายในงาน' },
                              { item: 'เก้าอี้พลาสติก 100 ตัว', forWhat: 'รองรับผู้เข้าร่วมกิจกรรม' },
                            ],
                      }
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[13px] text-ink-mute">
          แตะรายการเพื่อแก้ไข · สวิตช์ใช้เปิด/ปิดให้จองทันที
        </p>
      </div>

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
