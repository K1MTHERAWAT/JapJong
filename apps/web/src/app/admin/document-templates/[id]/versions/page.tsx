'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  DocumentTemplateItem,
  DocumentTemplateVersionItem,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { api, formatThaiDate } from '@/lib/api';

export default function DocumentTemplateVersionsPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = String(params.id || '');

  const [template, setTemplate] = useState<DocumentTemplateItem | null>(null);
  const [versions, setVersions] = useState<DocumentTemplateVersionItem[]>([]);
  const [selectedVer, setSelectedVer] = useState<DocumentTemplateVersionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!templateId) return;
      try {
        setLoading(true);
        const [tpl, vers] = await Promise.all([
          api.getDocumentTemplate(templateId),
          api.listTemplateVersions(templateId),
        ]);
        setTemplate(tpl);
        setVersions(vers);
        if (vers.length > 0) {
          setSelectedVer(vers[0]);
        }
      } catch (err) {
        setError((err as Error).message || 'ไม่สามารถโหลดประวัติเวอร์ชันได้');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [templateId]);

  const handleRollback = async (verNum: number) => {
    if (!confirm(`ยืนยันการย้อนกลับ (Rollback) แม่แบบเอกสารนี้เป็นเวอร์ชัน v${verNum}? โครงสร้างปัจจุบันจะถูกแทนที่ด้วยเวอร์ชันนี้`)) {
      return;
    }
    setActionLoading(true);
    try {
      await api.rollbackTemplateVersion(templateId, verNum);
      alert(`ย้อนกลับเป็นเวอร์ชัน v${verNum} สำเร็จ!`);
      router.push(`/admin/document-templates/${templateId}/editor`);
    } catch (err) {
      alert((err as Error).message || 'ย้อนกลับเวอร์ชันไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AppShell
      title="ประวัติเวอร์ชันแม่แบบเอกสาร"
      backHref="/admin/document-templates"
      rightLabel="แอดมิน"
    >
      <div className="w-full space-y-6">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">ประวัติเวอร์ชันแม่แบบเอกสาร</h1>
              {template && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-mint text-brand">
                  ปัจจุบัน: v{template.currentVersion}
                </span>
              )}
            </div>
            <p className="text-sm text-ink-mute">
              {template?.name} — ตรวจสอบและย้อนกลับโครงสร้างเอกสารตามประวัติการเผยแพร่
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/document-templates/${templateId}/editor`}
              className="jw-btn text-sm flex items-center gap-1.5"
            >
              <Icon name="pencil" className="w-4 h-4" />
              <span>เปิดตัวแก้ไข (Editor)</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="jw-card p-12 text-center text-ink-mute">
            กำลังโหลดประวัติเวอร์ชัน...
          </div>
        ) : error ? (
          <div className="jw-card p-8 text-center text-red-600 bg-red-50 border border-red-200">
            {error}
          </div>
        ) : versions.length === 0 ? (
          <div className="jw-card p-12 text-center space-y-3">
            <p className="text-base font-semibold text-ink">ยังไม่มีประวัติเวอร์ชันที่เผยแพร่</p>
            <p className="text-sm text-ink-mute">เมื่อทำการกด Publish ในหน้า Editor ระบบจะบันทึก Snapshot ประวัติเวอร์ชันที่นี่</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Version timeline list */}
            <div className="jw-card p-4 space-y-3 lg:col-span-1">
              <h2 className="text-sm font-bold text-ink mb-2">รายการเวอร์ชันทั้งหมด</h2>
              <div className="space-y-2">
                {versions.map((v) => {
                  const isCurrent = template?.currentVersion === v.version;
                  const isSelected = selectedVer?.version === v.version;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVer(v)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        isSelected
                          ? 'border-brand bg-brand-mint/30 shadow-xs'
                          : 'border-line hover:border-brand/40 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink">v{v.version}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              ใช้งานอยู่
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-ink-mute">
                          {formatThaiDate(v.publishedAt, true)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-mute line-clamp-2">
                        {v.note || 'ไม่มีหมายเหตุ'}
                      </p>
                      <div className="text-[11px] text-ink-mute mt-2 flex items-center justify-between">
                        <span>โดย {v.publishedBy || 'แอดมิน'}</span>
                        <span className="text-brand font-medium">ดูรายละเอียด →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Version Snapshot Details & Preview */}
            <div className="jw-card p-6 lg:col-span-2 space-y-4">
              {selectedVer ? (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-ink">
                          รายละเอียดเวอร์ชัน v{selectedVer.version}
                        </h2>
                        {template?.currentVersion === selectedVer.version && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            เวอร์ชันปัจจุบัน
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-mute mt-0.5">
                        เผยแพร่เมื่อ {formatThaiDate(selectedVer.publishedAt, true)} โดย {selectedVer.publishedBy || 'แอดมิน'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {template?.currentVersion !== selectedVer.version && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleRollback(selectedVer.version)}
                          className="jw-btn-sec text-xs text-amber-700 border-amber-300 hover:bg-amber-50 flex items-center gap-1"
                        >
                          <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
                          <span>ย้อนกลับใช้เวอร์ชันนี้</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedVer.note && (
                    <div className="p-3 rounded-xl bg-soft text-xs text-ink">
                      <b className="block mb-0.5">หมายเหตุการเผยแพร่:</b>
                      <span>{selectedVer.note}</span>
                    </div>
                  )}

                  {/* Document Structure Snapshot */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-mute">
                      โครงสร้างเนื้อหาของเวอร์ชันนี้
                    </h3>
                    <div className="border border-line rounded-xl p-4 bg-soft/20 text-xs space-y-2 font-mono">
                      <div><b>ชื่อเอกสาร:</b> {selectedVer.structure.title}</div>
                      <div><b>เรื่อง:</b> {selectedVer.structure.subject}</div>
                      <div><b>เรียน:</b> {selectedVer.structure.recipient}</div>
                      <div><b>สถานที่เขียน:</b> {selectedVer.structure.writtenAt}</div>
                      <div>
                        <b>จำนวนช่องดึงข้อมูล (Slots):</b>{' '}
                        {selectedVer.structure.requesterSlots?.length || 0} ช่อง
                      </div>
                      <div>
                        <b>จำนวนผู้ลงนาม:</b>{' '}
                        {selectedVer.structure.signatures?.length || 0} ท่าน (คง 3 ระดับเดิม)
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-ink-mute text-sm">
                  เลือกเวอร์ชันจากรายการด้านซ้ายเพื่อดูรายละเอียด
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
