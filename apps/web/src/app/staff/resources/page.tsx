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
 *    - จัดการแม่แบบเอกสารราชการแบบอิสระบนกระดาษ A4 (FreeformA4Editor)
 *    - อัปโหลดกระดาษ A4, อัปโหลดโลโก้, ลากวางและปรับขนาดฟิลด์/ขนาดตัวอักษรได้อิสระ
 */

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, FileText, Package } from 'lucide-react';
import {
  DocumentTemplateItem,
  EQUIPMENT_CATEGORY_LABEL,
  Equipment,
  VENUE_TYPE_LABEL,
  Venue,
} from '@japjong/shared';
import { roleHomePath, useAuth } from '@/components/auth-context';
import { Icon } from '@/components/icons';
import { AppShell } from '@/components/shell';
import { OfficialGovFormDocument, Toggle } from '@/components/ui';
import {
  A4BackgroundLayer,
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  FreeformTemplateEditorModal,
} from '@/components/freeform-a4-editor';
import { api } from '@/lib/api';
import { getSampleBindingValue } from '@/lib/document-bindings';

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

  // State การจัดการแบบฟอร์มราชการ (Freeform A4)
  const [formsList, setFormsList] = useState<DocumentTemplateItem[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplateItem | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // โหลดรายการแม่แบบฟอร์มจาก API
  const loadForms = useCallback(() => {
    api
      .listDocumentTemplates()
      .then((list) => {
        setFormsList(list);
        setSelectedFormId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0]?.id || ''));
      })
      .catch(() => {});
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

  // สร้างแบบฟอร์มกระดาษ A4 อิสระใหม่
  const handleCreateNewForm = async () => {
    const name = window.prompt('ตั้งชื่อแบบฟอร์มเอกสารใหม่:', 'แบบขอใช้สถานที่ราชการ (แบบใหม่)');
    if (!name || !name.trim()) return;
    try {
      const created = await api.createDocumentTemplate({
        name: name.trim(),
        category: 'venue',
        description: 'แม่แบบกระดาษ A4 แบบอิสระ',
        structure: {
          editorMode: 'freeform',
          freeformElements: [],
          title: name.trim(),
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
      await loadForms();
      setSelectedFormId(created.id);
      setEditingTemplate(created);
    } catch (err) {
      alert((err as Error).message || 'สร้างแบบฟอร์มไม่สำเร็จ');
    }
  };

  // ฟังก์ชันลบแบบฟอร์ม
  const handleDeleteForm = async (id: string, title: string) => {
    if (!window.confirm(`คุณต้องการลบแบบฟอร์ม "${title}" ออกจากระบบใช่หรือไม่?`)) return;
    try {
      await api.deleteDocumentTemplate(id);
      loadForms();
    } catch (err) {
      alert((err as Error).message || 'ลบแบบฟอร์มไม่สำเร็จ');
    }
  };

  // ค้นหาแบบฟอร์มที่กำลังเลือกดูตัวอย่าง
  const currentSelectedForm = formsList.find((f) => f.id === selectedFormId) || formsList[0];

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
            onClick={handleCreateNewForm}
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
        {/* แถบแท็บสลับหมวดหมู่ทรัพยากร (Soft Tint Icon Cards - แนวนอนทุกขนาดจอ) */}
        <div
          role="tablist"
          aria-label="หมวดหมู่ทรัพยากรและแบบฟอร์ม"
          className="grid grid-cols-3 gap-1.5 sm:gap-2.5"
        >
          {(
            [
              {
                value: 'venues' as const,
                label: 'สถานที่',
                desc: `ห้องประชุม สนาม · ${venues.length} รายการ`,
                Icon: Building2,
              },
              {
                value: 'equipment' as const,
                label: 'อุปกรณ์',
                desc: `ครุภัณฑ์และสต็อก · ${equipment.length} รายการ`,
                Icon: Package,
              },
              {
                value: 'forms' as const,
                label: 'แบบฟอร์ม',
                desc: `แม่แบบเอกสาร A4 · ${formsList.length} แบบฟอร์ม`,
                Icon: FileText,
              },
            ]
          ).map(({ value, label, desc, Icon: TabIcon }) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={`flex flex-col sm:flex-row items-center text-center sm:text-left gap-1.5 sm:gap-3 p-2 sm:p-3.5 rounded-card transition cursor-pointer min-w-0 ${
                  active
                    ? 'border-2 border-brand bg-brand-tint/60 shadow-xs'
                    : 'border border-line bg-surface hover:border-brand/40 hover:bg-hover/50'
                }`}
              >
                <div
                  className={`size-8 sm:size-10 rounded-control flex items-center justify-center shrink-0 transition ${
                    active
                      ? 'bg-brand text-white'
                      : 'bg-surface-muted border border-line text-ink-mute'
                  }`}
                >
                  <TabIcon className="size-4 sm:size-5" />
                </div>
                <div className="min-w-0 w-full sm:flex-1">
                  <div
                    className={`text-[11.5px] sm:text-[13.5px] font-bold leading-tight truncate ${
                      active ? 'text-brand-ink' : 'text-ink'
                    }`}
                  >
                    {label}
                  </div>
                  <div className="hidden sm:block text-[12px] text-ink-mute truncate mt-0.5">
                    {desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

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
                      <div className="min-w-0 flex-1">
                        <b className="text-[15px] text-ink block break-words leading-snug">{v.name}</b>
                        <span className="text-[13px] text-ink-mute block break-words">
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
                  className="p-4 rounded-2xl border border-line bg-white flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
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
                    <div className="min-w-0 flex-1">
                      <b className="text-[15px] text-ink block break-words leading-snug">{e.name}</b>
                      <span className="text-[13px] text-ink-mute block break-words">
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
              onClick={handleCreateNewForm}
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
                onClick={handleCreateNewForm}
                className="px-3.5 py-1.5 rounded-xl border border-brand bg-brand-mint text-brand text-[12.5px] font-semibold hover:bg-brand hover:text-white transition flex items-center gap-1.5 shadow-xs"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>+ เพิ่มแบบฟอร์มใหม่</span>
              </button>
            </div>

            {/* รายชื่อแบบฟอร์มทั้งหมด */}
            {formsList.length === 0 ? (
              <div className="jw-card p-8 text-center text-ink-mute space-y-2">
                <p className="text-[14px] font-semibold text-ink">ยังไม่มีแม่แบบเอกสาร</p>
                <p className="text-[12px]">กดปุ่ม &quot;+ เพิ่มแบบฟอร์มใหม่&quot; เพื่ออัปโหลดกระดาษ A4 และออกแบบฟอร์ม</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {formsList.map((f) => {
                  const active = currentSelectedForm?.id === f.id;
                  const isSystemDefault = f.id === 'tpl-venue' || f.id === 'tpl-equipment';
                  const isFreeform = f.structure?.editorMode === 'freeform';
                  return (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFormId(f.id)}
                      className={`p-4 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                        active
                          ? 'border-brand ring-2 ring-brand bg-brand-mint/40'
                          : 'border-line bg-white hover:bg-soft/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-[15px] text-ink break-words leading-snug">{f.name}</b>
                          {isSystemDefault && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                              ค่าเริ่มต้น
                            </span>
                          )}
                          {isFreeform && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-indigo-100 text-indigo-800 shrink-0">
                              Freeform A4
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-700 shrink-0">
                            v{f.currentVersion}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-700 shrink-0">
                            {f.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                          </span>
                        </div>
                        <span className="text-[12px] text-ink-mute block break-words">
                          {f.description || 'แม่แบบเอกสารกระดาษ A4'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isFreeform ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTemplate(f);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand/90 transition"
                          >
                            แก้ไข
                          </button>
                        ) : (
                          <span className="text-[12px] font-semibold text-brand">
                            {active ? 'กำลังแสดงตัวอย่าง' : 'แตะเพื่อดู'}
                          </span>
                        )}
                        {!isSystemDefault && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteForm(f.id, f.name);
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
            )}

            {/* แสดงตัวอย่างหน้ากระดาษ A4 */}
            {currentSelectedForm && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-[15px] text-ink">
                    ตัวอย่างหน้ากระดาษ ({currentSelectedForm.name})
                  </b>
                  {currentSelectedForm.structure?.editorMode === 'freeform' && (
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/document-templates/${currentSelectedForm.id}/preview`}
                        className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-soft text-ink hover:bg-ink hover:text-white transition"
                      >
                        พิมพ์ / PDF
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditingTemplate(currentSelectedForm)}
                        className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-brand text-white hover:bg-brand/90 transition flex items-center gap-1.5 shadow-sm"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                        <span>เปิดตัวแก้ไขกระดาษ A4</span>
                      </button>
                    </div>
                  )}
                </div>

                {currentSelectedForm.structure?.editorMode === 'freeform' ? (
                  <div className="overflow-auto bg-slate-100 p-4 rounded-2xl border border-line flex justify-center">
                  <div
                    className="relative bg-white shadow-md border border-slate-300 overflow-hidden shrink-0"
                    style={{
                      width: A4_WIDTH_PX,
                      height: A4_HEIGHT_PX,
                      fontFamily: "'TH Sarabun New', 'Sarabun', sans-serif",
                    }}
                  >
                    <A4BackgroundLayer
                      url={currentSelectedForm.structure?.backgroundImageUrl}
                      opacity={currentSelectedForm.structure?.backgroundOpacity ?? 1}
                    />
                    {(currentSelectedForm.structure?.freeformElements || []).map((el) => (
                      <div
                        key={el.id}
                        style={{
                          position: 'absolute',
                          left: el.x,
                          top: el.y,
                          width: el.width,
                          height: el.height,
                          fontSize: `${el.fontSize ?? 16}px`,
                          fontWeight: el.fontWeight || 'normal',
                          textAlign: el.textAlign || 'left',
                          color: el.color || '#0f172a',
                          lineHeight: 1.35,
                        }}
                      >
                        {el.type === 'text' && (
                          <div className="w-full h-full overflow-hidden whitespace-pre-wrap break-words px-1 flex items-center">
                            {el.text || ''}
                          </div>
                        )}
                        {el.type === 'slot' && (
                          <div
                            className={`w-full h-full px-1.5 flex items-center overflow-hidden ${
                              el.showBorderBottom !== false ? 'border-b border-dotted border-slate-700' : ''
                            }`}
                          >
                            <span className="truncate">{getSampleBindingValue(el.binding) || '\u00A0'}</span>
                          </div>
                        )}
                        {el.type === 'logo' && el.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={el.imageUrl} alt="Logo" className="w-full h-full object-contain" />
                        )}
                        {el.type === 'signature' && (
                          <div className="w-full h-full flex flex-col items-center justify-end pb-1 text-center">
                            <div className="w-4/5 border-b border-dotted border-slate-700 mb-1" />
                            <div className="text-slate-700">(................................................)</div>
                            <div className="font-medium mt-0.5">{el.text || 'ผู้ลงนาม'}</div>
                          </div>
                        )}
                        {el.type === 'divider' && (
                          <div className="w-full h-full flex items-center">
                            <div className="w-full border-t-2" style={{ borderColor: el.color || '#334155' }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                ) : (
                  <OfficialGovFormDocument
                    sampleDocMode={true}
                    customFields={{
                      formTitle: currentSelectedForm.structure?.title || currentSelectedForm.name,
                      subject: currentSelectedForm.structure?.subject || 'ขออนุญาตใช้สถานที่ราชการ',
                      toWhom: currentSelectedForm.structure?.recipient || 'ผู้มีอำนาจอนุมัติ',
                      writtenAt: currentSelectedForm.structure?.writtenAt,
                      desireLabel:
                        currentSelectedForm.category === 'equipment' || currentSelectedForm.name.includes('ครุภัณฑ์')
                          ? 'มีความประสงค์ขอยืมครุภัณฑ์ราชการ ดังนี้'
                          : 'มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้',
                      requesterRoleCaption:
                        currentSelectedForm.category === 'equipment' || currentSelectedForm.name.includes('ครุภัณฑ์')
                          ? 'ผู้ขออนุญาตยืมครุภัณฑ์ราชการ'
                          : 'ผู้ขออนุญาตใช้สถานที่ราชการ',
                      closingText: currentSelectedForm.structure?.closingText,
                    }}
                  />
                )}
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

      {/* Modal ตัวแก้ไขแม่แบบเอกสารแบบอิสระบนกระดาษ A4 */}
      {editingTemplate && (
        <FreeformTemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setEditingTemplate(null);
            loadForms();
          }}
          onSaved={(updated) => {
            setFormsList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
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
