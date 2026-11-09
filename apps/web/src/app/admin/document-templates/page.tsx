'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DocumentTemplateCategory,
  DocumentTemplateItem,
  DocumentTemplateStatus,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { api, formatThaiDate } from '@/lib/api';

const CATEGORY_LABELS: Record<DocumentTemplateCategory, string> = {
  venue: 'แบบขอใช้สถานที่',
  equipment: 'แบบขอยืมครุภัณฑ์',
  memo: 'บันทึกข้อความ',
  general: 'เอกสารทั่วไป',
};

const STATUS_LABELS: Record<DocumentTemplateStatus, { label: string; color: string }> = {
  published: { label: 'เผยแพร่แล้ว', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  draft: { label: 'ฉบับร่าง', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  archived: { label: 'จัดเก็บแล้ว', color: 'bg-slate-100 text-slate-700 border-slate-300' },
};

export default function DocumentTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<DocumentTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // New Template Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCat, setNewTemplateCat] = useState<DocumentTemplateCategory>('venue');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.listDocumentTemplates({
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
      });
      setTemplates(data);
    } catch (err) {
      setError((err as Error).message || 'ไม่สามารถโหลดข้อมูลแม่แบบเอกสารได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTemplates();
  };

  const handleCreate = async () => {
    if (!newTemplateName.trim()) return;
    setCreating(true);
    try {
      const created = await api.createDocumentTemplate({
        name: newTemplateName.trim(),
        category: newTemplateCat,
        description: newTemplateDesc.trim(),
      });
      setShowCreateModal(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      router.push(`/admin/document-templates/${created.id}/editor`);
    } catch (err) {
      alert((err as Error).message || 'สร้างแม่แบบไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await api.duplicateDocumentTemplate(id);
      fetchTemplates();
    } catch (err) {
      alert((err as Error).message || 'ทำสำเนาไม่สำเร็จ');
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('ยืนยันจัดเก็บ (Archive) แม่แบบเอกสารนี้?')) return;
    try {
      await api.archiveDocumentTemplate(id);
      fetchTemplates();
    } catch (err) {
      alert((err as Error).message || 'จัดเก็บไม่สำเร็จ');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ยืนยันลบแม่แบบเอกสารนี้? การดำเนินการนี้ไม่สามารถยกเลิกได้')) return;
    try {
      await api.deleteDocumentTemplate(id);
      fetchTemplates();
    } catch (err) {
      alert((err as Error).message || 'ลบแม่แบบไม่สำเร็จ');
    }
  };

  return (
    <AppShell
      title="จัดการแม่แบบเอกสารราชการ"
      backHref="/admin"
      rightLabel="แอดมิน"
    >
      <div className="w-full space-y-6">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">จัดการแม่แบบเอกสารราชการ</h1>
            <p className="text-sm text-ink-mute">
              ออกแบบและจัดการแบบฟอร์มเอกสารคำขอ คำขอยืมครุภัณฑ์ และบันทึกข้อความราชการ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/documents"
              className="jw-btn-sec flex items-center gap-2 text-sm"
            >
              <Icon name="file-text" className="w-4 h-4" />
              <span>เอกสารที่สร้างแล้ว</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="jw-btn flex items-center gap-2 text-sm"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>เพิ่มแม่แบบใหม่</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="jw-card p-4 space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ค้นหาชื่อแบบฟอร์ม หรือคำอธิบาย..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="jw-in pl-10"
              />
              <Icon
                name="search"
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute"
              />
            </div>
            <button type="submit" className="jw-btn sm:w-28 text-sm">
              ค้นหา
            </button>
          </form>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-line">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-mute mr-1">ประเภท:</span>
              {[
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'venue', label: 'แบบขอใช้สถานที่' },
                { key: 'equipment', label: 'แบบขอยืมครุภัณฑ์' },
                { key: 'memo', label: 'บันทึกข้อความ' },
                { key: 'general', label: 'เอกสารทั่วไป' },
              ].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategoryFilter(c.key)}
                  className={`h-8 px-3 rounded-full text-xs font-medium border transition ${
                    categoryFilter === c.key
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-ink border-line hover:border-brand'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-mute mr-1">สถานะ:</span>
              {[
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'published', label: 'เผยแพร่แล้ว' },
                { key: 'draft', label: 'ฉบับร่าง' },
                { key: 'archived', label: 'จัดเก็บแล้ว' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatusFilter(s.key)}
                  className={`h-8 px-3 rounded-full text-xs font-medium border transition ${
                    statusFilter === s.key
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-ink border-line hover:border-slate-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Templates List */}
        {loading ? (
          <div className="jw-card p-12 text-center text-ink-mute">
            กำลังโหลดแม่แบบเอกสาร...
          </div>
        ) : error ? (
          <div className="jw-card p-8 text-center text-red-600 bg-red-50 border border-red-200">
            {error}
          </div>
        ) : templates.length === 0 ? (
          <div className="jw-card p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-soft mx-auto flex items-center justify-center text-ink-mute">
              <Icon name="file-text" className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-ink">ไม่พบแม่แบบเอกสาร</p>
            <p className="text-sm text-ink-mute">กดปุ่ม &quot;เพิ่มแม่แบบใหม่&quot; เพื่อเริ่มต้นออกแบบเอกสารราชการ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => {
              const statusCfg = STATUS_LABELS[tpl.status] || STATUS_LABELS.draft;
              return (
                <div
                  key={tpl.id}
                  className="jw-card p-5 flex flex-col justify-between hover:border-brand/40 transition group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-brand-mint text-brand">
                          {CATEGORY_LABELS[tpl.category] || tpl.category}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusCfg.color}`}
                        >
                          {statusCfg.label}
                        </span>
                        <span className="text-[11px] text-ink-mute font-medium">
                          v{tpl.currentVersion}
                        </span>
                      </div>
                    </div>

                    <h2 className="text-lg font-bold text-ink mb-1 group-hover:text-brand transition">
                      {tpl.name}
                    </h2>
                    {tpl.description ? (
                      <p className="text-sm text-ink-mute line-clamp-2 mb-4">
                        {tpl.description}
                      </p>
                    ) : (
                      <p className="text-sm text-ink-mute italic mb-4">ไม่มีคำอธิบายเพิ่มเติม</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-line">
                    <div className="flex items-center justify-between text-xs text-ink-mute mb-3">
                      <span>แก้ไขล่าสุด: {formatThaiDate(tpl.updatedAt, true)}</span>
                      <span>โดย {tpl.updatedBy || 'แอดมิน'}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/document-templates/${tpl.id}/editor`}
                          className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition flex items-center gap-1"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                          <span>ออกแบบ / แก้ไข</span>
                        </Link>
                        <Link
                          href={`/admin/document-templates/${tpl.id}/preview`}
                          className="px-2.5 py-1.5 rounded-xl border border-line text-ink text-xs font-medium hover:bg-soft transition flex items-center gap-1"
                          title="ดูตัวอย่างการพิมพ์"
                        >
                          <Icon name="eye" className="w-3.5 h-3.5" />
                          <span>ตัวอย่าง</span>
                        </Link>
                        <Link
                          href={`/admin/document-templates/${tpl.id}/versions`}
                          className="px-2.5 py-1.5 rounded-xl border border-line text-ink text-xs font-medium hover:bg-soft transition flex items-center gap-1"
                          title="ประวัติเวอร์ชัน"
                        >
                          <Icon name="clock" className="w-3.5 h-3.5" />
                          <span>เวอร์ชัน</span>
                        </Link>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicate(tpl.id)}
                          className="p-1.5 rounded-lg text-ink-mute hover:text-ink hover:bg-soft transition"
                          title="ทำสำเนา"
                        >
                          <Icon name="copy" className="w-4 h-4" />
                        </button>
                        {tpl.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => handleArchive(tpl.id)}
                            className="p-1.5 rounded-lg text-ink-mute hover:text-amber-600 hover:bg-amber-50 transition"
                            title="จัดเก็บ (Archive)"
                          >
                            <Icon name="archive" className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(tpl.id)}
                          className="p-1.5 rounded-lg text-ink-mute hover:text-red-600 hover:bg-red-50 transition"
                          title="ลบ"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal เพิ่มแม่แบบใหม่ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="jw-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="text-lg font-bold text-ink">สร้างแม่แบบเอกสารใหม่</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-ink-mute hover:text-ink"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="jw-lbl">ชื่อแม่แบบเอกสาร <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="เช่น แบบขอใช้สถานที่ราชการ (ฉบับ อบต.)"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="jw-in"
              />
            </div>

            <div>
              <label className="jw-lbl">ประเภทเอกสาร</label>
              <select
                value={newTemplateCat}
                onChange={(e) => setNewTemplateCat(e.target.value as DocumentTemplateCategory)}
                className="jw-in"
              >
                <option value="venue">แบบขอใช้สถานที่ราชการ</option>
                <option value="equipment">แบบคำขอยืมครุภัณฑ์ราชการ</option>
                <option value="memo">แบบบันทึกข้อความ</option>
                <option value="general">แบบฟอร์มเอกสารทั่วไป</option>
              </select>
            </div>

            <div>
              <label className="jw-lbl">คำอธิบาย (ถ้ามี)</label>
              <textarea
                rows={3}
                placeholder="ระบุวัตถุประสงค์หรือรายละเอียดของแม่แบบเอกสารนี้..."
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
                className="jw-in resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="jw-btn-sec text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={creating || !newTemplateName.trim()}
                onClick={handleCreate}
                className="jw-btn text-sm"
              >
                {creating ? 'กำลังสร้าง...' : 'สร้างและไปที่ตัวแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
