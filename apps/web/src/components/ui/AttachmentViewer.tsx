'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Layers,
  Maximize2,
  X,
} from 'lucide-react';

function isImageAttachment(src: string): boolean {
  if (!src) return false;
  return (
    src.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(src)
  );
}

function isPdfAttachment(src: string): boolean {
  if (!src) return false;
  return (
    src.startsWith('data:application/pdf') ||
    /\.pdf(\?.*)?$/i.test(src)
  );
}

function getAttachmentMeta(src: string, idx: number) {
  if (isImageAttachment(src)) {
    return {
      kind: 'image' as const,
      label: `รูปภาพแนบ #${idx + 1}`,
      downloadName: `attachment-${idx + 1}.jpg`,
    };
  }
  if (isPdfAttachment(src)) {
    return {
      kind: 'pdf' as const,
      label: `เอกสารแนบ PDF #${idx + 1}`,
      downloadName: `attachment-${idx + 1}.pdf`,
    };
  }
  return {
    kind: 'file' as const,
    label: src,
    downloadName: `attachment-${idx + 1}`,
  };
}

/**
 * แสดงรายการไฟล์/รูปภาพที่ผู้ขอแนบมากับคำขอ
 * - variant="full" (ค่าเริ่มต้น): แสดงรูปภาพ/PDF เต็มความกว้างใต้เอกสาร
 *   - กรณีมีมากกว่า 1 รายการ: มีแถบสลับดู "เรียงทั้งหมด" / "ดูทีละรายการ" และปุ่มเลื่อนซ้าย-ขวาใน Lightbox
 * - variant="thumbnail": แสดงเป็นรูปย่อขนาดกะทัดรัด กดเพื่อเปิด Lightbox
 */
