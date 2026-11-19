'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DocumentStructure,
  DocumentTemplateItem,
  FreeformDocumentElement,
  FreeformElementType,
} from '@japjong/shared';
import { Icon } from '@/components/icons';
import { api } from '@/lib/api';
import {
  DATA_BINDING_OPTIONS,
  findBindingLabel,
  getSampleBindingValue,
} from '@/lib/document-bindings';

export const A4_WIDTH_PX = 794; // 210mm at 96dpi
export const A4_HEIGHT_PX = 1123; // 297mm at 96dpi

/**
 * แปลงหน้าแรกของไฟล์ PDF (File หรือ Data URL) ให้เป็นภาพพื้นหลัง A4 แบบไม่มีขอบดำ
 */
async function renderPdfFirstPageToImage(source: ArrayBuffer | string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  let loadingTask;
  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      const base64 = source.split(',')[1] || '';
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      loadingTask = pdfjsLib.getDocument({ data: bytes });
    } else {
      loadingTask = pdfjsLib.getDocument({ url: source });
    }
  } else {
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(source) });
  }

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  // เรนเดอร์ที่ความกว้าง ~1588px (2x A4) เพื่อความคมชัดและขนาดไฟล์เล็ก
  const scale = (A4_WIDTH_PX * 2) / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ไม่สามารถสร้าง Canvas สำหรับเรนเดอร์ PDF ได้');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * แสดงผลพื้นหลังกระดาษ A4 รองรับทั้งไฟล์รูปภาพและไฟล์ PDF (ตัดขอบดำอัตโนมัติ)
 */
export function A4BackgroundLayer({ url, opacity = 1 }: { url?: string; opacity?: number }) {
  const [renderedPdfImg, setRenderedPdfImg] = useState<string | null>(null);
  const isPdf = Boolean(
    url && (url.startsWith('data:application/pdf') || url.toLowerCase().endsWith('.pdf')),
  );

  useEffect(() => {
    let cancelled = false;
    if (!url || !isPdf) {
      setRenderedPdfImg(null);
      return;
    }
    renderPdfFirstPageToImage(url)
      .then((imgUrl) => {
        if (!cancelled) setRenderedPdfImg(imgUrl);
      })
      .catch(() => {
        if (!cancelled) setRenderedPdfImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, isPdf]);

  if (!url) return null;
  const displaySrc = isPdf ? renderedPdfImg : url;
  if (!displaySrc) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
        กำลังแปลงหน้ากระดาษ PDF...
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displaySrc}
      alt="A4 Background"
      draggable={false}
      className="absolute inset-0 w-full h-full object-fill pointer-events-none"
      style={{ opacity }}
    />
  );
}

interface FreeformA4EditorProps {
  template: DocumentTemplateItem;
  doc: DocumentStructure;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  saveError?: string;
  isPublishing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUpdateDoc: (nextDoc: DocumentStructure) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveNow: () => void;
  onPublish: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

type DragInteraction =
  | {
      kind: 'move';
      id: string;
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: 'resize';
      edge: 'e' | 's' | 'se';
      id: string;
      startClientX: number;
      startClientY: number;
      origW: number;
      origH: number;
    };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    reader.readAsDataURL(file);
  });
}

