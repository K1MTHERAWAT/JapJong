'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  DocumentDataSlot,
  DocumentStructure,
  DocumentTemplateItem,
} from '@japjong/shared';
import { Icon } from '@/components/icons';
import { api } from '@/lib/api';

const DATA_BINDING_OPTIONS = [
  { group: 'ข้อมูลผู้ยื่นคำขอ', items: [
    { key: 'requester.name', label: 'ชื่อ-นามสกุลผู้ขอ' },
    { key: 'requester.position', label: 'ตำแหน่ง' },
    { key: 'requester.phone', label: 'เบอร์โทรศัพท์' },
    { key: 'requester.organization', label: 'หน่วยงาน / สังกัด' },
    { key: 'requester.citizenId', label: 'เลขประจำตัวประชาชน' },
    { key: 'requester.address', label: 'ที่อยู่' },
  ]},
  { group: 'ข้อมูลคำขอ / วันเวลา', items: [
    { key: 'document.number', label: 'เลขที่เอกสารคำขอ' },
    { key: 'document.writtenAt', label: 'สถานที่เขียน' },
    { key: 'document.day', label: 'วันที่ (ตัวเลข)' },
    { key: 'document.month', label: 'เดือน (ภาษาไทย)' },
    { key: 'document.year', label: 'ปี พ.ศ.' },
    { key: 'booking.startDate', label: 'วันที่เริ่มใช้' },
    { key: 'booking.endDate', label: 'วันที่สิ้นสุด' },
    { key: 'booking.location', label: 'สถานที่ที่ขอใช้' },
    { key: 'booking.purpose', label: 'วัตถุประสงค์การใช้' },
  ]},
  { group: 'ข้อมูลครุภัณฑ์ / อุปกรณ์', items: [
    { key: 'equipment.name', label: 'ชื่อครุภัณฑ์' },
    { key: 'equipment.assetCode', label: 'รหัสครุภัณฑ์' },
    { key: 'equipment.quantity', label: 'จำนวนที่ขอยืม' },
  ]},
  { group: 'ช่องว่างเขียนมือ (ไม่ผูกข้อมูล)', items: [
    { key: 'manual.blank', label: 'ช่องว่างสำหรับกรอกด้วยมือ' },
  ]},
];

type SelectedType = 'title' | 'writtenAt' | 'subject' | 'recipient' | 'clause' | 'purpose' | 'closing' | 'slot' | 'logo' | 'signature' | null;

