'use client';

/**
 * =====================================================================
 * หน้าจัดการทรัพยากรและแบบฟอร์มราชการ (Staff Resources & Forms Management)
 * =====================================================================
 * รวมศูนย์บริหารจัดการ 4 แท็บหลัก:
 * 1. สถานที่ (Venues): รายชื่อ, ความจุ, เปิด/ปิดรับจองทันทีด้วย Toggle Switch
 * 2. ครุภัณฑ์/อุปกรณ์ (Equipment): สต็อกคงเหลือ, เปิด/ปิดให้ยืม
 * 3. ยานพาหนะ (Vehicles): ระบบบริหารการขอใช้รถส่วนกลาง
 * 4. แบบฟอร์มราชการ (Forms):
 *    - แสดงตัวอย่างเอกสารราชการจริง (OfficialGovFormDocument)
 *    - ปรับแต่งหัวกระดาษ ข้อความ และช่องลงนามแบบ WYSIWYG (OfficialDocumentEditor)
 */

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { OfficialDocumentEditor } from '@/components/official-document-editor';
import { api } from '@/lib/api';
import {
  FormTemplateItem,
  deleteCustomFormTemplate,
  getFormTemplates,
  getFormTemplate,
  saveNewFormTemplate,
  saveTemplateToDatabase,
  fetchFormTemplatesFromApi,
} from '@/lib/forms-store';

// ชนิดแท็บหมวดหมู่ทรัพยากร
type ResourceTab = 'venues' | 'equipment' | 'vehicles' | 'forms';