export function AttachmentViewer({
  attachments,
  emptyText = 'ไม่มีไฟล์แนบเพิ่มเติม',
  variant = 'full',
  title,
}: {
  attachments?: string[];
  emptyText?: string;
  variant?: 'full' | 'thumbnail';
  title?: string;
}) {
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [singleMode, setSingleMode] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hidden, setHidden] = useState(false);

  const list = (attachments || []).filter((item) => typeof item === 'string' && item.trim().length > 0);
  const safeActiveIdx = Math.min(activeIdx, Math.max(0, list.length - 1));

  const goPrevPreview = useCallback(() => {
    if (list.length <= 1) return;
    setPreviewIdx((prev) => (prev === null ? null : (prev - 1 + list.length) % list.length));
  }, [list.length]);

  const goNextPreview = useCallback(() => {
    if (list.length <= 1) return;
    setPreviewIdx((prev) => (prev === null ? null : (prev + 1) % list.length));
  }, [list.length]);

  useEffect(() => {
    if (previewIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewIdx(null);
      if (e.key === 'ArrowLeft') goPrevPreview();
      if (e.key === 'ArrowRight') goNextPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewIdx, goPrevPreview, goNextPreview]);

  if (list.length === 0) {
    return emptyText ? <span className="text-[12.5px] text-ink-mute">{emptyText}</span> : null;
  }

  const renderFullItem = (src: string, idx: number) => {
    const meta = getAttachmentMeta(src, idx);

    if (meta.kind === 'image') {
      return (
        <div
          key={idx}
          className="rounded-xl border border-line bg-surface-muted/50 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-surface">
            <span className="text-[12.5px] font-semibold text-ink">{meta.label}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewIdx(idx)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-line bg-surface text-[12px] font-medium text-ink hover:bg-hover transition cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
                <span>ขยายเต็มจอ</span>
              </button>
              <a
                href={src}
                download={meta.downloadName}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-ink transition"
              >
                <Download className="size-3.5" />
                <span>ดาวน์โหลด</span>
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPreviewIdx(idx)}
            title="คลิกเพื่อขยายเต็มจอ"
            className="block w-full p-2 cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={meta.label}
              className="w-full h-auto max-h-[760px] object-contain rounded-lg mx-auto"
            />
          </button>
        </div>
      );
    }

    if (meta.kind === 'pdf') {
      return (
        <div
          key={idx}
          className="rounded-xl border border-line bg-surface-muted/50 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-surface">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
              <FileText className="size-4 text-brand shrink-0" />
              <span>{meta.label}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewIdx(idx)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-line bg-surface text-[12px] font-medium text-ink hover:bg-hover transition cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
                <span>ขยายเต็มจอ</span>
              </button>
              <a
                href={src}
                download={meta.downloadName}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-ink transition"
              >
                <Download className="size-3.5" />
                <span>ดาวน์โหลด</span>
              </a>
            </div>
          </div>
          <iframe
            src={src}
            title={meta.label}
            className="w-full h-[640px] bg-white"
          />
        </div>
      );
    }

    return (
      <span
        key={idx}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-muted border border-line text-[12.5px] text-ink-mute w-fit"
        title="ไฟล์เดิมเก็บเฉพาะชื่อไฟล์ (อัปโหลดใหม่เพื่อดูตัวอย่างภาพ)"
      >
        <ImageIcon className="size-4 shrink-0" />
        <span>{src}</span>
      </span>
    );
  };

  const previewSrc = previewIdx !== null ? list[previewIdx] : null;
  const previewMeta = previewIdx !== null && previewSrc ? getAttachmentMeta(previewSrc, previewIdx) : null;

  return (
    <>
      {variant === 'full' ? (
        <div className="flex flex-col gap-3">
          {/* หัวข้อและปุ่มซ่อน/แสดงรูปภาพและเอกสารแนบ */}
          <div className={`flex flex-wrap items-center gap-2 ${title ? 'justify-between' : 'justify-end'}`}>
            {title && <b className="text-[14px] sm:text-[15px] text-ink">{title}</b>}
            <button
              type="button"
              onClick={() => setHidden((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline cursor-pointer"
            >
              {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              <span>{hidden ? `แสดงรูป / เอกสารแนบ (${list.length})` : 'ซ่อนรูป / เอกสารแนบ'}</span>
            </button>
          </div>

          {!hidden && (
            <>
              {/* แถบควบคุมกรณีมีมากกว่า 1 ไฟล์ */}
              {list.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] font-semibold text-ink-mute mr-1">
                  ทั้งหมด {list.length} รายการ:
                </span>
                {list.map((src, idx) => {
                  const isActive = singleMode && safeActiveIdx === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSingleMode(true);
                        setActiveIdx(idx);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-semibold border transition cursor-pointer ${
                        isActive
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-muted text-ink border-line hover:border-brand/50'
                      }`}
                    >
                      {isImageAttachment(src) ? (
                        <ImageIcon className="size-3.5" />
                      ) : (
                        <FileText className="size-3.5" />
                      )}
                      <span>#{idx + 1}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setSingleMode((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-surface text-[12px] font-semibold text-brand hover:bg-hover transition cursor-pointer"
              >
                <Layers className="size-3.5" />
                <span>{singleMode ? 'แสดงทั้งหมดเรียงลงมา' : 'ดูทีละรายการ'}</span>
              </button>
            </div>
          )}

          {singleMode && list.length > 1 ? (
            <div className="flex flex-col gap-2.5">
              {renderFullItem(list[safeActiveIdx], safeActiveIdx)}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveIdx((safeActiveIdx - 1 + list.length) % list.length)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line bg-surface text-[12.5px] font-semibold text-ink hover:bg-hover transition cursor-pointer"
                >
                  <ChevronLeft className="size-4" />
                  <span>ก่อนหน้า</span>
                </button>
                <span className="text-[12.5px] font-semibold text-ink-mute">
                  รายการที่ {safeActiveIdx + 1} / {list.length}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveIdx((safeActiveIdx + 1) % list.length)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line bg-surface text-[12.5px] font-semibold text-ink hover:bg-hover transition cursor-pointer"
                >
                  <span>ถัดไป</span>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {list.map((src, idx) => renderFullItem(src, idx))}
            </div>
          )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {list.map((src, idx) => {
            if (isImageAttachment(src)) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPreviewIdx(idx)}
                  title="คลิกเพื่อดูรูปขนาดใหญ่"
                  className="group relative size-14 sm:size-16 rounded-lg overflow-hidden border border-line bg-surface-muted hover:border-brand transition cursor-pointer shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`รูปภาพแนบ ${idx + 1}`}
                    className="size-full object-cover"
                  />
                  <span className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Eye className="size-4" />
                  </span>
                </button>
              );
            }

            if (isPdfAttachment(src)) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPreviewIdx(idx)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-muted border border-line hover:border-brand text-[12.5px] font-medium text-ink transition cursor-pointer"
                >
                  <FileText className="size-4 text-brand shrink-0" />
                  <span>เอกสารแนบ PDF #{idx + 1}</span>
                  <Eye className="size-3.5 text-ink-mute" />
                </button>
              );
            }

            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-muted border border-line text-[12px] text-ink-mute"
                title="ไฟล์เดิมเก็บเฉพาะชื่อไฟล์ (อัปโหลดใหม่เพื่อดูตัวอย่างภาพ)"
              >
                <ImageIcon className="size-3.5 shrink-0" />
                <span className="max-w-[200px] truncate">{src}</span>
              </span>
            );
          })}
        </div>
      )}

      {previewIdx !== null && previewSrc && previewMeta && (
        <div
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewIdx(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line bg-surface">
              <div className="flex items-center gap-2 min-w-0">
                <b className="text-[14px] text-ink truncate">{previewMeta.label}</b>
                {list.length > 1 && (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-surface-muted border border-line text-ink-mute shrink-0">
                    {previewIdx + 1} / {list.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {list.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={goPrevPreview}
                      aria-label="รูปก่อนหน้า"
                      className="size-8 rounded-lg border border-line flex items-center justify-center text-ink hover:bg-hover transition cursor-pointer"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goNextPreview}
                      aria-label="รูปถัดไป"
                      className="size-8 rounded-lg border border-line flex items-center justify-center text-ink hover:bg-hover transition cursor-pointer"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
                <a
                  href={previewSrc}
                  download={previewMeta.downloadName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-ink transition"
                >
                  <Download className="size-3.5" />
                  <span>ดาวน์โหลด</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewIdx(null)}
                  aria-label="ปิดหน้าต่าง"
                  className="size-8 rounded-lg border border-line flex items-center justify-center text-ink hover:bg-hover transition cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-black/10 p-3 flex items-center justify-center min-h-[300px]">
              {previewMeta.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt={previewMeta.label}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow"
                />
              ) : previewMeta.kind === 'pdf' ? (
                <iframe
                  src={previewSrc}
                  title={previewMeta.label}
                  className="w-full h-[75vh] rounded-lg bg-white"
                />
              ) : (
                <div className="text-sm text-ink-mute p-6">{previewSrc}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