export function FreeformA4Editor({
  template,
  doc,
  saveStatus,
  saveError,
  isPublishing,
  canUndo,
  canRedo,
  onUpdateDoc,
  onUndo,
  onRedo,
  onSaveNow,
  onPublish,
  onClose,
  isModal = false,
}: FreeformA4EditorProps) {
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<DragInteraction | null>(null);

  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const replaceLogoInputRef = useRef<HTMLInputElement | null>(null);

  const elements = doc.freeformElements || [];
  const selectedEl = elements.find((el) => el.id === selectedId) || null;
  const bgOpacity = doc.backgroundOpacity ?? 1;

  // Keep latest doc/zoom in refs for smooth pointermove without re-binding listeners
  const docRef = useRef(doc);
  docRef.current = doc;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const updateElements = useCallback(
    (nextElements: FreeformDocumentElement[]) => {
      onUpdateDoc({
        ...docRef.current,
        editorMode: 'freeform',
        freeformElements: nextElements,
      });
    },
    [onUpdateDoc],
  );

  const updateElementById = useCallback(
    (id: string, patch: Partial<FreeformDocumentElement>) => {
      const next = (docRef.current.freeformElements || []).map((el) =>
        el.id === id ? { ...el, ...patch } : el,
      );
      updateElements(next);
    },
    [updateElements],
  );

  // Pointer drag & resize handling
  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (e: PointerEvent) => {
      const scale = zoomRef.current / 100;
      const dx = (e.clientX - interaction.startClientX) / scale;
      const dy = (e.clientY - interaction.startClientY) / scale;

      const list = docRef.current.freeformElements || [];
      const target = list.find((el) => el.id === interaction.id);
      if (!target) return;

      if (interaction.kind === 'move') {
        const nextX = Math.max(
          0,
          Math.min(A4_WIDTH_PX - target.width, Math.round(interaction.origX + dx)),
        );
        const nextY = Math.max(
          0,
          Math.min(A4_HEIGHT_PX - target.height, Math.round(interaction.origY + dy)),
        );
        updateElementById(interaction.id, { x: nextX, y: nextY });
      } else {
        let nextW = interaction.origW;
        let nextH = interaction.origH;
        if (interaction.edge === 'e' || interaction.edge === 'se') {
          nextW = Math.max(24, Math.min(A4_WIDTH_PX - target.x, Math.round(interaction.origW + dx)));
        }
        if (interaction.edge === 's' || interaction.edge === 'se') {
          nextH = Math.max(
            16,
            Math.min(A4_HEIGHT_PX - target.y, Math.round(interaction.origH + dy)),
          );
        }
        updateElementById(interaction.id, { width: nextW, height: nextH });
      }
    };

    const handlePointerUp = () => {
      setInteraction(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [interaction, updateElementById]);

  // Keyboard nudge & delete for selected element
  useEffect(() => {
    if (mode !== 'design' || !selectedId || editingTextId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const cur = (docRef.current.freeformElements || []).find((el) => el.id === selectedId);
      if (!cur) return;

      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateElementById(cur.id, { x: Math.max(0, cur.x - step) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateElementById(cur.id, { x: Math.min(A4_WIDTH_PX - cur.width, cur.x + step) });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateElementById(cur.id, { y: Math.max(0, cur.y - step) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateElementById(cur.id, { y: Math.min(A4_HEIGHT_PX - cur.height, cur.y + step) });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        updateElements((docRef.current.freeformElements || []).filter((el) => el.id !== cur.id));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, selectedId, editingTextId, updateElementById, updateElements]);

  // Upload A4 Background Image or PDF
  const handleUploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!file.type.startsWith('image/') && !isPdf) {
      alert('กรุณาเลือกไฟล์รูปภาพ (PNG, JPG, WebP, SVG) หรือไฟล์ PDF สำหรับกระดาษ A4');
      return;
    }
    try {
      const dataUrl = isPdf
        ? await renderPdfFirstPageToImage(await file.arrayBuffer())
        : await readFileAsDataUrl(file);
      onUpdateDoc({
        ...doc,
        editorMode: 'freeform',
        backgroundImageUrl: dataUrl,
        backgroundOpacity: doc.backgroundOpacity ?? 1,
      });
    } catch (err) {
      alert((err as Error).message || 'อัปโหลดพื้นหลังไม่สำเร็จ');
    }
  };

  // Upload Logo & Place onto A4 Canvas
  const handleUploadNewLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพโลโก้ (PNG, JPG, WebP, SVG)');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const newLogo: FreeformDocumentElement = {
        id: `el_${Date.now()}`,
        type: 'logo',
        x: Math.round((A4_WIDTH_PX - 96) / 2),
        y: 48,
        width: 96,
        height: 96,
        imageUrl: dataUrl,
      };
      updateElements([...elements, newLogo]);
      setSelectedId(newLogo.id);
    } catch (err) {
      alert((err as Error).message || 'อัปโหลดโลโก้ไม่สำเร็จ');
    }
  };

  // Replace selected Logo image
  const handleReplaceLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEl || selectedEl.type !== 'logo') return;
    e.target.value = '';
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateElementById(selectedEl.id, { imageUrl: dataUrl });
    } catch (err) {
      alert((err as Error).message || 'เปลี่ยนรูปโลโก้ไม่สำเร็จ');
    }
  };

  // Add component onto A4 canvas
  const handleAddElement = (
    type: FreeformElementType,
    preset?: Partial<FreeformDocumentElement>,
  ) => {
    const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const offset = (elements.length % 6) * 18;
    let base: FreeformDocumentElement;

    if (type === 'text') {
      base = {
        id,
        type: 'text',
        x: 72 + offset,
        y: 160 + offset,
        width: preset?.width ?? 280,
        height: preset?.height ?? 34,
        fontSize: preset?.fontSize ?? 16,
        fontWeight: preset?.fontWeight ?? 'normal',
        textAlign: preset?.textAlign ?? 'left',
        color: '#0f172a',
        text: preset?.text ?? 'ข้อความเอกสารราชการ',
      };
    } else if (type === 'slot') {
      const binding = preset?.binding ?? 'requester.name';
      base = {
        id,
        type: 'slot',
        x: 72 + offset,
        y: 240 + offset,
        width: preset?.width ?? 220,
        height: preset?.height ?? 30,
        fontSize: preset?.fontSize ?? 16,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#0f172a',
        binding,
        label: preset?.label ?? findBindingLabel(binding),
        showBorderBottom: true,
      };
    } else if (type === 'signature') {
      base = {
        id,
        type: 'signature',
        x: 420,
        y: 820 + (elements.length % 3) * 20,
        width: 260,
        height: 110,
        fontSize: 15,
        fontWeight: 'normal',
        textAlign: 'center',
        color: '#0f172a',
        text: 'ผู้ยื่นคำขอ',
        signatureRole: 'requester',
      };
    } else if (type === 'divider') {
      base = {
        id,
        type: 'divider',
        x: 72,
        y: 210 + offset,
        width: 650,
        height: 12,
        color: '#334155',
      };
    } else {
      base = {
        id,
        type: 'logo',
        x: 349,
        y: 48,
        width: 96,
        height: 96,
      };
    }

    updateElements([...elements, base]);
    setSelectedId(id);
  };

  const handleDuplicateSelected = () => {
    if (!selectedEl) return;
    const copy: FreeformDocumentElement = {
      ...selectedEl,
      id: `el_${Date.now()}`,
      x: Math.min(A4_WIDTH_PX - selectedEl.width, selectedEl.x + 20),
      y: Math.min(A4_HEIGHT_PX - selectedEl.height, selectedEl.y + 20),
    };
    updateElements([...elements, copy]);
    setSelectedId(copy.id);
  };

  const handleDeleteSelected = () => {
    if (!selectedEl) return;
    updateElements(elements.filter((el) => el.id !== selectedEl.id));
    setSelectedId(null);
  };

  return (
    <div className={`${isModal ? 'fixed inset-0 z-50 h-screen' : 'min-h-screen'} bg-slate-100 flex flex-col`}>
      {/* Hidden File Inputs */}
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        onChange={handleUploadBackground}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadNewLogo}
      />
      <input
        ref={replaceLogoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReplaceLogo}
      />

      {/* Top Action Bar */}
      <header className="h-14 bg-white border-b border-line px-4 flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-ink-mute hover:text-ink hover:bg-soft transition"
              title="ปิดตัวแก้ไข"
            >
              <Icon name="arrow-left" className="w-5 h-5" />
            </button>
          ) : (
            <Link
              href="/admin/document-templates"
              className="p-2 rounded-lg text-ink-mute hover:text-ink hover:bg-soft transition"
              title="กลับไปหน้ารายการแม่แบบ"
            >
              <Icon name="arrow-left" className="w-5 h-5" />
            </Link>
          )}
          <div className="h-6 w-px bg-line" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-ink text-sm truncate max-w-[200px] sm:max-w-[300px]">
                {template.name}
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                Freeform A4
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                v{template.currentVersion}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink-mute">
              {saveStatus === 'saving' && <span className="text-amber-600">กำลังบันทึกอัตโนมัติ...</span>}
              {saveStatus === 'saved' && <span className="text-emerald-600">✓ บันทึกแล้ว</span>}
              {saveStatus === 'dirty' && <span className="text-slate-500">รอการบันทึก...</span>}
              {saveStatus === 'error' && (
                <span className="text-red-500" title={saveError}>
                  บันทึกล้มเหลว{saveError ? `: ${saveError}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center Controls: Undo/Redo, Design/Preview, Zoom */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-line rounded-lg bg-soft/50 p-0.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              className="p-1.5 rounded text-ink-mute hover:text-ink disabled:opacity-30"
              title="ย้อนกลับ (Undo)"
            >
              <Icon name="rotate-ccw" className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              className="p-1.5 rounded text-ink-mute hover:text-ink disabled:opacity-30"
              title="ทำซ้ำ (Redo)"
            >
              <Icon name="rotate-cw" className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center border border-line rounded-lg bg-soft p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('design');
                setEditingTextId(null);
              }}
              className={`px-3 py-1 rounded-md font-medium transition ${
                mode === 'design' ? 'bg-white text-brand shadow-xs font-semibold' : 'text-ink-mute hover:text-ink'
              }`}
            >
              โหมดออกแบบ
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('preview');
                setSelectedId(null);
                setEditingTextId(null);
              }}
              className={`px-3 py-1 rounded-md font-medium transition ${
                mode === 'preview' ? 'bg-white text-brand shadow-xs font-semibold' : 'text-ink-mute hover:text-ink'
              }`}
            >
              ดูตัวอย่างจริง
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-1 border border-line rounded-lg px-2 py-1 text-xs bg-white">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="text-ink-mute hover:text-ink px-1"
            >
              −
            </button>
            <span className="w-10 text-center font-mono text-ink">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(150, z + 10))}
              className="text-ink-mute hover:text-ink px-1"
            >
              +
            </button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/document-templates/${template.id}/preview`}
            className="jw-btn-sec text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <Icon name="eye" className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">พิมพ์</span>
          </Link>
          <button
            type="button"
            onClick={onSaveNow}
            className="jw-btn-sec text-xs px-3 py-1.5 border-brand text-brand hover:bg-brand-mint/30"
          >
            บันทึก
          </button>
          <button
            type="button"
            disabled={isPublishing}
            onClick={onPublish}
            className="jw-btn text-xs px-3.5 py-1.5 flex items-center gap-1.5"
          >
            <Icon name="check" className="w-3.5 h-3.5" />
            <span>{isPublishing ? 'กำลังเผยแพร่...' : 'เผยแพร่'}</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        {mode === 'design' && (
          <aside className="w-72 bg-white border-r border-line p-4 flex flex-col gap-5 overflow-y-auto shrink-0">
            {/* 1. อัปโหลดกระดาษ A4 */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2.5">
                1. กระดาษพื้นหลัง A4
              </h2>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => bgInputRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-brand/40 bg-brand-mint/20 hover:bg-brand-mint/40 text-brand text-xs font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Icon name="photo" className="w-4 h-4" />
                  <span>{doc.backgroundImageUrl ? 'เปลี่ยนกระดาษพื้นหลัง A4' : 'อัปโหลดกระดาษ A4 (รูปภาพ / PDF)'}</span>
                </button>

                {doc.backgroundImageUrl && (
                  <div className="p-2.5 rounded-xl bg-soft border border-line space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-ink">
                      <span>ความเข้มพื้นหลัง</span>
                      <span className="font-mono font-semibold">{Math.round(bgOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(bgOpacity * 100)}
                      onChange={(e) =>
                        onUpdateDoc({
                          ...doc,
                          editorMode: 'freeform',
                          backgroundOpacity: Number(e.target.value) / 100,
                        })
                      }
                      className="w-full accent-brand"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDoc({
                          ...doc,
                          editorMode: 'freeform',
                          backgroundImageUrl: undefined,
                        })
                      }
                      className="w-full py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-medium transition"
                    >
                      ลบกระดาษพื้นหลัง
                    </button>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded border-line accent-brand"
                  />
                  <span>แสดงเส้นตารางช่วยจัดตำแหน่ง</span>
                </label>
              </div>
            </div>

            {/* 2. อัปโหลดโลโก้ */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2.5">
                2. โลโก้ / ตราสัญลักษณ์
              </h2>
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-xl border border-line bg-soft hover:border-brand hover:bg-brand-mint/30 text-ink text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <Icon name="upload" className="w-4 h-4 text-brand" />
                <span>อัปโหลดโลโก้ลงกระดาษ A4</span>
              </button>
            </div>

            {/* 3. คอมโพเนนต์เอกสารราชการ */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2.5">
                3. คอมโพเนนต์เอกสารราชการ
              </h2>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleAddElement('text', {
                      text: 'แบบขอใช้สถานที่ราชการ',
                      fontSize: 22,
                      fontWeight: 'bold',
                      textAlign: 'center',
                      width: 360,
                      height: 40,
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/30 text-left text-xs transition flex items-center gap-2.5"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">
                    H
                  </span>
                  <div>
                    <b className="block text-ink">หัวเรื่องเอกสาร</b>
                    <span className="text-[11px] text-ink-mute">ข้อความตัวหนาจัดกลาง</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddElement('text')}
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/30 text-left text-xs transition flex items-center gap-2.5"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                    T
                  </span>
                  <div>
                    <b className="block text-ink">ข้อความอิสระ</b>
                    <span className="text-[11px] text-ink-mute">พิมพ์ข้อความ ปรับขนาดอักษรได้</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddElement('slot', { binding: 'requester.name' })}
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/30 text-left text-xs transition flex items-center gap-2.5"
                >
                  <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono font-bold">
                    {'{}'}
                  </span>
                  <div>
                    <b className="block text-ink">ช่องดึงข้อมูล (ตัวแปรไดนามิก)</b>
                    <span className="text-[11px] text-ink-mute">ผูกชื่อ วันที่ สถานที่ ฯลฯ</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddElement('slot', { binding: 'manual.blank', label: 'ช่องเขียนมือ' })}
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/30 text-left text-xs transition flex items-center gap-2.5"
                >
                  <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-mono">
                    __
                  </span>
                  <div>
                    <b className="block text-ink">ช่องว่างเขียนมือ</b>
                    <span className="text-[11px] text-ink-mute">เส้นประเปล่า ปรับความกว้างได้</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddElement('signature')}
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/30 text-left text-xs transition flex items-center gap-2.5"
                >
                  <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Icon name="edit" className="w-4 h-4" />
                  </span>
                  <div>
                    <b className="block text-ink">กล่องลงนามลายมือชื่อ</b>
                    <span className="text-[11px] text-ink-mute">ลงชื่อ + ตำแหน่ง</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddElement('divider')}
                  className="w-full p-2.5 rounded-xl border border-line hover:border-brand hover:bg-brand-mint/30 text-left text-xs transition flex items-center gap-2.5"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                    ―
                  </span>
                  <div>
                    <b className="block text-ink">เส้นคั่นแนวนอน</b>
                    <span className="text-[11px] text-ink-mute">ปรับความยาวอิสระ</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-auto p-3 rounded-xl bg-soft border border-line text-[11px] text-ink-mute space-y-1">
              <p className="font-semibold text-ink">วิธีใช้งาน</p>
              <p>• คลิกที่คอมโพเนนต์บนกระดาษแล้วลากเพื่อย้ายตำแหน่งอิสระ</p>
              <p>• ลากจุดมุม/ขอบสีฟ้าเพื่อปรับขนาดช่องข้อมูล</p>
              <p>• ใช้ปุ่มลูกศรบนคีย์บอร์ดเพื่อขยับทีละ 1px (Shift + ลูกศร = 10px)</p>
            </div>
          </aside>
        )}

        {/* Center A4 Canvas Area */}
        <main
          className="flex-1 overflow-auto p-6 md:p-10 flex justify-center items-start bg-slate-200/70"
          onClick={() => {
            setSelectedId(null);
            setEditingTextId(null);
          }}
        >
          <div
            className="origin-top transition-transform duration-150"
            style={{
              width: A4_WIDTH_PX,
              height: A4_HEIGHT_PX,
              transform: `scale(${zoom / 100})`,
              marginBottom: `${((zoom - 100) / 100) * A4_HEIGHT_PX}px`,
            }}
          >
            <div
              className="relative bg-white shadow-2xl border border-slate-300 overflow-hidden select-none"
              style={{
                width: A4_WIDTH_PX,
                height: A4_HEIGHT_PX,
                fontFamily: "'TH Sarabun New', 'Sarabun', sans-serif",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Uploaded A4 Paper Background (Image or PDF) */}
              <A4BackgroundLayer url={doc.backgroundImageUrl} opacity={bgOpacity} />

              {/* Optional Grid Overlay in Design Mode */}
              {mode === 'design' && showGrid && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-30"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />
              )}

              {/* Empty state hint */}
              {mode === 'design' && elements.length === 0 && !doc.backgroundImageUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none p-8 text-center">
                  <Icon name="file-text" className="w-12 h-12 mb-3 opacity-40" />
                  <p className="text-lg font-semibold text-slate-500">กระดาษ A4 เปล่า (794 × 1123 px)</p>
                  <p className="text-sm mt-1">
                    อัปโหลดภาพกระดาษ A4, อัปโหลดโลโก้ หรือคลิกเพิ่มคอมโพเนนต์จากแถบเครื่องมือด้านซ้าย
                  </p>
                </div>
              )}

              {/* Freeform Positioned Elements */}
              {elements.map((el) => {
                const isSelected = mode === 'design' && selectedId === el.id;
                const isEditing = mode === 'design' && editingTextId === el.id;
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
                    className={`group ${
                      mode === 'design' ? 'cursor-move' : ''
                    } ${
                      isSelected
                        ? 'ring-2 ring-brand bg-brand/5 z-20'
                        : mode === 'design'
                          ? 'hover:ring-1 hover:ring-brand/50 z-10'
                          : 'z-10'
                    }`}
                    onPointerDown={(e) => {
                      if (mode !== 'design' || isEditing) return;
                      e.stopPropagation();
                      setSelectedId(el.id);
                      setInteraction({
                        kind: 'move',
                        id: el.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origX: el.x,
                        origY: el.y,
                      });
                    }}
                    onDoubleClick={(e) => {
                      if (mode !== 'design') return;
                      e.stopPropagation();
                      if (el.type === 'text') {
                        setEditingTextId(el.id);
                      }
                    }}
                  >
                    {/* Element Content */}
                    {el.type === 'text' && (
                      isEditing ? (
                        <textarea
                          autoFocus
                          value={el.text || ''}
                          onChange={(e) => updateElementById(el.id, { text: e.target.value })}
                          onBlur={() => setEditingTextId(null)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full h-full bg-white/90 border border-brand rounded px-1 outline-none resize-none"
                          style={{
                            fontSize: `${fontSize}px`,
                            fontWeight: el.fontWeight || 'normal',
                            textAlign: el.textAlign || 'left',
                            color: el.color || '#0f172a',
                          }}
                        />
                      ) : (
                        <div className="w-full h-full overflow-hidden whitespace-pre-wrap break-words px-1 flex items-center"
                          style={{
                            justifyContent:
                              el.textAlign === 'center'
                                ? 'center'
                                : el.textAlign === 'right'
                                  ? 'flex-end'
                                  : 'flex-start',
                          }}
                        >
                          {el.text || 'ข้อความ'}
                        </div>
                      )
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
                        {mode === 'design' ? (
                          <span className="text-brand font-sans text-[11px] bg-brand-mint/60 px-1.5 py-0.5 rounded truncate max-w-full">
                            {el.label || findBindingLabel(el.binding)} ({el.binding || 'manual.blank'})
                          </span>
                        ) : (
                          <span className="truncate">
                            {getSampleBindingValue(el.binding) || '\u00A0'}
                          </span>
                        )}
                      </div>
                    )}

                    {el.type === 'logo' && (
                      el.imageUrl ? (
                        <img
                          src={el.imageUrl}
                          alt="Logo"
                          draggable={false}
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      ) : (
                        <div className="w-full h-full border border-dashed border-slate-400 flex items-center justify-center text-xs text-slate-400">
                          โลโก้
                        </div>
                      )
                    )}

                    {el.type === 'signature' && (
                      <div className="w-full h-full flex flex-col items-center justify-end pb-1 text-center">
                        <div className="w-4/5 border-b border-dotted border-slate-700 mb-1" />
                        <div className="text-slate-700" style={{ fontSize: `${fontSize}px` }}>
                          (................................................)
                        </div>
                        <div className="font-medium mt-0.5" style={{ fontSize: `${fontSize}px` }}>
                          {el.text || 'ผู้ลงนาม'}
                        </div>
                      </div>
                    )}

                    {el.type === 'divider' && (
                      <div className="w-full h-full flex items-center">
                        <div
                          className="w-full border-t-2"
                          style={{ borderColor: el.color || '#334155' }}
                        />
                      </div>
                    )}

                    {/* Resize Handles (Design Mode & Selected) */}
                    {isSelected && (
                      <>
                        {/* Right edge resize (width) */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setInteraction({
                              kind: 'resize',
                              edge: 'e',
                              id: el.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              origW: el.width,
                              origH: el.height,
                            });
                          }}
                          className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-5 bg-white border-2 border-brand rounded-sm cursor-ew-resize shadow-xs"
                          title="ลากเพื่อปรับความกว้าง"
                        />
                        {/* Bottom edge resize (height) */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setInteraction({
                              kind: 'resize',
                              edge: 's',
                              id: el.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              origW: el.width,
                              origH: el.height,
                            });
                          }}
                          className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-5 h-3 bg-white border-2 border-brand rounded-sm cursor-ns-resize shadow-xs"
                          title="ลากเพื่อปรับความสูง"
                        />
                        {/* Corner resize (width + height) */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setInteraction({
                              kind: 'resize',
                              edge: 'se',
                              id: el.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              origW: el.width,
                              origH: el.height,
                            });
                          }}
                          className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-brand border-2 border-white rounded-full cursor-nwse-resize shadow-sm"
                          title="ลากเพื่อปรับขนาด"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Right Properties Panel */}
        {mode === 'design' && (
          <aside className="w-80 bg-white border-l border-line p-4 overflow-y-auto shrink-0 space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-mute pb-2 border-b border-line">
              คุณสมบัติคอมโพเนนต์
            </h2>

            {selectedEl ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs bg-soft px-3 py-2 rounded-lg border border-line">
                  <span className="font-semibold text-ink">
                    ประเภท:{' '}
                    {selectedEl.type === 'text'
                      ? 'ข้อความ'
                      : selectedEl.type === 'slot'
                        ? 'ช่องตัวแปรไดนามิก'
                        : selectedEl.type === 'logo'
                          ? 'โลโก้'
                          : selectedEl.type === 'signature'
                            ? 'กล่องลงนาม'
                            : 'เส้นคั่น'}
                  </span>
                  <span className="font-mono text-[10px] text-ink-mute">{selectedEl.id.slice(-6)}</span>
                </div>

                {/* ตำแหน่ง X, Y และขนาด Field W, H */}
                <div>
                  <label className="jw-lbl">ตำแหน่งและขนาดช่อง (px)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-ink-mute">X (ซ้าย-ขวา)</span>
                      <input
                        type="number"
                        min={0}
                        max={A4_WIDTH_PX}
                        value={selectedEl.x}
                        onChange={(e) =>
                          updateElementById(selectedEl.id, {
                            x: Math.max(0, Math.min(A4_WIDTH_PX - selectedEl.width, Number(e.target.value) || 0)),
                          })
                        }
                        className="jw-in text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-ink-mute">Y (บน-ล่าง)</span>
                      <input
                        type="number"
                        min={0}
                        max={A4_HEIGHT_PX}
                        value={selectedEl.y}
                        onChange={(e) =>
                          updateElementById(selectedEl.id, {
                            y: Math.max(0, Math.min(A4_HEIGHT_PX - selectedEl.height, Number(e.target.value) || 0)),
                          })
                        }
                        className="jw-in text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-ink-mute">กว้าง (W)</span>
                      <input
                        type="number"
                        min={24}
                        max={A4_WIDTH_PX}
                        value={selectedEl.width}
                        onChange={(e) =>
                          updateElementById(selectedEl.id, {
                            width: Math.max(24, Math.min(A4_WIDTH_PX - selectedEl.x, Number(e.target.value) || 24)),
                          })
                        }
                        className="jw-in text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-ink-mute">สูง (H)</span>
                      <input
                        type="number"
                        min={16}
                        max={A4_HEIGHT_PX}
                        value={selectedEl.height}
                        onChange={(e) =>
                          updateElementById(selectedEl.id, {
                            height: Math.max(16, Math.min(A4_HEIGHT_PX - selectedEl.y, Number(e.target.value) || 16)),
                          })
                        }
                        className="jw-in text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* ขนาดตัวอักษร & การจัดรูปแบบข้อความ */}
                {(selectedEl.type === 'text' ||
                  selectedEl.type === 'slot' ||
                  selectedEl.type === 'signature') && (
                  <div className="space-y-3 pt-2 border-t border-line">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="jw-lbl mb-0">ขนาดตัวอักษร (Font Size)</label>
                        <span className="text-xs font-mono font-semibold text-brand">
                          {selectedEl.fontSize ?? 16} px
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={10}
                          max={48}
                          value={selectedEl.fontSize ?? 16}
                          onChange={(e) =>
                            updateElementById(selectedEl.id, { fontSize: Number(e.target.value) })
                          }
                          className="flex-1 accent-brand"
                        />
                        <input
                          type="number"
                          min={10}
                          max={72}
                          value={selectedEl.fontSize ?? 16}
                          onChange={(e) =>
                            updateElementById(selectedEl.id, {
                              fontSize: Math.max(10, Math.min(72, Number(e.target.value) || 16)),
                            })
                          }
                          className="w-16 jw-in text-xs font-mono text-center"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateElementById(selectedEl.id, {
                            fontWeight: selectedEl.fontWeight === 'bold' ? 'normal' : 'bold',
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition ${
                          selectedEl.fontWeight === 'bold'
                            ? 'bg-brand text-white border-brand'
                            : 'bg-soft text-ink border-line hover:border-brand'
                        }`}
                      >
                        B ตัวหนา
                      </button>

                      <div className="flex-1 grid grid-cols-3 gap-1">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => updateElementById(selectedEl.id, { textAlign: align })}
                            className={`py-1.5 rounded-lg border text-xs transition ${
                              (selectedEl.textAlign || 'left') === align
                                ? 'bg-brand text-white border-brand font-semibold'
                                : 'bg-soft text-ink border-line hover:border-brand'
                            }`}
                          >
                            {align === 'left' ? 'ซ้าย' : align === 'center' ? 'กลาง' : 'ขวา'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* เนื้อหาข้อความ (Text) */}
                {selectedEl.type === 'text' && (
                  <div className="pt-2 border-t border-line">
                    <label className="jw-lbl">ข้อความ</label>
                    <textarea
                      rows={3}
                      value={selectedEl.text || ''}
                      onChange={(e) => updateElementById(selectedEl.id, { text: e.target.value })}
                      className="jw-in text-xs"
                    />
                  </div>
                )}

                {/* การผูกตัวแปร (Slot) */}
                {selectedEl.type === 'slot' && (
                  <div className="space-y-3 pt-2 border-t border-line">
                    <div>
                      <label className="jw-lbl">ผูกตัวแปรไดนามิก (Data Binding)</label>
                      <select
                        value={selectedEl.binding || 'manual.blank'}
                        onChange={(e) => {
                          const binding = e.target.value;
                          updateElementById(selectedEl.id, {
                            binding,
                            label: findBindingLabel(binding),
                          });
                        }}
                        className="jw-in text-xs"
                      >
                        {DATA_BINDING_OPTIONS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.items.map((it) => (
                              <option key={it.key} value={it.key}>
                                {it.label} ({it.key})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="jw-lbl">ป้ายกำกับช่องข้อมูล</label>
                      <input
                        type="text"
                        value={selectedEl.label || ''}
                        onChange={(e) => updateElementById(selectedEl.id, { label: e.target.value })}
                        className="jw-in text-xs"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEl.showBorderBottom !== false}
                        onChange={(e) =>
                          updateElementById(selectedEl.id, { showBorderBottom: e.target.checked })
                        }
                        className="rounded border-line accent-brand"
                      />
                      <span>แสดงเส้นประใต้ช่องข้อมูล</span>
                    </label>
                  </div>
                )}

                {/* โลโก้ (Logo) */}
                {selectedEl.type === 'logo' && (
                  <div className="pt-2 border-t border-line">
                    <button
                      type="button"
                      onClick={() => replaceLogoInputRef.current?.click()}
                      className="w-full py-2 rounded-lg border border-brand text-brand hover:bg-brand-mint/30 text-xs font-semibold transition"
                    >
                      เปลี่ยนรูปโลโก้
                    </button>
                  </div>
                )}

                {/* กล่องลงนาม (Signature) */}
                {selectedEl.type === 'signature' && (
                  <div className="pt-2 border-t border-line">
                    <label className="jw-lbl">ชื่อตำแหน่งผู้ลงนาม</label>
                    <input
                      type="text"
                      value={selectedEl.text || ''}
                      onChange={(e) => updateElementById(selectedEl.id, { text: e.target.value })}
                      className="jw-in text-xs"
                      placeholder="เช่น ผู้ยื่นคำขอ / ผู้อนุมัติ"
                    />
                  </div>
                )}

                {/* ทำสำเนา / ลบ */}
                <div className="pt-3 border-t border-line flex gap-2">
                  <button
                    type="button"
                    onClick={handleDuplicateSelected}
                    className="flex-1 py-1.5 rounded-lg border border-line text-ink hover:bg-soft text-xs font-medium transition"
                  >
                    ทำสำเนา
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="flex-1 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition"
                  >
                    ลบออก
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-ink-mute text-xs space-y-2">
                <p>คลิกที่คอมโพเนนต์บนกระดาษ A4 เพื่อปรับตำแหน่ง ขนาดช่อง และขนาดตัวอักษร</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * Wrapper แบบ Modal พร้อมระบบ Undo/Redo, Auto-save, Save และ Publish ในตัว
 * ใช้สำหรับเปิดแก้ไขแม่แบบเอกสารจากหน้า /staff/resources
 */
export function FreeformTemplateEditorModal({
  template: initialTemplate,
  onClose,
  onSaved,
}: {
  template: DocumentTemplateItem;
  onClose: () => void;
  onSaved?: (updated: DocumentTemplateItem) => void;
}) {
  const [template, setTemplate] = useState<DocumentTemplateItem>(initialTemplate);
  const [doc, setDoc] = useState<DocumentStructure>(() => ({
    ...initialTemplate.structure,
    editorMode: 'freeform',
    freeformElements: initialTemplate.structure?.freeformElements || [],
  }));
  const [history, setHistory] = useState<DocumentStructure[]>([doc]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  const updateDoc = useCallback((nextDoc: DocumentStructure) => {
    setDoc(nextDoc);
    setSaveStatus('dirty');
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      return [...sliced, nextDoc].slice(-30);
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 29));
  }, [historyIdx]);

  const handleUndo = () => {
    if (historyIdx <= 0) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    setDoc(history[nextIdx]);
    setSaveStatus('dirty');
  };

  const handleRedo = () => {
    if (historyIdx >= history.length - 1) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setDoc(history[nextIdx]);
    setSaveStatus('dirty');
  };

  useEffect(() => {
    if (saveStatus !== 'dirty') return;
    const timer = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        setSaveError('');
        const updated = await api.updateDocumentTemplate(template.id, { structure: doc });
        setTemplate(updated);
        setSaveStatus('saved');
        onSaved?.(updated);
      } catch (err) {
        setSaveError((err as Error).message || '');
        setSaveStatus('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [doc, saveStatus, template.id, onSaved]);

  const handleSaveNow = async () => {
    try {
      setSaveStatus('saving');
      setSaveError('');
      const updated = await api.updateDocumentTemplate(template.id, { structure: doc });
      setTemplate(updated);
      setSaveStatus('saved');
      onSaved?.(updated);
    } catch (err) {
      setSaveError((err as Error).message || '');
      setSaveStatus('error');
    }
  };

  const handlePublish = async () => {
    const note = prompt('บันทึกหมายเหตุการเผยแพร่เวอร์ชันใหม่ (ถ้ามี):', 'อัปเดตแม่แบบกระดาษ A4');
    if (note === null) return;
    setIsPublishing(true);
    try {
      await api.updateDocumentTemplate(template.id, { structure: doc });
      const pub = await api.publishDocumentTemplate(template.id, note);
      setTemplate(pub);
      setSaveStatus('saved');
      onSaved?.(pub);
      alert(`เผยแพร่สำเร็จ! เวอร์ชันปัจจุบัน v${pub.currentVersion}`);
    } catch (err) {
      alert((err as Error).message || 'เผยแพร่ไม่สำเร็จ');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <FreeformA4Editor
      isModal={true}
      template={template}
      doc={doc}
      saveStatus={saveStatus}
      saveError={saveError}
      isPublishing={isPublishing}
      canUndo={historyIdx > 0}
      canRedo={historyIdx < history.length - 1}
      onUpdateDoc={updateDoc}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onSaveNow={handleSaveNow}
      onPublish={handlePublish}
      onClose={onClose}
    />
  );
}
