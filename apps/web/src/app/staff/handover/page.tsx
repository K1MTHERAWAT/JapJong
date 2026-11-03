'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, SignatureBox, SignaturePreviewCard, StatusChip, Tabs } from '@/components/ui';
import { api, formatThaiDateTime } from '@/lib/api';

type Phase = 'before' | 'after';

const VENUE_CHECKLIST = [
  { label: 'ห้องประชุม: ความสะอาดโดยรวม', ok: true },
  { label: 'เครื่องปรับอากาศใช้งานได้', ok: true },
  { label: 'เก้าอี้ครบ 50 ตัว สภาพใช้งานได้', ok: true },
  { label: 'ไมโครโฟนมีเสียงชัดเจน', ok: false },
];

const EQUIPMENT_CHECKLIST = [
  { label: 'ชุดเครื่องเสียงพกพา: เปิดติด เสียงชัดเจน สายไฟครบ', ok: true },
  { label: 'เต็นท์ผ้าใบ 3×3 ม.: ผ้าใบไม่ฉีกขาด โครงเหล็กครบ', ok: true },
  { label: 'อุปกรณ์เสริมและกระเป๋าเก็บครบตามจำนวนที่ยืม', ok: true },
];

export default function StaffHandoverPage() {
  const { account, accounts } = useAuth();
  const [list, setList] = useState<RequestWithTimeline[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('before');
  const [items, setItems] = useState(VENUE_CHECKLIST);
  const [note, setNote] = useState('ไมโครโฟนตัวที่ 2 มีเสียงแตก แจ้งผู้ยืมแล้ว');
  const [citizenSignature, setCitizenSignature] = useState('');
  const [staffSignature, setStaffSignature] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const selectRequest = useCallback((req: RequestWithTimeline) => {
    setSelectedId(req.id);
    setItems(req.type === 'borrow' ? EQUIPMENT_CHECKLIST : VENUE_CHECKLIST);
    if (req.status === 'return_inspect' || req.status === 'borrowing') {
      setPhase('after');
    } else {
      setPhase('before');
    }
  }, []);

  const load = useCallback(
    (preferId?: string | null) => {
      api
        .listRequests({ queue: 'handover' })
        .then((res) => {
          setList(res);
          const target = (preferId && res.find((r) => r.id === preferId)) || res[0];
          if (target) selectRequest(target);
        })
        .catch(() => {});
    },
    [selectRequest],
  );

  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    load(sp?.get('id'));
  }, [load]);

  const current = list.find((r) => r.id === selectedId) ?? list[0];
  const requesterAcc = accounts.find((a) => a.id === current?.requesterId);
  const hasAbnormal = items.some((i) => !i.ok);
  const existingRecord =
    current && current.type !== 'repair'
      ? phase === 'before'
        ? current.handoverBefore
        : current.handoverAfter
      : undefined;

  const handleConfirm = async () => {
    if (!current || !citizenSignature.trim() || !staffSignature.trim()) return;
    if (hasAbnormal && !note.trim()) return;
    await api.handover(current.id, {
      phase,
      items,
      note,
      citizenSignature,
      staffSignature,
    });
    setCitizenSignature('');
    setStaffSignature('');
    setSavedMsg(
      phase === 'before'
        ? `ลงนามรับมอบ 2 ฝ่าย (${current.code}) เรียบร้อยแล้ว`
        : `ลงนามรับคืน 2 ฝ่าย (${current.code}) เรียบร้อยแล้ว`,
    );
    load(current.id);
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <AppShell
      title="รับมอบ-คืน"
      backHref="/staff"
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth="max-w-[1440px]"
      footer={
        <div className="flex w-full sm:w-auto gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSavedMsg('บันทึกร่างเรียบร้อย');
              setTimeout(() => setSavedMsg(''), 2500);
            }}
            className="jw-btn-sec flex-1 sm:w-36"
          >
            บันทึกร่าง
          </button>
          <button
            type="button"
            disabled={!citizenSignature.trim() || !staffSignature.trim() || (hasAbnormal && !note.trim())}
            onClick={handleConfirm}
            className="jw-btn flex-[1.5] sm:w-64"
          >
            {phase === 'before' ? 'ลงนาม 2 ฝ่าย · ยืนยันรับมอบ' : 'ลงนาม 2 ฝ่าย · ยืนยันรับคืน'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 sm:gap-5">
        {list.length > 1 && (
          <div>
            <label className="jw-lbl">เลือกรายการใบอนุญาต / อุปกรณ์</label>
            <select
              value={selectedId}
              onChange={(e) => {
                const found = list.find((r) => r.id === e.target.value);
                if (found) selectRequest(found);
              }}
              className="jw-in"
            >
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.requesterName} ({r.title})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* การ์ด PDF ใบอนุญาต */}
        <div className="jw-card p-4 flex items-center gap-3.5">
          <div className="w-16 h-20 rounded-[8px] bg-white border-[1.5px] border-line flex flex-col items-center justify-center gap-1.5 shrink-0">
            <Icon name="file-text" className="w-7 h-7 text-ink" strokeWidth={1.6} />
            <b className="text-[11px] bg-ink text-white rounded px-1.5 py-0.5 tracking-wider">PDF</b>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between">
              <b className="text-[16px]">{current?.code || `BK-${new Date().getFullYear() + 543}-001`}</b>
              {current && <StatusChip status={current.status} />}
            </div>
            <span className="text-[14px] text-ink-mute">
              {current?.requesterName || 'สมชาย ใจดี'} · {current?.title}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="green">ใบอนุญาตลงนามครบ 4 ฝ่าย</Chip>
              <Chip tone="blue">รับมอบ-คืน ต้องลงนาม 2 ฝ่าย</Chip>
            </div>
          </div>
        </div>

        <Tabs<Phase>
          value={phase}
          onChange={setPhase}
          options={[
            { value: 'before', label: 'ก่อนใช้ (รับมอบ)' },
            { value: 'after', label: 'หลังใช้ (รับคืน)' },
          ]}
        />

        {existingRecord && (
          <div className="jw-card p-4 bg-brand-mint/30 flex flex-col gap-2.5">
            <b className="text-[14px] text-brand">
              หลักฐานการลงนาม{phase === 'before' ? 'รับมอบ (ก่อนใช้)' : 'รับคืน (หลังใช้)'} ที่บันทึกแล้ว
            </b>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <SignaturePreviewCard
                roleLabel={phase === 'before' ? '1. ผู้รับมอบสถานที่/ครุภัณฑ์' : '1. ผู้ส่งคืนสถานที่/ครุภัณฑ์'}
                signerName={current?.requesterName || 'สมชาย ใจดี'}
                signature={existingRecord.citizenSignature}
                signedAt={formatThaiDateTime(existingRecord.at)}
                status="signed"
              />
              <SignaturePreviewCard
                roleLabel={phase === 'before' ? '2. เจ้าหน้าที่ผู้ส่งมอบ' : '2. เจ้าหน้าที่ผู้ตรวจรับคืน'}
                signerName={existingRecord.staffName || 'นางสาวสุดา รอบคอบ'}
                signature={existingRecord.staffSignature}
                signedAt={formatThaiDateTime(existingRecord.at)}
                status="signed"
              />
            </div>
          </div>
        )}

        {/* เช็คลิสต์ ปกติ / ผิดปกติ */}
        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.1fr)_minmax(500px,0.9fr)] gap-4 sm:gap-5 items-start">
        <div className="flex flex-col gap-4 sm:gap-5">
        <div className="jw-card px-4 sm:px-5 divide-y divide-line">
          {items.map((item, idx) => (
            <div
              key={item.label}
              className={`py-3 flex flex-wrap items-center justify-between gap-2 ${
                !item.ok ? 'text-status-crit font-semibold' : ''
              }`}
            >
              <span className="text-[14px] flex-1 min-w-[200px]">
                {!item.ok ? `⚠ ${item.label}` : item.label}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ok: true } : x)))
                  }
                  className={`h-8 px-3 rounded-full border-[1.5px] text-[12px] font-semibold transition ${
                    item.ok ? 'bg-brand border-brand text-white' : 'bg-white border-line text-ink'
                  }`}
                >
                  ปกติ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ok: false } : x)))
                  }
                  className={`h-8 px-3 rounded-full border-[1.5px] text-[12px] font-semibold transition ${
                    !item.ok
                      ? 'bg-status-crit border-status-crit text-white'
                      : 'bg-white border-line text-ink'
                  }`}
                >
                  ผิดปกติ
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="jw-lbl">
            บันทึกเพิ่มเติม{' '}
            {hasAbnormal && (
              <span className="text-status-crit font-semibold">
                * มีรายการผิดปกติ กรุณาระบุเหตุผล/รายละเอียด
              </span>
            )}
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={hasAbnormal ? 'ระบุเหตุผลของรายการที่ผิดปกติ (จำเป็นต้องกรอก)' : 'หมายเหตุเพิ่มเติม (ถ้ามี)'}
            className={`jw-in min-h-24 py-2.5 ${hasAbnormal && !note.trim() ? 'border-status-crit' : ''}`}
          />
        </div>

        </div>

        {/* ลงนามทั้ง 2 ฝ่าย: ผู้รับมอบ/ส่งคืน และ เจ้าหน้าที่ผู้ตรวจ */}
        <div className="jw-card p-4 sm:p-6 flex flex-col gap-5">
          <div>
            <b className="text-[15px] text-ink block">
              ลงลายมือชื่อทั้ง 2 ฝ่าย ({phase === 'before' ? 'การส่งมอบก่อนใช้งาน' : 'การตรวจรับคืนหลังใช้งาน'})
            </b>
            <span className="text-[12px] text-ink-mute">
              ต้องเขียนลายเซ็นบนหน้าจอครบทั้งผู้ใช้งานและเจ้าหน้าที่ผู้ตรวจรับ
            </span>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="jw-lbl">
                1. ลายเซ็น{phase === 'before' ? 'ผู้รับมอบ' : 'ผู้ส่งคืน'} ({current?.requesterName || 'สมชาย ใจดี'})
              </label>
              <SignatureBox
                value={citizenSignature}
                onChange={setCitizenSignature}
                savedSignature={requesterAcc?.signature || current?.requesterSignature}
                pinAccountId={current?.requesterId}
                signerLabel={`${current?.requesterName || 'สมชาย ใจดี'} · ${
                  phase === 'before' ? 'ผู้รับมอบ' : 'ผู้ส่งคืน'
                }`}
                height={160}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="jw-lbl">
                2. ลายเซ็นเจ้าหน้าที่ผู้{phase === 'before' ? 'ส่งมอบ' : 'ตรวจรับคืน'} (
                {account?.name || 'นางสาวสุดา รอบคอบ'})
              </label>
              <SignatureBox
                value={staffSignature}
                onChange={setStaffSignature}
                savedSignature={account?.signature}
                signerLabel={`${account?.name || 'นางสาวสุดา รอบคอบ'} · เจ้าหน้าที่ผู้ตรวจรับ`}
                height={160}
              />
            </div>
          </div>
        </div>

        </div>

        {savedMsg && (
          <div className="rounded-2xl bg-brand-mint border border-brand px-4 py-2.5 text-[14px] text-brand font-semibold">
            {savedMsg}
          </div>
        )}
      </div>
    </AppShell>
  );
}
