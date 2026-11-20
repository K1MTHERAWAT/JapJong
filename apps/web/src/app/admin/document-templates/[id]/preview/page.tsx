'use client';

/**
 * =====================================================================
 * หน้าดูตัวอย่างและพิมพ์แม่แบบเอกสารราชการ (Document Template Preview Page)
 * =====================================================================
 * จำลองหน้ากระดาษราชการขนาดมาตรฐาน A4 (210mm x 297mm) ตามระเบียบสำนักนายกรัฐมนตรี:
 * 1. แสดงตราสัญลักษณ์ครุฑหรือโลโก้องค์กร จัดวาง กึ่งกลาง/ซ้าย/ขวา
 * 2. ข้อความหัวเรื่อง "แบบขอใช้สถานที่ราชการ", สถานที่เขียน, วันที่จุดประ
 * 3. เรื่อง, เรียน, ข้อมูลผู้ขอ, วัตถุประสงค์
 * 4. ช่องลงนามลายมือชื่อ 3-4 ระดับ
 * 5. ฟังก์ชันสั่งพิมพ์ (Print stylesheet) ซ่อนเครื่องมือและตัดพื้นหลังออกอัตโนมัติ
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocumentTemplateItem } from '@japjong/shared';
import { Icon } from '@/components/icons';
import { AppShell } from '@/components/shell';
import { A4BackgroundLayer, A4_HEIGHT_PX, A4_WIDTH_PX } from '@/components/freeform-a4-editor';
import { api } from '@/lib/api';
import { getSampleBindingValue } from '@/lib/document-bindings';
import { chunkDocumentItems, triggerDocumentPrint } from '@/lib/print';

export default function DocumentTemplatePreviewPage() {
  const params = useParams();
  const templateId = String(params.id || '');
  // State ข้อมูลแม่แบบเอกสาร
  const [template, setTemplate] = useState<DocumentTemplateItem | null>(null);
  // State สถานะกำลังโหลด
  const [loading, setLoading] = useState(true);
  // State ข้อผิดพลาด
  const [error, setError] = useState('');

  // โหลดข้อมูลแม่แบบเอกสารตาม templateId
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

  // ฟังก์ชันสั่งพิมพ์ผ่านหน้าต่าง Print มาตรฐานกลาง
  const handlePrint = () => {
    triggerDocumentPrint();
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

  // โครงสร้างเอกสารราชการ
  const doc = template.structure;
  const itemPages = chunkDocumentItems(doc.purposeItems || [], 3);

  return (
    <AppShell noPadding>
      <div className="flex-1 bg-slate-200 py-6 px-4 flex flex-col items-center">
      {/* แถบเครื่องมือควบคุมการพิมพ์ (ซ่อนอัตโนมัติเวลาสั่งพิมพ์) */}
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

      {/* หน้ากระดาษมาตรฐาน A4 จำลอง */}
      {doc.editorMode === 'freeform' ? (
        <div
          id="official-doc-print-area"
          className="print-doc relative bg-white shadow-xl overflow-hidden print:shadow-none"
          style={{
            width: A4_WIDTH_PX,
            height: A4_HEIGHT_PX,
            fontFamily: "'TH Sarabun New', 'Sarabun', sans-serif",
          }}
        >
          <A4BackgroundLayer url={doc.backgroundImageUrl} opacity={doc.backgroundOpacity ?? 1} />
          {(doc.freeformElements || []).map((el) => {
            const fontSize = el.fontSize ?? 16;
            return (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                  fontSize: `${fontSize}px`,
                  fontWeight: el.fontWeight || 'normal',
                  textAlign: el.textAlign || 'left',
                  color: el.color || '#0f172a',
                  lineHeight: 1.35,
                }}
              >
                {el.type === 'text' && (
                  <div
                    className="w-full h-full overflow-hidden whitespace-pre-wrap break-words px-1 flex items-center"
                    style={{
                      justifyContent:
                        el.textAlign === 'center'
                          ? 'center'
                          : el.textAlign === 'right'
                            ? 'flex-end'
                            : 'flex-start',
                    }}
                  >
                    {el.text || ''}
                  </div>
                )}
                {el.type === 'slot' && (
                  <div
                    className={`w-full h-full px-1.5 flex items-center overflow-hidden ${
                      el.showBorderBottom !== false ? 'border-b border-dotted border-slate-700' : ''
                    }`}
                    style={{
                      justifyContent:
                        el.textAlign === 'center'
                          ? 'center'
                          : el.textAlign === 'right'
                            ? 'flex-end'
                            : 'flex-start',
                    }}
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
            );
          })}
        </div>
      ) : (
      <div className="flex flex-col gap-6 items-center w-full print:block print:gap-0">
        {itemPages.map((pageItems, pageIdx) => (
          <div
            key={pageIdx}
            id={pageIdx === 0 ? 'official-doc-print-area' : undefined}
            className={`print-doc bg-white shadow-xl w-[210mm] max-w-full min-h-[297mm] p-[25mm] rounded-xs text-[#111] flex flex-col justify-between print:shadow-none print:p-0 print:w-full print:min-h-0 ${
              pageIdx > 0 ? 'print-page-break' : ''
            }`}
            style={{ fontFamily: "'TH Sarabun New', 'Sarabun', sans-serif" }}
          >
            <div className="text-right text-xs text-slate-500 mb-1">
              หน้าที่ {pageIdx + 1} / {itemPages.length}
            </div>
        <div className="space-y-4">
          {/* ตราสัญลักษณ์ / ตราครุฑ */}
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

          {/* ชื่อแบบฟอร์มเอกสารราชการ */}
          <h1 className="text-center text-[22px] font-bold text-ink mb-2">
            {doc.title}
          </h1>

          {/* สถานที่เขียน และวันที่ */}
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

          {/* เรื่อง และ เรียน */}
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

          {/* ข้อมูลผู้ยื่นคำขอและช่องจุดประ */}
          <div className="pt-3 text-[15px] leading-relaxed">
            <div className="flex flex-wrap items-center gap-y-2 gap-x-1.5">
              <span className="font-medium indent-8">ด้วยข้าพเจ้า</span>
              {doc.requesterSlots.map((slot) => (
                <span
                  key={slot.id}
                  style={{ width: `${slot.width}px` }}
                  className="inline-flex max-w-full break-words items-center justify-center border-b border-dotted border-ink-mute h-6 text-center text-xs text-ink-mute/40 select-none align-middle"
                >
                  ..................................................................
                </span>
              ))}
            </div>
          </div>

          {/* วัตถุประสงค์และรายการ */}
          <div className="pt-2 space-y-2 text-[15px]">
            <p className="font-medium">{doc.purposeText}</p>
            <div className="space-y-1.5 pl-6">
              {pageItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-baseline gap-2">
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

          {/* คำลงท้ายเอกสาร */}
          <div className="pt-3 text-[15px]">
            <p className="indent-8">{doc.closingText}</p>
          </div>
        </div>

        {/* ส่วนลงนามลายมือชื่อ 3-4 ระดับ */}
        <div className="print-keep-together pt-8 border-t border-line/60 mt-8">
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
        ))}
      </div>
      )}
      </div>
    </AppShell>
  );
}