export default function DocumentEditorWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = String(params.id || '');

  const [template, setTemplate] = useState<DocumentTemplateItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor states
  const [doc, setDoc] = useState<DocumentStructure>({
    title: 'แบบขอใช้สถานที่ราชการ',
    writtenAt: 'ที่ทำการองค์การบริหารส่วนตำบล',
    writtenDate: '',
    subject: 'ขออนุญาตใช้สถานที่ราชการ',
    recipient: 'ผู้มีอำนาจอนุมัติ',
    requesterClause: 'ข้าพเจ้า',
    requesterSlots: [
      { id: 's1', label: 'ชื่อ-นามสกุลผู้ขอ', width: 220, binding: 'requester.name' },
      { id: 's2', label: 'ตำแหน่ง', width: 160, binding: 'requester.position' },
      { id: 's3', label: 'หน่วยงาน/สังกัด', width: 180, binding: 'requester.organization' },
      { id: 's4', label: 'เบอร์โทรศัพท์', width: 140, binding: 'requester.phone' },
    ],
    purposeText: 'มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้',
    purposeItems: [{ id: 'p1', target: '', purpose: '' }],
    closingText: 'จึงเรียนมาเพื่อโปรดพิจารณาอนุญาต',
    signatures: [
      { id: 'sig1', role: 'requester', title: 'ผู้ยื่นคำขอ' },
      { id: 'sig2', role: 'staff', title: 'เจ้าหน้าที่ผู้ตรวจสอบ' },
      { id: 'sig3', role: 'approver_l2', title: 'ผู้อนุมัติระดับ 2 (ปลัด อบต.)' },
      { id: 'sig4', role: 'approver_l1', title: 'ผู้อนุมัติระดับ 1 (นายก อบต.)' },
    ],
    customSlots: [],
  });

  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState<number>(100);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [isPublishing, setIsPublishing] = useState(false);

  // Undo / Redo
  const [history, setHistory] = useState<DocumentStructure[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  // Selection
  const [selectedType, setSelectedType] = useState<SelectedType>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedSigId, setSelectedSigId] = useState<string | null>(null);

  // Drag & Drop reorder states
  const [draggedSlotIdx, setDraggedSlotIdx] = useState<number | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!templateId) return;
      try {
        setLoading(true);
        const t = await api.getDocumentTemplate(templateId);
        setTemplate(t);
        if (t.structure) {
          setDoc(t.structure);
          setHistory([t.structure]);
          setHistoryIdx(0);
        }
      } catch (err) {
        setError((err as Error).message || 'ไม่สามารถโหลดแม่แบบเอกสารได้');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [templateId]);

  // Update doc & record history
  const updateDoc = (newDoc: DocumentStructure) => {
    setDoc(newDoc);
    setSaveStatus('dirty');
    const newHist = history.slice(0, historyIdx + 1);
    newHist.push(newDoc);
    setHistory(newHist);
    setHistoryIdx(newHist.length - 1);
  };

  const handleUndo = () => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setDoc(history[historyIdx - 1]);
      setSaveStatus('dirty');
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setDoc(history[historyIdx + 1]);
      setSaveStatus('dirty');
    }
  };

  // Auto-save debounced
  useEffect(() => {
    if (saveStatus !== 'dirty' || !templateId) return;
    const timer = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await api.updateDocumentTemplate(templateId, { structure: doc });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [doc, saveStatus, templateId]);

  const handleSaveManual = async () => {
    if (!templateId) return;
    try {
      setSaveStatus('saving');
      await api.updateDocumentTemplate(templateId, { structure: doc });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  const handlePublish = async () => {
    if (!templateId) return;
    const note = prompt('บันทึกหมายเหตุการ Publish เวอร์ชันใหม่ (ถ้ามี):', 'ปรับปรุงรูปแบบเอกสารราชการ');
    if (note === null) return;
    setIsPublishing(true);
    try {
      // First save current structure
      await api.updateDocumentTemplate(templateId, { structure: doc });
      const pub = await api.publishDocumentTemplate(templateId, note);
      setTemplate(pub);
      setSaveStatus('saved');
      alert(`Publish สำเร็จ! ตอนนี้เป็นเวอร์ชัน v${pub.currentVersion}`);
    } catch (err) {
      alert((err as Error).message || 'Publish ไม่สำเร็จ');
    } finally {
      setIsPublishing(false);
    }
  };

  // Add Data Slot
  const handleAddDataSlot = (presetBinding?: string, label?: string) => {
    const newSlot: DocumentDataSlot = {
      id: `slot-${Date.now()}`,
      label: label || 'ช่องข้อมูลใหม่',
      width: 200,
      binding: presetBinding || 'manual.blank',
    };
    updateDoc({
      ...doc,
      requesterSlots: [...doc.requesterSlots, newSlot],
    });
    setSelectedType('slot');
    setSelectedSlotId(newSlot.id);
  };

  // Resize Slot
  const resizeSlot = (slotId: string, delta: number) => {
    const updateSlots = (slots: DocumentDataSlot[]) =>
      slots.map((s) => (s.id === slotId ? { ...s, width: Math.max(40, Math.min(600, s.width + delta)) } : s));

    updateDoc({
      ...doc,
      requesterSlots: updateSlots(doc.requesterSlots),
      customSlots: doc.customSlots ? updateSlots(doc.customSlots) : [],
    });
  };

  const setSlotWidth = (slotId: string, width: number) => {
    const clamped = Math.max(40, Math.min(600, width));
    const updateSlots = (slots: DocumentDataSlot[]) =>
      slots.map((s) => (s.id === slotId ? { ...s, width: clamped } : s));

    updateDoc({
      ...doc,
      requesterSlots: updateSlots(doc.requesterSlots),
      customSlots: doc.customSlots ? updateSlots(doc.customSlots) : [],
    });
  };

  const removeSlot = (slotId: string) => {
    updateDoc({
      ...doc,
      requesterSlots: doc.requesterSlots.filter((s) => s.id !== slotId),
      customSlots: doc.customSlots ? doc.customSlots.filter((s) => s.id !== slotId) : [],
    });
    setSelectedType(null);
    setSelectedSlotId(null);
  };

  // Move Slot (Drag and drop reorder or button reposition)
  const moveSlot = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= doc.requesterSlots.length || fromIdx === toIdx) return;
    const next = [...doc.requesterSlots];
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    updateDoc({ ...doc, requesterSlots: next });
    setSelectedSlotId(removed.id);
  };

  // Mouse horizontal drag to resize freely
  const startDragResize = (e: React.MouseEvent, slotId: string, currentWidth: number) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      setSlotWidth(slotId, currentWidth + diff);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Add Item to Purpose
  const addPurposeItem = () => {
    const newItem = { id: `item-${Date.now()}`, target: '', purpose: '' };
    updateDoc({
      ...doc,
      purposeItems: [...doc.purposeItems, newItem],
    });
  };

  const removePurposeItem = (id: string) => {
    if (doc.purposeItems.length <= 1) return;
    updateDoc({
      ...doc,
      purposeItems: doc.purposeItems.filter((it) => it.id !== id),
    });
  };

  // Logo upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateDoc({
        ...doc,
        logoUrl: String(reader.result),
        logoPosition: doc.logoPosition || 'center',
        logoSize: doc.logoSize || 'medium',
      });
      setSelectedType('logo');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Get selected slot object
  const currentSlot = selectedSlotId
    ? [...doc.requesterSlots, ...(doc.customSlots || [])].find((s) => s.id === selectedSlotId)
    : null;

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-100 text-ink-mute">
        กำลังโหลด Document Editor Workspace...
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

  return (
    <div className="w-screen h-screen bg-slate-100 flex flex-col overflow-hidden font-sans select-none">
      {/* 5.1 Top Toolbar */}
      <header className="h-14 bg-white border-b border-line px-4 flex items-center justify-between shrink-0 z-20">
        {/* Left: Back, Title, Save Status */}
        <div className="flex items-center gap-3">
          <Link
            href="/admin/document-templates"
            className="w-8 h-8 rounded-lg border border-line flex items-center justify-center text-ink hover:bg-soft transition"
            title="กลับไปหน้ารายการแม่แบบ"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-ink max-w-[200px] truncate">{doc.title}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-mint text-brand">
                v{template.currentVersion}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
              {saveStatus === 'saving' && <span className="text-amber-600">● กำลังบันทึก...</span>}
              {saveStatus === 'saved' && <span className="text-emerald-600">● บันทึกแล้ว</span>}
              {saveStatus === 'dirty' && <span className="text-slate-500">● มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>}
              {saveStatus === 'error' && <span className="text-red-600">● บันทึกไม่สำเร็จ</span>}
            </div>
          </div>
        </div>

        {/* Center: Tools, Zoom, Quick Add */}
        <div className="flex items-center gap-1 bg-soft/60 p-1 rounded-xl border border-line">
          <button
            type="button"
            disabled={historyIdx <= 0}
            onClick={handleUndo}
            className="p-1.5 rounded-lg hover:bg-white text-ink disabled:opacity-30 transition"
            title="Undo"
          >
            <Icon name="rotate-ccw" className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={historyIdx >= history.length - 1}
            onClick={handleRedo}
            className="p-1.5 rounded-lg hover:bg-white text-ink disabled:opacity-30 transition"
            title="Redo"
          >
            <Icon name="rotate-cw" className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-line mx-1" />

          {/* Zoom */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="p-1.5 rounded-lg hover:bg-white text-ink transition"
            title="ย่อ"
          >
            <Icon name="minus" className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-semibold text-ink px-1 w-10 text-center">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            className="p-1.5 rounded-lg hover:bg-white text-ink transition"
            title="ขยาย"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-line mx-1" />

          {/* + เพิ่มช่องการดึงข้อมูล Button */}
          <button
            type="button"
            onClick={() => handleAddDataSlot()}
            className="px-2.5 py-1 rounded-lg bg-white border border-brand text-brand hover:bg-brand hover:text-white text-xs font-semibold transition flex items-center gap-1 shadow-xs"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>+ เพิ่มช่องการดึงข้อมูล</span>
          </button>
        </div>

        {/* Right: Modes, Save, Publish */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-soft rounded-lg p-0.5 border border-line text-xs font-medium">
            <button
              type="button"
              onClick={() => setMode('design')}
              className={`px-2.5 py-1 rounded-md transition ${
                mode === 'design' ? 'bg-white text-brand shadow-xs font-semibold' : 'text-ink-mute'
              }`}
            >
              Design Mode
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`px-2.5 py-1 rounded-md transition ${
                mode === 'preview' ? 'bg-white text-brand shadow-xs font-semibold' : 'text-ink-mute'
              }`}
            >
              Print Preview
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveManual}
            className="jw-btn-sec h-8 px-3 text-xs"
          >
            บันทึก
          </button>
          <button
            type="button"
            disabled={isPublishing}
            onClick={handlePublish}
            className="jw-btn h-8 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </header>

      {/* Main Workspace Body: 3 Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* 5.2 Left Toolbar Panel */}
        {mode === 'design' && (
          <aside className="w-64 bg-white border-r border-line flex flex-col shrink-0 overflow-y-auto p-4 space-y-5 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2">องค์ประกอบข้อความ</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedType('title')}
                  className="p-2 rounded-xl border border-line hover:border-brand text-xs font-medium text-left flex items-center gap-1.5 bg-soft/30 hover:bg-white transition"
                >
                  <Icon name="file-text" className="w-3.5 h-3.5 text-brand" />
                  <span>หัวข้อเอกสาร</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType('subject')}
                  className="p-2 rounded-xl border border-line hover:border-brand text-xs font-medium text-left flex items-center gap-1.5 bg-soft/30 hover:bg-white transition"
                >
                  <Icon name="pencil" className="w-3.5 h-3.5 text-brand" />
                  <span>เรื่อง / เรียน</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType('clause')}
                  className="p-2 rounded-xl border border-line hover:border-brand text-xs font-medium text-left flex items-center gap-1.5 bg-soft/30 hover:bg-white transition"
                >
                  <Icon name="align-left" className="w-3.5 h-3.5 text-brand" />
                  <span>ข้าพเจ้า...</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType('closing')}
                  className="p-2 rounded-xl border border-line hover:border-brand text-xs font-medium text-left flex items-center gap-1.5 bg-soft/30 hover:bg-white transition"
                >
                  <Icon name="check" className="w-3.5 h-3.5 text-brand" />
                  <span>คำลงท้าย</span>
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2">ช่องดึงข้อมูล (Data Slots)</p>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: '+ ชื่อ-นามสกุลผู้ขอ', binding: 'requester.name' },
                  { label: '+ ตำแหน่ง', binding: 'requester.position' },
                  { label: '+ เบอร์โทรศัพท์', binding: 'requester.phone' },
                  { label: '+ หน่วยงาน / สังกัด', binding: 'requester.organization' },
                  { label: '+ สถานที่ขอใช้', binding: 'booking.location' },
                  { label: '+ วัตถุประสงค์', binding: 'booking.purpose' },
                  { label: '+ ช่องว่างกรอกมือ', binding: 'manual.blank' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleAddDataSlot(item.binding, item.label.replace('+ ', ''))}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg border border-dashed border-line hover:border-brand hover:bg-brand-mint/40 text-xs text-ink font-medium transition flex items-center justify-between"
                  >
                    <span>{item.label}</span>
                    <Icon name="plus" className="w-3 h-3 text-ink-mute" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2">ตราสัญลักษณ์ / โลโก้</p>
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="w-full p-2.5 rounded-xl border border-line hover:border-brand bg-soft/30 hover:bg-white text-xs font-medium text-ink flex items-center justify-center gap-2 transition"
              >
                <Icon name="upload" className="w-4 h-4 text-brand" />
                <span>{doc.logoUrl ? 'เปลี่ยนไฟล์ตราสัญลักษณ์' : 'อัปโหลดตราสัญลักษณ์จริง'}</span>
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {doc.logoUrl && (
                <div className="mt-2 flex items-center justify-between p-2 rounded-lg bg-soft text-xs">
                  <span>มีตราสัญลักษณ์แล้ว</span>
                  <button
                    type="button"
                    onClick={() => updateDoc({ ...doc, logoUrl: undefined })}
                    className="text-red-500 hover:underline"
                  >
                    ลบออก
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-2">ส่วนลงนาม (3 ระดับเดิม)</p>
              <div className="space-y-1.5">
                {doc.signatures.map((sig, idx) => (
                  <div
                    key={sig.id}
                    onClick={() => {
                      setSelectedType('signature');
                      setSelectedSigId(sig.id);
                    }}
                    className={`p-2 rounded-lg border text-xs cursor-pointer transition ${
                      selectedType === 'signature' && selectedSigId === sig.id
                        ? 'border-brand bg-brand-mint/30'
                        : 'border-line hover:border-brand/40 bg-white'
                    }`}
                  >
                    <span className="font-semibold block">{idx + 1}. {sig.title}</span>
                    <span className="text-[11px] text-ink-mute">บทบาท: {sig.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* 5.3 Center A4 Paper Canvas */}
        <main
          className="flex-1 bg-slate-200/80 overflow-auto p-8 flex items-start justify-center cursor-default"
          onClick={() => {
            // Click outside element clears selection
            setSelectedType(null);
            setSelectedSlotId(null);
          }}
        >
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              width: '210mm',
              minHeight: '297mm',
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white shadow-2xl p-[25mm] rounded-xs text-[#111] transition-transform duration-100 flex flex-col justify-between"
          >
            {/* Document Content */}
            <div className="space-y-4">
              {/* Genuine Logo (if uploaded) */}
              {doc.logoUrl && (
                <div
                  className={`flex mb-4 cursor-pointer ${
                    doc.logoPosition === 'left'
                      ? 'justify-start'
                      : doc.logoPosition === 'right'
                      ? 'justify-end'
                      : 'justify-center'
                  }`}
                  onClick={() => setSelectedType('logo')}
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
                    } ${selectedType === 'logo' ? 'ring-2 ring-brand ring-offset-2' : ''}`}
                  />
                </div>
              )}

              {/* 7.1 Title */}
              <div
                onClick={() => setSelectedType('title')}
                className={`text-center py-1 rounded transition cursor-text ${
                  selectedType === 'title' && mode === 'design'
                    ? 'ring-2 ring-brand bg-brand-mint/20'
                    : 'hover:bg-soft/40'
                }`}
              >
                {mode === 'design' ? (
                  <input
                    type="text"
                    value={doc.title}
                    onChange={(e) => updateDoc({ ...doc, title: e.target.value })}
                    className="w-full text-center text-[22px] font-bold text-ink bg-transparent border-none outline-none focus:ring-0 p-0"
                  />
                ) : (
                  <h1 className="text-[22px] font-bold text-ink">{doc.title}</h1>
                )}
              </div>

              {/* 7.2 Written At & Date */}
              <div className="flex justify-end pt-2">
                <div
                  onClick={() => setSelectedType('writtenAt')}
                  className={`text-right space-y-1 p-1.5 rounded transition ${
                    selectedType === 'writtenAt' && mode === 'design'
                      ? 'ring-2 ring-brand bg-brand-mint/20'
                      : 'hover:bg-soft/40'
                  }`}
                >
                  <div className="flex items-center justify-end gap-1 text-[15px]">
                    <span>เขียนที่</span>
                    {mode === 'design' ? (
                      <input
                        type="text"
                        value={doc.writtenAt}
                        onChange={(e) => updateDoc({ ...doc, writtenAt: e.target.value })}
                        className="text-[15px] border-b border-line bg-transparent outline-none w-56 text-right px-1"
                      />
                    ) : (
                      <span className="font-medium">{doc.writtenAt}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[15px]">
                    <span>วันที่</span>
                    <span className="inline-block border-b border-dotted border-ink-mute w-10 text-center">..</span>
                    <span>เดือน</span>
                    <span className="inline-block border-b border-dotted border-ink-mute w-24 text-center">............</span>
                    <span>พ.ศ.</span>
                    <span className="inline-block border-b border-dotted border-ink-mute w-14 text-center">......</span>
                  </div>
                </div>
              </div>

              {/* 7.3 Subject & Recipient (Pure editable text) */}
              <div
                onClick={() => setSelectedType('subject')}
                className={`space-y-1.5 pt-2 p-1.5 rounded transition ${
                  selectedType === 'subject' && mode === 'design'
                    ? 'ring-2 ring-brand bg-brand-mint/20'
                    : 'hover:bg-soft/40'
                }`}
              >
                <div className="flex items-baseline gap-2 text-[15px]">
                  <span className="font-bold shrink-0">เรื่อง:</span>
                  {mode === 'design' ? (
                    <input
                      type="text"
                      value={doc.subject}
                      onChange={(e) => updateDoc({ ...doc, subject: e.target.value })}
                      className="flex-1 text-[15px] border-b border-line bg-transparent outline-none px-1"
                    />
                  ) : (
                    <span>{doc.subject}</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 text-[15px]">
                  <span className="font-bold shrink-0">เรียน:</span>
                  {mode === 'design' ? (
                    <input
                      type="text"
                      value={doc.recipient}
                      onChange={(e) => updateDoc({ ...doc, recipient: e.target.value })}
                      className="flex-1 text-[15px] border-b border-line bg-transparent outline-none px-1"
                    />
                  ) : (
                    <span>{doc.recipient}</span>
                  )}
                </div>
              </div>

              {/* 7.4 Requester Details & Resizable Slots */}
              <div
                onClick={() => setSelectedType('clause')}
                className={`pt-3 text-[15px] leading-relaxed p-1.5 rounded transition ${
                  selectedType === 'clause' && mode === 'design'
                    ? 'ring-2 ring-brand bg-brand-mint/20'
                    : 'hover:bg-soft/40'
                }`}
              >
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const raw = e.dataTransfer.getData('application/json');
                    if (raw) {
                      try {
                        const data = JSON.parse(raw);
                        handleAddDataSlot(data.binding, data.label.replace('+ ', ''));
                      } catch {}
                    }
                  }}
                  className="flex flex-wrap items-center gap-y-2 gap-x-1.5"
                >
                  <span className="font-medium indent-8">ด้วยข้าพเจ้า</span>

                  {/* Resizable & Draggable Data Slots */}
                  {doc.requesterSlots.map((slot, idx) => {
                    const isSelected = selectedType === 'slot' && selectedSlotId === slot.id;
                    const isBeingDragged = draggedSlotIdx === idx;
                    const isDragOver = dragOverSlotIdx === idx;
                    return (
                      <span
                        key={slot.id}
                        draggable={mode === 'design'}
                        onDragStart={(e) => {
                          setDraggedSlotIdx(idx);
                          e.dataTransfer.setData('text/plain', slot.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverSlotIdx !== idx) setDragOverSlotIdx(idx);
                        }}
                        onDragLeave={() => {
                          if (dragOverSlotIdx === idx) setDragOverSlotIdx(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedSlotIdx !== null && draggedSlotIdx !== idx) {
                            moveSlot(draggedSlotIdx, idx);
                          }
                          setDraggedSlotIdx(null);
                          setDragOverSlotIdx(null);
                        }}
                        style={{ width: `${slot.width}px` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedType('slot');
                          setSelectedSlotId(slot.id);
                        }}
                        className={`inline-flex items-center justify-between text-xs transition relative group align-middle ${
                          mode === 'design'
                            ? `border rounded px-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none ${
                                isBeingDragged ? 'opacity-40 scale-95 border-dashed border-amber-500' : ''
                              } ${
                                isDragOver ? 'ring-2 ring-amber-500 bg-amber-50' : ''
                              } ${
                                isSelected
                                  ? 'border-brand bg-brand-mint text-brand font-semibold shadow-xs ring-1 ring-brand'
                                  : 'border-brand/40 bg-soft/50 text-ink hover:border-brand hover:bg-brand-mint/20'
                              }`
                            : 'border-b border-dotted border-ink-mute h-6 text-center text-ink-mute/50'
                        }`}
                      >
                        {mode === 'design' ? (
                          <>
                            <span className="flex items-center gap-1 truncate flex-1 pointer-events-none">
                              <span className="text-ink-mute font-mono text-[10px]" title="ลากเพื่อย้ายตำแหน่งอย่างอิสระ">⠿</span>
                              <span className="truncate">{slot.label}</span>
                            </span>
                            <span className="text-[10px] text-ink-mute ml-1 shrink-0 font-mono pointer-events-none">
                              {slot.width}px
                            </span>

                            {/* Hover Quick +/- Resize Buttons */}
                            <span className="absolute -top-7 right-0 hidden group-hover:flex items-center gap-0.5 bg-ink text-white rounded px-1 py-0.5 text-[10px] shadow z-10 pointer-events-auto">
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  resizeSlot(slot.id, -20);
                                }}
                                className="px-1 hover:text-amber-400"
                                title="ลด 20px"
                              >
                                -
                              </button>
                              <span className="px-0.5 font-mono">{slot.width}px</span>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  resizeSlot(slot.id, 20);
                                }}
                                className="px-1 hover:text-amber-400"
                                title="เพิ่ม 20px"
                              >
                                +
                              </button>
                            </span>

                            {/* Drag-to-Resize Handle on the right edge */}
                            <span
                              onMouseDown={(ev) => startDragResize(ev, slot.id, slot.width)}
                              className="absolute -right-1 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-brand/40 rounded-r transition z-10"
                              title="ลากเมาส์ซ้าย-ขวาเพื่อขยาย/ย่อขนาดได้อย่างอิสระ"
                            />
                          </>
                        ) : (
                          <span className="w-full text-center text-xs text-ink-mute/40 select-none">
                            ................................
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* 7.5 Purpose & Items */}
              <div
                onClick={() => setSelectedType('purpose')}
                className={`pt-2 space-y-2 p-1.5 rounded transition ${
                  selectedType === 'purpose' && mode === 'design'
                    ? 'ring-2 ring-brand bg-brand-mint/20'
                    : 'hover:bg-soft/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  {mode === 'design' ? (
                    <input
                      type="text"
                      value={doc.purposeText}
                      onChange={(e) => updateDoc({ ...doc, purposeText: e.target.value })}
                      className="w-full text-[15px] font-medium bg-transparent border-b border-line outline-none px-1"
                    />
                  ) : (
                    <p className="text-[15px] font-medium">{doc.purposeText}</p>
                  )}
                  {mode === 'design' && (
                    <button
                      type="button"
                      onClick={addPurposeItem}
                      className="text-xs text-brand font-semibold hover:underline shrink-0 ml-2"
                    >
                      + เพิ่มรายการ
                    </button>
                  )}
                </div>

                {/* Items rows */}
                <div className="space-y-1.5 pl-4">
                  {doc.purposeItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2 text-[14px]">
                      <span className="font-bold text-ink-mute">{idx + 1}.</span>
                      {mode === 'design' ? (
                        <>
                          <input
                            type="text"
                            placeholder="ระบุสถานที่ หรือ รายการครุภัณฑ์..."
                            value={item.target}
                            onChange={(e) => {
                              const next = [...doc.purposeItems];
                              next[idx].target = e.target.value;
                              updateDoc({ ...doc, purposeItems: next });
                            }}
                            className="flex-1 border-b border-line px-1 text-[14px] bg-transparent outline-none"
                          />
                          <span className="text-ink-mute">เพื่อ</span>
                          <input
                            type="text"
                            placeholder="ระบุวัตถุประสงค์..."
                            value={item.purpose}
                            onChange={(e) => {
                              const next = [...doc.purposeItems];
                              next[idx].purpose = e.target.value;
                              updateDoc({ ...doc, purposeItems: next });
                            }}
                            className="flex-1 border-b border-line px-1 text-[14px] bg-transparent outline-none"
                          />
                          {doc.purposeItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePurposeItem(item.id)}
                              className="text-ink-mute hover:text-red-500 text-xs p-1"
                              title="ลบแถวนี้"
                            >
                              ✕
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex-1 flex items-baseline gap-2">
                          <span className="flex-1 border-b border-dotted border-ink-mute text-ink">
                            {item.target || '..........................................................'}
                          </span>
                          <span>เพื่อ</span>
                          <span className="flex-1 border-b border-dotted border-ink-mute text-ink">
                            {item.purpose || '..........................................................'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 7.6 Closing */}
              <div
                onClick={() => setSelectedType('closing')}
                className={`pt-3 p-1.5 rounded transition ${
                  selectedType === 'closing' && mode === 'design'
                    ? 'ring-2 ring-brand bg-brand-mint/20'
                    : 'hover:bg-soft/40'
                }`}
              >
                {mode === 'design' ? (
                  <input
                    type="text"
                    value={doc.closingText}
                    onChange={(e) => updateDoc({ ...doc, closingText: e.target.value })}
                    className="w-full text-[15px] indent-8 bg-transparent border-b border-line outline-none px-1"
                  />
                ) : (
                  <p className="text-[15px] indent-8">{doc.closingText}</p>
                )}
              </div>
            </div>

            {/* 7.7 Signature Section (3-Level Workflow Preserved) */}
            <div className="pt-8 border-t border-line/60 mt-8">
              <div className="grid grid-cols-2 gap-6 text-center text-[13px]">
                {doc.signatures.map((sig) => (
                  <div
                    key={sig.id}
                    onClick={() => {
                      setSelectedType('signature');
                      setSelectedSigId(sig.id);
                    }}
                    className={`p-2 rounded cursor-pointer transition ${
                      selectedType === 'signature' && selectedSigId === sig.id && mode === 'design'
                        ? 'ring-2 ring-brand bg-brand-mint/20'
                        : 'hover:bg-soft/40'
                    }`}
                  >
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
        </main>

        {/* 5.4 Right Properties Panel */}
        {mode === 'design' && (
          <aside className="w-72 bg-white border-l border-line flex flex-col shrink-0 overflow-y-auto p-4 space-y-4 text-sm">
            <div className="pb-2 border-b border-line flex items-center justify-between">
              <span className="font-bold text-ink">คุณสมบัติ (Properties)</span>
              <span className="text-xs text-ink-mute capitalize">
                {selectedType ? selectedType : 'ยังไม่ได้เลือก'}
              </span>
            </div>

            {/* Data Slot Selected Properties */}
            {selectedType === 'slot' && currentSlot && (
              <div className="space-y-4">
                <div>
                  <label className="jw-lbl">ชื่อช่องข้อมูล (Label)</label>
                  <input
                    type="text"
                    value={currentSlot.label}
                    onChange={(e) => {
                      const nextSlots = doc.requesterSlots.map((s) =>
                        s.id === currentSlot.id ? { ...s, label: e.target.value } : s,
                      );
                      updateDoc({ ...doc, requesterSlots: nextSlots });
                    }}
                    className="jw-in text-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="jw-lbl mb-0">ความกว้าง (Width)</label>
                    <span className="text-xs font-mono font-bold text-brand">{currentSlot.width}px</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={600}
                    step={10}
                    value={currentSlot.width}
                    onChange={(e) => setSlotWidth(currentSlot.id, Number(e.target.value))}
                    className="w-full accent-brand cursor-pointer"
                  />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[60, 120, 200, 300, 450].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setSlotWidth(currentSlot.id, w)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                          currentSlot.width === w
                            ? 'bg-brand text-white border-brand'
                            : 'bg-soft text-ink border-line hover:border-brand'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="jw-lbl">ผูกตัวแปรระบบ (Data Binding)</label>
                  <select
                    value={currentSlot.binding || 'manual.blank'}
                    onChange={(e) => {
                      const nextSlots = doc.requesterSlots.map((s) =>
                        s.id === currentSlot.id ? { ...s, binding: e.target.value } : s,
                      );
                      updateDoc({ ...doc, requesterSlots: nextSlots });
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

                {/* Free Drag & Move controls */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="jw-lbl mb-0">ลำดับและตำแหน่งช่องข้อมูล</label>
                    <span className="text-xs text-ink-mute font-mono">
                      ลำดับที่ {doc.requesterSlots.findIndex((s) => s.id === currentSlot.id) + 1} จาก {doc.requesterSlots.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    {(() => {
                      const sIdx = doc.requesterSlots.findIndex((s) => s.id === currentSlot.id);
                      return (
                        <>
                          <button
                            type="button"
                            disabled={sIdx <= 0}
                            onClick={() => moveSlot(sIdx, 0)}
                            className="p-1.5 rounded-lg border border-line bg-soft hover:bg-white disabled:opacity-30 text-ink text-center"
                            title="ไปตำแหน่งแรกสุด"
                          >
                            ⇤ ซ้ายสุด
                          </button>
                          <button
                            type="button"
                            disabled={sIdx <= 0}
                            onClick={() => moveSlot(sIdx, sIdx - 1)}
                            className="p-1.5 rounded-lg border border-line bg-soft hover:bg-white disabled:opacity-30 text-ink text-center"
                            title="เลื่อนซ้าย"
                          >
                            ← ซ้าย
                          </button>
                          <button
                            type="button"
                            disabled={sIdx >= doc.requesterSlots.length - 1}
                            onClick={() => moveSlot(sIdx, sIdx + 1)}
                            className="p-1.5 rounded-lg border border-line bg-soft hover:bg-white disabled:opacity-30 text-ink text-center"
                            title="เลื่อนขวา"
                          >
                            ขวา →
                          </button>
                          <button
                            type="button"
                            disabled={sIdx >= doc.requesterSlots.length - 1}
                            onClick={() => moveSlot(sIdx, doc.requesterSlots.length - 1)}
                            className="p-1.5 rounded-lg border border-line bg-soft hover:bg-white disabled:opacity-30 text-ink text-center"
                            title="ไปตำแหน่งท้ายสุด"
                          >
                            ขวาสุด ⇥
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] text-ink-mute mt-1.5 leading-tight">
                    ✨ สามารถใช้เมาส์ <b>คลิกลาก (Drag & Drop)</b> ที่ตัวช่องข้อมูลบนกระดาษเพื่อย้ายสลับตำแหน่งได้อิสระ
                  </p>
                </div>

                <div className="pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => removeSlot(currentSlot.id)}
                    className="w-full py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition"
                  >
                    ลบช่องข้อมูลนี้
                  </button>
                </div>
              </div>
            )}

            {/* Logo Selected Properties */}
            {selectedType === 'logo' && doc.logoUrl && (
              <div className="space-y-4">
                <div>
                  <label className="jw-lbl">ตำแหน่งจัดวาง</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => updateDoc({ ...doc, logoPosition: pos })}
                        className={`py-1 rounded text-xs capitalize border transition ${
                          doc.logoPosition === pos
                            ? 'bg-brand text-white border-brand font-semibold'
                            : 'bg-soft text-ink border-line hover:border-brand'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="jw-lbl">ขนาดโลโก้</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => updateDoc({ ...doc, logoSize: sz })}
                        className={`py-1 rounded text-xs capitalize border transition ${
                          doc.logoSize === sz
                            ? 'bg-brand text-white border-brand font-semibold'
                            : 'bg-soft text-ink border-line hover:border-brand'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => updateDoc({ ...doc, logoUrl: undefined })}
                    className="w-full py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition"
                  >
                    ลบตราสัญลักษณ์ออก
                  </button>
                </div>
              </div>
            )}

            {/* Text Selected Properties */}
            {(selectedType === 'title' || selectedType === 'subject' || selectedType === 'closing') && (
              <div className="space-y-3">
                <p className="text-xs text-ink-mute">
                  คุณสามารถคลิกพิมพ์แก้ไขข้อความบนหน้ากระดาษได้โดยตรงแบบ Interactive
                </p>
                <div className="p-3 rounded-xl bg-soft text-xs space-y-1">
                  <span className="font-semibold text-ink block">ข้อแนะนำฟอนต์ราชการ:</span>
                  <span className="text-ink-mute block">ใช้ TH Sarabun New ขนาด 16pt ตามมาตรฐานระเบียบสารบรรณ</span>
                </div>
              </div>
            )}

            {!selectedType && (
              <div className="text-center py-12 text-ink-mute text-xs">
                คลิกที่องค์ประกอบบนหน้ากระดาษ หรือเลือกเครื่องมือด้านซ้ายเพื่อปรับแต่ง
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