function ManageResourcesContent() {
  const { account } = useAuth();
  // รับค่า query parameter เช่น ?tab=forms
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as ResourceTab) || 'venues';

  // State แท็บที่เลือก
  const [tab, setTab] = useState<ResourceTab>(initialTab);
  // State รายการสถานที่
  const [venues, setVenues] = useState<Venue[]>([]);
  // State รายการอุปกรณ์
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // State การจัดการแบบฟอร์มราชการ
  const [formsList, setFormsList] = useState<FormTemplateItem[]>([]);
  const [selectedFormKey, setSelectedFormKey] = useState<string>('venue');
  const [formPreviewMode, setFormPreviewMode] = useState<'sample' | 'blank'>('sample');
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [isCreatingNewForm, setIsCreatingNewForm] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // โหลดรายการแม่แบบฟอร์มทั้งจากแคชและ API
  const loadForms = useCallback(() => {
    setFormsList(getFormTemplates());
    fetchFormTemplatesFromApi().then((list) => {
      setFormsList(list);
    });
  }, []);

  // โหลดข้อมูลสถานที่ อุปกรณ์ และแบบฟอร์ม
  const load = useCallback(() => {
    api.venues().then(setVenues).catch(() => {});
    api.equipment().then(setEquipment).catch(() => {});
    loadForms();
  }, [loadForms]);

  useEffect(() => {
    load();
  }, [load]);

  // ฟังก์ชันสลับสถานะเปิด/ปิดการจองสถานที่
  const toggleVenue = async (v: Venue, enabled: boolean) => {
    await api.updateVenue(v.id, { enabled });
    load();
  };

  // ฟังก์ชันสลับสถานะเปิด/ปิดการยืมอุปกรณ์
  const toggleEquipment = async (e: Equipment, enabled: boolean) => {
    await api.updateEquipment(e.id, { enabled });
    load();
  };

  // ฟังก์ชันลบแบบฟอร์มที่สร้างขึ้นเอง
  const handleDeleteForm = (id: string, title: string) => {
    if (window.confirm(`คุณต้องการลบแบบฟอร์ม "${title}" ออกจากระบบใช่หรือไม่?`)) {
      deleteCustomFormTemplate(id);
      loadForms();
      if (selectedFormKey === id) {
        setSelectedFormKey('venue');
      }
    }
  };

  // ค้นหาแบบฟอร์มที่กำลังเลือกดูตัวอย่าง
  const currentSelectedForm = formsList.find((f) => f.id === selectedFormKey) || formsList[0];

  return (
    <AppShell
      title="ทรัพยากรและแบบฟอร์ม"
      backHref={roleHomePath(account?.role)}
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth="max-w-[960px]"
      footer={
        tab === 'forms' ? (
          <button
            type="button"
            onClick={() => {
              setIsCreatingNewForm(true);
              setShowDocEditor(true);
            }}
            className="jw-btn w-full sm:w-56 shadow-sm"
          >
            + เพิ่มแบบฟอร์มใหม่
          </button>
        ) : (
          <Link href="/staff/resources/new" className="jw-btn w-full sm:w-56">
            + เพิ่มรายการ
          </Link>
        )
      }
    >
      <div className="flex flex-col gap-3.5">
        {/* แถบแท็บสลับหมวดหมู่ทรัพยากร */}
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

        {/* แท็บที่ 1: สถานที่ */}
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
                  className={`p-4 rounded-2xl border bg-white flex flex-col gap-2.5 ${
                    i === 0 ? 'border-ink bg-brand-mint/40' : 'border-line'
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/staff/resources/edit?id=${v.id}&kind=venue`}
                        className="px-3 py-1.5 rounded-xl border border-line text-[12px] font-semibold text-ink hover:bg-soft transition"
                      >
                        แก้ไข
                      </Link>
                      <Toggle checked={v.enabled} onChange={(val) => toggleVenue(v, val)} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* แท็บที่ 2: อุปกรณ์ */}
        {tab === 'equipment' && (
          <div className="flex flex-col gap-2.5">
            {equipment.length === 0 ? (
              <div className="jw-card p-6 text-center text-[14px] text-ink-mute">
                ยังไม่มีรายการอุปกรณ์ สามารถกด <b>+ เพิ่มรายการ</b> ด้านล่างเพื่อเพิ่มอุปกรณ์ใหม่
              </div>
            ) : (
              equipment.map((e) => (
                <div
                  key={e.id}
                  className="p-4 rounded-2xl border border-line bg-white flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {e.images?.[0] && (
                      <button
                        type="button"
                        onClick={() => setPreviewImg(e.images![0])}
                        className="w-12 h-12 rounded-xl overflow-hidden border border-line shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={e.images[0]} alt={e.name} className="w-full h-full object-cover" />
                      </button>
                    )}
                    <div className="min-w-0">
                      <b className="text-[15px] text-ink block truncate">{e.name}</b>
                      <span className="text-[13px] text-ink-mute block">
                        หมวด: {EQUIPMENT_CATEGORY_LABEL[e.category]} · คงเหลือ {e.stock} ชิ้น
                        {!e.enabled ? ' · ปิดให้ยืมชั่วคราว' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/staff/resources/edit?id=${e.id}&kind=equipment`}
                      className="px-3 py-1.5 rounded-xl border border-line text-[12px] font-semibold text-ink hover:bg-soft transition"
                    >
                      แก้ไข
                    </Link>
                    <Toggle checked={e.enabled} onChange={(val) => toggleEquipment(e, val)} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* แท็บที่ 3: ยานพาหนะ */}
        {tab === 'vehicles' && (
          <div className="jw-card p-8 text-center flex flex-col items-center gap-3">
            <span className="text-3xl">🚐</span>
            <b className="text-[16px] text-ink">ระบบจองยานพาหนะส่วนกลาง</b>
            <p className="text-[13px] text-ink-mute max-w-md">
              สามารถเปิดใช้งานแบบฟอร์มขอใช้ยานพาหนะและกำหนดสายอนุมัติสำหรับรถตู้ รถกระบะ และรถบรรทุกน้ำของทางราชการได้
            </p>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNewForm(true);
                setShowDocEditor(true);
              }}
              className="mt-2 jw-btn px-4 py-2 text-xs"
            >
              + สร้างแบบฟอร์มขอใช้ยานพาหนะ
            </button>
          </div>
        )}

        {/* แท็บที่ 4: แบบฟอร์มราชการ */}
        {tab === 'forms' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1">
              <div>
                <b className="text-[16px] text-ink block">รายการแบบฟอร์มในระบบ ({formsList.length})</b>
                <span className="text-[12px] text-ink-mute">
                  สามารถเลือกดูตัวอย่าง หรือกดเพิ่มแบบฟอร์มราชการใหม่ได้
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewForm(true);
                  setShowDocEditor(true);
                }}
                className="px-3.5 py-1.5 rounded-xl border border-brand bg-brand-mint text-brand text-[12.5px] font-semibold hover:bg-brand hover:text-white transition flex items-center gap-1.5 shadow-xs"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>+ เพิ่มแบบฟอร์มใหม่</span>
              </button>
            </div>

            {/* รายชื่อแบบฟอร์มทั้งหมด */}
            <div className="flex flex-col gap-2.5">
              {formsList.map((f) => {
                const active = selectedFormKey === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFormKey(f.id)}
                    className={`p-4 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                      active
                        ? 'border-brand ring-2 ring-brand bg-brand-mint/40'
                        : 'border-line bg-white hover:bg-soft/40'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <b className="text-[15px] text-ink truncate">{f.title}</b>
                        {f.isCustom && (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-brand text-white shrink-0">
                            สร้างขึ้นใหม่
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] text-ink-mute block truncate">{f.sub}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px] font-semibold text-brand">
                        {active ? 'กำลังแสดงตัวอย่าง' : 'แตะเพื่อดู'}
                      </span>
                      {f.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteForm(f.id, f.title);
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center transition"
                          title="ลบแบบฟอร์มนี้"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* แสดงตัวอย่างหน้ากระดาษราชการและการเปิดโปรแกรมแก้ไข WYSIWYG */}
            {selectedFormKey !== 'repair' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <b className="text-[15px] text-ink">
                      ตัวอย่างหน้ากระดาษราชการ ({currentSelectedForm?.title || 'แบบฟอร์มราชการ'})
                    </b>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowDocEditor(true)}
                      className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-brand text-white hover:bg-brand/90 transition flex items-center gap-1.5 shadow-sm"
                      title="เปิดตัวแก้ไขแบบฟอร์มเชิงโต้ตอบ (WYSIWYG Interactive Editor)"
                    >
                      <Icon name="edit" className="w-3.5 h-3.5" />
                      <span>ปรับแต่ง / แก้ไขแบบฟอร์มนี้</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormPreviewMode('sample')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${
                        formPreviewMode === 'sample'
                          ? 'bg-ink text-white'
                          : 'bg-soft text-ink hover:bg-ink hover:text-white'
                      }`}
                    >
                      -ตัวอย่าง-
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormPreviewMode('blank')}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${
                        formPreviewMode === 'blank'
                          ? 'bg-ink text-white'
                          : 'bg-soft text-ink hover:bg-ink hover:text-white'
                      }`}
                    >
                      แบบฟอร์มเปล่า
                    </button>
                  </div>
                </div>

                <OfficialGovFormDocument
                  blankMode={formPreviewMode === 'blank'}
                  sampleDocMode={formPreviewMode === 'sample'}
                  customFields={{
                    formTitle: currentSelectedForm?.config?.formTitle || currentSelectedForm?.title || 'แบบขอใช้สถานที่ราชการ',
                    subject: currentSelectedForm?.config?.subjectText || currentSelectedForm?.sub?.replace(/^เรื่อง\s*/, '') || 'ขออนุญาตใช้สถานที่ราชการ',
                    toWhom: currentSelectedForm?.config?.recipientText || 'ผู้มีอำนาจอนุมัติ',
                    writtenAt: currentSelectedForm?.config?.writtenAtSlot?.label,
                    desireLabel: currentSelectedForm?.title?.includes('ครุภัณฑ์')
                      ? 'มีความประสงค์ขอยืมครุภัณฑ์ราชการ ดังนี้'
                      : 'มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้',
                    requesterRoleCaption: currentSelectedForm?.title?.includes('ครุภัณฑ์')
                      ? 'ผู้ขออนุญาตยืมครุภัณฑ์ราชการ'
                      : 'ผู้ขออนุญาตใช้สถานที่ราชการ',
                    logoUrl: currentSelectedForm?.config?.logoUrl,
                    customSlots: currentSelectedForm?.config?.customSlots,
                    closingText: currentSelectedForm?.config?.closingText,
                    slotsConfig: currentSelectedForm?.config,
                  }}
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[13px] text-ink-mute">
          แตะรายการเพื่อแก้ไข · สวิตช์ใช้เปิด/ปิดให้จองทันที
        </p>
      </div>

      {/* Modal ดูภาพขยาย */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* Modal ตัวจัดการและแก้ไขแบบฟอร์มกระดาษราชการ WYSIWYG */}
      {showDocEditor && (
        <OfficialDocumentEditor
          isModal={true}
          initialFormTitle={
            isCreatingNewForm
              ? 'แบบขอใช้สถานที่ราชการ (แบบใหม่)'
              : currentSelectedForm?.title || 'แบบขอใช้สถานที่ราชการ'
          }
          initialConfig={currentSelectedForm?.config || getFormTemplate(currentSelectedForm?.title || '')?.config}
          isBorrowMode={currentSelectedForm?.title?.includes('ครุภัณฑ์') || currentSelectedForm?.title?.includes('อุปกรณ์')}
          onClose={() => {
            setShowDocEditor(false);
            setIsCreatingNewForm(false);
          }}
          onSave={async ({ formTitle, config }) => {
            const trimmed = formTitle.trim();
            if (config) {
              await saveTemplateToDatabase(
                trimmed,
                config,
                currentSelectedForm?.title?.includes('ครุภัณฑ์') ? 'equipment' : 'venue'
              );
            } else if (isCreatingNewForm && trimmed) {
              saveNewFormTemplate(trimmed);
            }
            const updated = await fetchFormTemplatesFromApi();
            setFormsList(updated);
            const found = updated.find((f) => f.title === trimmed || f.id === trimmed);
            if (found) setSelectedFormKey(found.id);
            setShowDocEditor(false);
            setIsCreatingNewForm(false);
          }}
        />
      )}
    </AppShell>
  );
}

export default function ManageResourcesPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="ทรัพยากรและแบบฟอร์ม" rightLabel="เจ้าหน้าที่">
          <div className="jw-card p-12 text-center text-ink-mute">กำลังโหลด...</div>
        </AppShell>
      }
    >
      <ManageResourcesContent />
    </Suspense>
  );
}
