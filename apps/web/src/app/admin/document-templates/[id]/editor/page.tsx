'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocumentStructure, DocumentTemplateItem } from '@japjong/shared';
import { FreeformA4Editor } from '@/components/freeform-a4-editor';
import { AppShell } from '@/components/shell';
import { api } from '@/lib/api';

export default function DocumentEditorWorkspacePage() {
  const params = useParams();
  const templateId = String(params.id || '');

  const [template, setTemplate] = useState<DocumentTemplateItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [doc, setDoc] = useState<DocumentStructure>({
    editorMode: 'freeform',
    freeformElements: [],
    title: 'แบบขอใช้สถานที่ราชการ',
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
  });

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [isPublishing, setIsPublishing] = useState(false);

  // Undo / Redo history
  const [history, setHistory] = useState<DocumentStructure[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  useEffect(() => {
    async function loadData() {
      if (!templateId) return;
      try {
        setLoading(true);
        const data = await api.getDocumentTemplate(templateId);
        setTemplate(data);
        const initialDoc: DocumentStructure = {
          ...data.structure,
          editorMode: 'freeform',
          freeformElements: data.structure?.freeformElements || [],
        };
        setDoc(initialDoc);
        setHistory([initialDoc]);
        setHistoryIdx(0);
      } catch (err) {
        setError((err as Error).message || 'ไม่สามารถโหลดแม่แบบเอกสารได้');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [templateId]);

  const updateDoc = (nextDoc: DocumentStructure) => {
    setDoc(nextDoc);
    setSaveStatus('dirty');
    const sliced = history.slice(0, historyIdx + 1);
    const nextHistory = [...sliced, nextDoc].slice(-30);
    setHistory(nextHistory);
    setHistoryIdx(nextHistory.length - 1);
  };

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

  // Debounced auto-save (2s)
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
    const note = prompt('บันทึกหมายเหตุการ Publish เวอร์ชันใหม่ (ถ้ามี):', 'อัปเดตแม่แบบกระดาษ A4');
    if (note === null) return;
    setIsPublishing(true);
    try {
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

  if (loading) {
    return (
      <AppShell noPadding>
        <div className="flex-1 flex items-center justify-center bg-slate-100 text-ink-mute py-16">
          กำลังโหลด Document Editor Workspace...
        </div>
      </AppShell>
    );
  }

  if (error || !template) {
    return (
      <AppShell noPadding>
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 gap-4 py-16">
          <p className="text-red-600 font-semibold">{error || 'ไม่พบแม่แบบเอกสาร'}</p>
          <Link href="/admin/document-templates" className="jw-btn text-sm">
            กลับไปหน้ารายการแม่แบบ
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell noPadding>
      <FreeformA4Editor
        template={template}
        doc={doc}
        saveStatus={saveStatus}
        isPublishing={isPublishing}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onUpdateDoc={updateDoc}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveNow={handleSaveManual}
        onPublish={handlePublish}
      />
    </AppShell>
  );
}
