'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { GeneratedDocumentItem } from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { api, formatThaiDate } from '@/lib/api';

export default function GeneratedDocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const data = await api.listGeneratedDocuments({ search: search.trim() || undefined });
      setDocuments(data);
    } catch (err) {
      setError((err as Error).message || 'ไม่สามารถโหลดรายการเอกสารได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDocs();
  };

  return (
    <AppShell
      title="เอกสารที่สร้างจากคำขอ"
      backHref="/admin/document-templates"
      rightLabel="แอดมิน"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">เอกสารราชการที่สร้างจากคำขอ</h1>
            <p className="text-sm text-ink-mute">
              รายการเอกสารคำขอที่ผูกกับคำขอจองสถานที่และคำขอยืมครุภัณฑ์จริง พร้อมข้อมูล Snapshot
            </p>
          </div>
          <Link
            href="/admin/document-templates"
            className="jw-btn-sec text-sm flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            <span>จัดการแม่แบบเอกสาร</span>
          </Link>
        </div>

        {/* Search */}
        <div className="jw-card p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ค้นหาเลขที่เอกสาร หรือชื่อเอกสาร..."
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
        </div>

        {/* Documents Table */}
        {loading ? (
          <div className="jw-card p-12 text-center text-ink-mute">
            กำลังโหลดรายการเอกสาร...
          </div>
        ) : error ? (
          <div className="jw-card p-8 text-center text-red-600 bg-red-50 border border-red-200">
            {error}
          </div>
        ) : documents.length === 0 ? (
          <div className="jw-card p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-soft mx-auto flex items-center justify-center text-ink-mute">
              <Icon name="file-text" className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-ink">ยังไม่มีเอกสารที่สร้างจากคำขอ</p>
            <p className="text-sm text-ink-mute">เมื่อผู้ใช้หรือแอดมินสร้างคำขอจองสถานที่หรือยืมครุภัณฑ์ เอกสารราชการจะถูกสร้างและแสดงที่นี่</p>
          </div>
        ) : (
          <div className="jw-card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-soft/60 border-b border-line text-xs font-semibold text-ink-mute uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">เลขที่เอกสาร</th>
                  <th className="px-4 py-3">ชื่อเอกสารคำขอ</th>
                  <th className="px-4 py-3">รหัสคำขอที่ผูก</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่สร้าง</th>
                  <th className="px-4 py-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-soft/30 transition">
                    <td className="px-4 py-3 font-mono font-medium text-brand">
                      {doc.documentNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {doc.snapshot?.title || 'เอกสารราชการ'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/requests/${doc.requestId}`}
                        className="hover:underline text-ink-mute hover:text-brand"
                      >
                        {doc.requestId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-mute">
                      {formatThaiDate(doc.createdAt, true)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/document-templates/${doc.templateId}/preview`}
                        className="px-3 py-1 rounded-lg border border-line text-xs font-medium hover:bg-soft transition inline-flex items-center gap-1"
                      >
                        <Icon name="eye" className="w-3.5 h-3.5" />
                        <span>ดูเอกสาร</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
