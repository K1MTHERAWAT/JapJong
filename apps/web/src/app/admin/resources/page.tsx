'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  FilterToolbar,
  OfficialGovFormDocument,
  PageHeader,
  SearchInput,
  Tabs,
  Toggle,
} from '@/components/ui';
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

type ResourceTab = 'venues' | 'equipment' | 'vehicles' | 'forms';

function ManageResourcesContent() {
  const { account } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as ResourceTab) || 'venues';

  const [tab, setTab] = useState<ResourceTab>(initialTab);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENABLED' | 'DISABLED'>('ALL');

  // Forms management
  const [formsList, setFormsList] = useState<FormTemplateItem[]>([]);
  const [selectedFormKey, setSelectedFormKey] = useState<string>('venue');
  const [formPreviewMode, setFormPreviewMode] = useState<'sample' | 'blank'>('sample');
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [isCreatingNewForm, setIsCreatingNewForm] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const loadForms = useCallback(() => {
    setFormsList(getFormTemplates());
    fetchFormTemplatesFromApi().then((list) => {
      setFormsList(list);
    });
  }, []);

  const load = useCallback(() => {
    api.venues().then(setVenues).catch(() => {});
    api.equipment().then(setEquipment).catch(() => {});
    loadForms();
  }, [loadForms]);

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

  const handleDeleteForm = (id: string, title: string) => {
    if (window.confirm(`คุณต้องการลบแบบฟอร์ม "${title}" ออกจากระบบใช่หรือไม่?`)) {
      deleteCustomFormTemplate(id);
      loadForms();
      if (selectedFormKey === id) {
        setSelectedFormKey('venue');
      }
    }
  };

  const filteredVenues = useMemo(() => {
    return venues.filter((v) => {
      if (statusFilter === 'ENABLED' && !v.enabled) return false;
      if (statusFilter === 'DISABLED' && v.enabled) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q) ||
          (VENUE_TYPE_LABEL[v.type] || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [venues, statusFilter, searchQuery]);

  const filteredEquipment = useMemo(() => {
    return equipment.filter((e) => {
      if (statusFilter === 'ENABLED' && !e.enabled) return false;
      if (statusFilter === 'DISABLED' && e.enabled) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          (EQUIPMENT_CATEGORY_LABEL[e.category] || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [equipment, statusFilter, searchQuery]);

  const currentSelectedForm = formsList.find((f) => f.id === selectedFormKey) || formsList[0];

  return (
    <AppShell
      title="ทรัพยากรและแบบฟอร์ม"
      backHref={roleHomePath(account?.role)}
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth="max-w-none"
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
          <Link href="/admin/resources/new" className="jw-btn w-full sm:w-56">
            + เพิ่มรายการทรัพยากร
          </Link>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <PageHeader
          title="จัดการทรัพยากรและแบบฟอร์มราชการ"
          subtitle="บริหารจัดการข้อมูลสถานที่ส่วนกลาง ครุภัณฑ์อุปกรณ์ให้ยืม ยานพาหนะ และแม่แบบเอกสารคำขอราชการ"
          actions={
            tab === 'forms' ? (
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewForm(true);
                  setShowDocEditor(true);
                }}
                className="jw-btn !h-9 !px-4 !text-[13px] !rounded-xl shadow-xs"
              >
                <Icon name="plus" className="w-4 h-4" />
                <span>เพิ่มแบบฟอร์มใหม่</span>
              </button>
            ) : (
              <Link
                href="/admin/resources/new"
                className="jw-btn !h-9 !px-4 !text-[13px] !rounded-xl shadow-xs"
              >
                <Icon name="plus" className="w-4 h-4" />
                <span>เพิ่มรายการทรัพยากรใหม่</span>
              </Link>
            )
          }
        />

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => setTab('venues')}
            className={`jw-card p-4 text-left transition ${
              tab === 'venues' ? 'ring-2 ring-brand border-brand' : 'hover:border-brand/50'
            }`}
          >
            <span className="text-[12px] text-ink-mute block">สถานที่ราชการทั้งหมด</span>
            <b className="text-[24px] text-ink tabular-nums">{venues.length}</b>
            <span className="text-[11px] text-ok block mt-0.5">
              เปิดให้จอง {venues.filter((v) => v.enabled).length} แห่ง
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('equipment')}
            className={`jw-card p-4 text-left transition ${
              tab === 'equipment' ? 'ring-2 ring-brand border-brand' : 'hover:border-brand/50'
            }`}
          >
            <span className="text-[12px] text-ink-mute block">รายการครุภัณฑ์อุปกรณ์</span>
            <b className="text-[24px] text-ink tabular-nums">{equipment.length}</b>
            <span className="text-[11px] text-ok block mt-0.5">
              พร้อมให้ยืม {equipment.filter((e) => e.enabled).length} รายการ
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('equipment')}
            className="jw-card p-4 text-left hover:border-brand/50 transition"
          >
            <span className="text-[12px] text-ink-mute block">จำนวนครุภัณฑ์คงเหลือรวม</span>
            <b className="text-[24px] text-brand tabular-nums">
              {equipment.reduce((acc, item) => acc + (item.stock || 0), 0)}
            </b>
            <span className="text-[11px] text-ink-3 block mt-0.5">ชิ้นในคลังพัสดุ</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('forms')}
            className={`jw-card p-4 text-left transition ${
              tab === 'forms' ? 'ring-2 ring-brand border-brand' : 'hover:border-brand/50'
            }`}
          >
            <span className="text-[12px] text-ink-mute block">แม่แบบฟอร์มราชการ</span>
            <b className="text-[24px] text-ink tabular-nums">{formsList.length}</b>
            <span className="text-[11px] text-ink-3 block mt-0.5">แบบฟอร์มพร้อมใช้งาน</span>
          </button>
        </div>

        <Tabs<ResourceTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'venues', label: `สถานที่ (${venues.length})` },
            { value: 'equipment', label: `อุปกรณ์ (${equipment.length})` },
            { value: 'vehicles', label: 'ยานพาหนะ' },
            { value: 'forms', label: `แบบฟอร์ม (${formsList.length})` },
          ]}
        />

        {(tab === 'venues' || tab === 'equipment') && (
          <FilterToolbar>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={
                tab === 'venues'
                  ? 'ค้นหาชื่อสถานที่, รหัส, ประเภท...'
                  : 'ค้นหาชื่ออุปกรณ์, รหัสครุภัณฑ์, หมวดหมู่...'
              }
              className="w-full sm:w-80"
            />
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: 'ALL', label: 'ทั้งหมด' },
                  { key: 'ENABLED', label: 'เปิดใช้งาน' },
                  { key: 'DISABLED', label: 'ปิดชั่วคราว' },
                ] as const
              ).map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setStatusFilter(st.key)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition border ${
                    statusFilter === st.key
                      ? 'bg-ink text-white border-ink'
                      : 'bg-surface text-ink-2 border-line hover:bg-surface-muted'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </FilterToolbar>
        )}

        {/* ================= TAB === 'venues' ================= */}
        {tab === 'venues' && (
          <div className="jw-card overflow-hidden">
            {filteredVenues.length === 0 ? (
              <div className="p-8 text-center text-[14px] text-ink-mute">
                ไม่พบรายการสถานที่ สามารถกด <b>+ เพิ่มรายการทรัพยากรใหม่</b> เพื่อเพิ่มสถานที่
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-muted/70 border-b border-line text-[12px] font-semibold text-ink-3 uppercase tracking-wider">
                        <th className="py-3 px-4">สถานที่ราชการ</th>
                        <th className="py-3 px-4">ประเภท</th>
                        <th className="py-3 px-4 text-right">ความจุสูงสุด</th>
                        <th className="py-3 px-4 text-right">จองล่วงหน้า</th>
                        <th className="py-3 px-4 text-center">สถานะ</th>
                        <th className="py-3 px-4 text-center">เปิด/ปิดให้จอง</th>
                        <th className="py-3 px-4 text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-[13.5px]">
                      {filteredVenues.map((v) => (
                        <tr key={v.id} className="hover:bg-brand-tint/20 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-0">
                              {v.images?.[0] ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImg(v.images![0])}
                                  className="w-11 h-11 rounded-xl overflow-hidden border border-line shrink-0"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={v.images[0]}
                                    alt={v.name}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0">
                                  <Icon name="building" className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <b className="text-[14px] text-ink block truncate">{v.name}</b>
                                <span className="text-[11.5px] text-ink-3 font-mono">รหัส: {v.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-ink-2">
                            <span className="px-2.5 py-1 rounded-lg bg-surface-muted text-[12px] font-medium">
                              {VENUE_TYPE_LABEL[v.type]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-ink tabular-nums">
                            {v.capacity.toLocaleString()} คน
                          </td>
                          <td className="py-3 px-4 text-right text-ink-2 tabular-nums">
                            {v.advanceDays} วัน
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold ${
                                v.enabled
                                  ? 'bg-ok-soft text-ok'
                                  : 'bg-surface-muted text-ink-3'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  v.enabled ? 'bg-ok' : 'bg-ink-3'
                                }`}
                              />
                              {v.enabled ? 'พร้อมให้จอง' : 'ปิดชั่วคราว'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex justify-center">
                              <Toggle checked={v.enabled} onChange={(val) => toggleVenue(v, val)} />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              href={`/admin/resources/edit?id=${v.id}&kind=venue`}
                              className="px-3 py-1.5 rounded-lg border border-line text-[12px] font-semibold text-ink hover:border-brand hover:text-brand transition inline-flex items-center gap-1"
                            >
                              <Icon name="edit" className="w-3.5 h-3.5" />
                              <span>แก้ไข</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-line">
                  {filteredVenues.map((v) => (
                    <div key={v.id} className="p-4 flex items-center justify-between gap-3">
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
                          <b className="text-[14.5px] text-ink block truncate">{v.name}</b>
                          <span className="text-[12.5px] text-ink-mute block">
                            {VENUE_TYPE_LABEL[v.type]} · {v.capacity} คน · ล่วงหน้า {v.advanceDays} วัน
                            {!v.enabled ? ' · ปิดชั่วคราว' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/admin/resources/edit?id=${v.id}&kind=venue`}
                          className="px-3 py-1.5 rounded-xl border border-line text-[12px] font-semibold text-ink hover:bg-soft transition"
                        >
                          แก้ไข
                        </Link>
                        <Toggle checked={v.enabled} onChange={(val) => toggleVenue(v, val)} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= TAB === 'equipment' ================= */}
        {tab === 'equipment' && (
          <div className="jw-card overflow-hidden">
            {filteredEquipment.length === 0 ? (
              <div className="p-8 text-center text-[14px] text-ink-mute">
                ไม่พบรายการครุภัณฑ์อุปกรณ์ สามารถกด <b>+ เพิ่มรายการทรัพยากรใหม่</b> เพื่อเพิ่มอุปกรณ์
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-muted/70 border-b border-line text-[12px] font-semibold text-ink-3 uppercase tracking-wider">
                        <th className="py-3 px-4">รายการครุภัณฑ์ / อุปกรณ์</th>
                        <th className="py-3 px-4">หมวดหมู่</th>
                        <th className="py-3 px-4 text-right">คงเหลือในคลัง</th>
                        <th className="py-3 px-4 text-center">สถานะ</th>
                        <th className="py-3 px-4 text-center">เปิด/ปิดให้ยืม</th>
                        <th className="py-3 px-4 text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-[13.5px]">
                      {filteredEquipment.map((e) => (
                        <tr key={e.id} className="hover:bg-brand-tint/20 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-0">
                              {e.images?.[0] ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImg(e.images![0])}
                                  className="w-11 h-11 rounded-xl overflow-hidden border border-line shrink-0"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={e.images[0]}
                                    alt={e.name}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0">
                                  <Icon name="package" className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <b className="text-[14px] text-ink block truncate">{e.name}</b>
                                <span className="text-[11.5px] text-ink-3 font-mono">รหัส: {e.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-ink-2">
                            <span className="px-2.5 py-1 rounded-lg bg-surface-muted text-[12px] font-medium">
                              {EQUIPMENT_CATEGORY_LABEL[e.category]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-ink tabular-nums">
                            {e.stock.toLocaleString()} ชิ้น
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold ${
                                e.enabled
                                  ? 'bg-ok-soft text-ok'
                                  : 'bg-surface-muted text-ink-3'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  e.enabled ? 'bg-ok' : 'bg-ink-3'
                                }`}
                              />
                              {e.enabled ? 'พร้อมให้ยืม' : 'ปิดชั่วคราว'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex justify-center">
                              <Toggle checked={e.enabled} onChange={(val) => toggleEquipment(e, val)} />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              href={`/admin/resources/edit?id=${e.id}&kind=equipment`}
                              className="px-3 py-1.5 rounded-lg border border-line text-[12px] font-semibold text-ink hover:border-brand hover:text-brand transition inline-flex items-center gap-1"
                            >
                              <Icon name="edit" className="w-3.5 h-3.5" />
                              <span>แก้ไข</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-line">
                  {filteredEquipment.map((e) => (
                    <div key={e.id} className="p-4 flex items-center justify-between gap-3">
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
                          <b className="text-[14.5px] text-ink block truncate">{e.name}</b>
                          <span className="text-[12.5px] text-ink-mute block">
                            หมวด: {EQUIPMENT_CATEGORY_LABEL[e.category]} · คงเหลือ {e.stock} ชิ้น
                            {!e.enabled ? ' · ปิดให้ยืมชั่วคราว' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/admin/resources/edit?id=${e.id}&kind=equipment`}
                          className="px-3 py-1.5 rounded-xl border border-line text-[12px] font-semibold text-ink hover:bg-soft transition"
                        >
                          แก้ไข
                        </Link>
                        <Toggle checked={e.enabled} onChange={(val) => toggleEquipment(e, val)} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= TAB === 'vehicles' ================= */}
        {tab === 'vehicles' && (
          <div className="jw-card p-8 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-tint text-brand flex items-center justify-center">
              <Icon name="building-community" className="w-7 h-7" />
            </div>
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

        {/* ================= TAB === 'forms' ================= */}
        {tab === 'forms' && (
          <div className="flex flex-col gap-4">
            {/* Header + Add Form Button */}
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

            {/* List of Forms */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                        <b className="text-[14.5px] text-ink truncate">{f.title}</b>
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
                        {active ? 'แสดงอยู่' : 'ดูตัวอย่าง'}
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

            {/* Document Preview & Editor Trigger */}
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
                    formTitle:
                      currentSelectedForm?.config?.formTitle ||
                      currentSelectedForm?.title ||
                      'แบบขอใช้สถานที่ราชการ',
                    subject:
                      currentSelectedForm?.config?.subjectText ||
                      currentSelectedForm?.sub?.replace(/^เรื่อง\s*/, '') ||
                      'ขออนุญาตใช้สถานที่ราชการ',
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
          คลิกปุ่มแก้ไขเพื่อปรับปรุงรายละเอียดทรัพยากร · สวิตช์ใช้เปิด/ปิดให้จองหรือยืมได้ทันที
        </p>
      </div>

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
              className="max-w-full max-h-[85vh] rounded-2xl object-contain"
            />
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
          initialConfig={
            currentSelectedForm?.config || getFormTemplate(currentSelectedForm?.title || '')?.config
          }
          isBorrowMode={
            currentSelectedForm?.title?.includes('ครุภัณฑ์') ||
            currentSelectedForm?.title?.includes('อุปกรณ์')
          }
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
        <AppShell title="ทรัพยากรและแบบฟอร์ม" rightLabel="แอดมิน">
          <div className="jw-card p-12 text-center text-ink-mute">กำลังโหลด...</div>
        </AppShell>
      }
    >
      <ManageResourcesContent />
    </Suspense>
  );
}
