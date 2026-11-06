'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocumentTemplateItem } from '@japjong/shared';
import { Icon } from '@/components/icons';
import { api } from '@/lib/api';

export default function DocumentTemplatePreviewPage() {
  const params = useParams();
  const templateId = String(params.id || '');
  const [template, setTemplate] = useState<DocumentTemplateItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      if (!templateId) return;
      try {
        setLoading(true);
        const data = await api.getDocumentTemplate(templateId);
        setTemplate(data);
      } catch (err) {
        setError((err as Error).message || 'ไม่สามารถโหลดตัวอย่างเอกสารได้');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [templateId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-100 text-ink-mute">
        กำลังโหลดตัวอย่างเอกสาร...
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-100 gap-4">
        <p className="text-red-600 font-semibold">{error || 'ไม่พบแม่แบบเอกสาร'}</p>
        <Link href="/admin/document-templates" className="jw-btn text-sm">
          กลับไปหน้ารายการแม่แบบ
        </Link>
      </div>
    );
  }

  const doc = template.structure;

  return (
    <div className="min-h-screen bg-slate-200 py-6 px-4 flex flex-col items-center">
      {/* Print Control Toolbar (Hidden during print) */}
      <div className="w-[210mm] max-w-full flex items-center justify-between mb-4 print:hidden">
        <Link
          href={`/admin/document-templates/${template.id}/editor`}
          className="jw-btn-sec text-xs flex items-center gap-1.5"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          <span>กลับไปแก้ไข</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-mute">
            {template.name} (v{template.currentVersion})
          </span>
          <button
            type="button"
            onClick={handlePrint}
            className="jw-btn text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Icon name="printer" className="w-4 h-4" />
            <span>พิมพ์เอกสาร / บันทึกเป็น PDF</span>
          </button>
        </div>
      </div>

      {/* A4 Paper Container */}
      <div
        id="official-doc-print-area"
        className="bg-white shadow-xl w-[210mm] min-h-[297mm] p-[25mm] rounded-xs text-[#111] flex flex-col justify-between print:shadow-none print:p-0 print:w-full print:min-h-0"
        style={{ fontFamily: "'TH Sarabun New', 'Sarabun', sans-serif" }}
      >
        <div className="space-y-4">
          {/* Genuine Logo */}
          {doc.logoUrl && (
            <div
              className={`flex mb-4 ${
                doc.logoPosition === 'left'
                  ? 'justify-start'
                  : doc.logoPosition === 'right'
                  ? 'justify-end'
                  : 'justify-center'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.logoUrl}
                alt="ตราสัญลักษณ์"
                className={`object-contain ${
                  doc.logoSize === 'large'
                    ? 'h-24'
                    : doc.logoSize === 'small'
                    ? 'h-12'
                    : 'h-16'
                }`}
              />
            </div>
          )}

          {/* Title */}
          <h1 className="text-center text-[22px] font-bold text-ink mb-2">
            {doc.title}
          </h1>

          {/* Written At & Date */}
          <div className="flex justify-end pt-2">
            <div className="text-right space-y-1 text-[15px]">
              <div>
                <span>เขียนที่ </span>
                <span className="font-medium">{doc.writtenAt || '...................................................'}</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <span>วันที่</span>
                <span className="inline-block border-b border-dotted border-ink-mute w-10 text-center">..</span>
                <span>เดือน</span>
                <span className="inline-block border-b border-dotted border-ink-mute w-24 text-center">............</span>
                <span>พ.ศ.</span>
                <span className="inline-block border-b border-dotted border-ink-mute w-14 text-center">......</span>
              </div>
            </div>
          </div>

          {/* Subject & Recipient */}
          <div className="space-y-1.5 pt-2 text-[15px]">
            <div>
              <span className="font-bold">เรื่อง: </span>
              <span>{doc.subject}</span>
            </div>
            <div>
              <span className="font-bold">เรียน: </span>
              <span>{doc.recipient}</span>
            </div>
          </div>

          {/* Requester Details & Clean Dotted Slots */}
          <div className="pt-3 text-[15px] leading-relaxed">
            <div className="flex flex-wrap items-center gap-y-2 gap-x-1.5">
              <span className="font-medium indent-8">ด้วยข้าพเจ้า</span>
              {doc.requesterSlots.map((slot) => (
                <span
                  key={slot.id}
                  style={{ width: `${slot.width}px` }}
                  className="inline-flex items-center justify-center border-b border-dotted border-ink-mute h-6 text-center text-xs text-ink-mute/40 select-none align-middle"
                >
                  ..................................................................
                </span>
              ))}
            </div>
          </div>

          {/* Purpose & Items */}
          <div className="pt-2 space-y-2 text-[15px]">
            <p className="font-medium">{doc.purposeText}</p>
            <div className="space-y-1.5 pl-6">
              {doc.purposeItems.map((item, idx) => (
                <div key={item.id} className="flex items-baseline gap-2">
                  <span className="font-bold">{idx + 1}.</span>
                  <span className="flex-1 border-b border-dotted border-ink-mute">
                    {item.target || '...........................................................................'}
                  </span>
                  <span>เพื่อ</span>
                  <span className="flex-1 border-b border-dotted border-ink-mute">
                    {item.purpose || '...........................................................................'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Closing */}
          <div className="pt-3 text-[15px]">
            <p className="indent-8">{doc.closingText}</p>
          </div>
        </div>

        {/* 3-Level Signature Section */}
        <div className="pt-8 border-t border-line/60 mt-8">
          <div className="grid grid-cols-2 gap-6 text-center text-[13px]">
            {doc.signatures.map((sig) => (
              <div key={sig.id} className="p-2">
                <div className="h-10 flex items-end justify-center">
                  <span className="border-b border-dotted border-ink-mute w-44 inline-block mb-1">
                    (ลงชื่อ).....................................................
                  </span>
                </div>
                <p className="mt-1 font-semibold text-ink">{sig.title}</p>
                <p className="text-ink-mute text-[12px]">(.....................................................)</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
