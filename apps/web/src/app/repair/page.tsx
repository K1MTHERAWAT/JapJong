'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { REPAIR_CATEGORIES, RepairRequest, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { StatusChip, Tabs, Timeline } from '@/components/ui';
import { api, formatThaiDateTime } from '@/lib/api';

type Mode = 'form' | 'track';
type TrackFilter = 'all' | 'in_progress' | 'acceptance';

export default function RepairPage() {
  const { account } = useAuth();
  const [mode, setMode] = useState<Mode>('form');

  // Form state
  const [building, setBuilding] = useState('อาคารสำนักงาน');
  const [floor, setFloor] = useState('ชั้น 2');
  const [location, setLocation] = useState('ห้องประชุมใหญ่ · เครื่องปรับอากาศ');
  const [category, setCategory] = useState('เครื่องปรับอากาศ');
  const [detail, setDetail] = useState('เปิดแอร์แล้วไม่เย็น มีน้ำหยดจากเครื่องด้านใน เริ่มเป็นตั้งแต่เมื่อวาน');
  const [photos, setPhotos] = useState(2);
  const [draftSaved, setDraftSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Track state
  const [repairs, setRepairs] = useState<(RequestWithTimeline & RepairRequest)[]>([]);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [activeId, setActiveId] = useState<string>('r-rp-0057');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const idParam = sp.get('id');
    const modeParam = sp.get('mode');
    if (idParam) {
      setActiveId(idParam);
      setMode('track');
      setTrackFilter('all');
    } else if (modeParam === 'track') {
      setMode('track');
    }
  }, []);

  const loadRepairs = useCallback(() => {
    api
      .listRequests({ mine: true, type: 'repair' })
      .then((list) => {
        const typed = list as (RequestWithTimeline & RepairRequest)[];
        setRepairs(typed);
        if (typed.length && !typed.some((x) => x.id === activeId)) {
          setActiveId(typed[0].id);
        }
      })
      .catch(() => {});
  }, [activeId]);

  useEffect(() => {
    loadRepairs();
  }, [loadRepairs, account?.id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const created = await api.createRepair({
        building,
        floor,
        location,
        category,
        detail,
        photos,
      });
      await loadRepairs();
      setActiveId(created.id);
      setTrackFilter('all');
      setMode('track');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'confirm' | 'reopen') => {
    setSubmitting(true);
    try {
      await api.updateRepairStatus(id, { action });
      await loadRepairs();
    } finally {
      setSubmitting(false);
    }
  };

  const activeRepair =
    repairs.find((r) => r.id === activeId) ??
    repairs.find((r) => r.status === 'repair_awaiting_acceptance') ??
    repairs[0];

  const filteredRepairs = repairs.filter((r) => {
    if (trackFilter === 'in_progress') return r.status === 'repair_in_progress' || r.status === 'repair_submitted';
    if (trackFilter === 'acceptance') return r.status === 'repair_awaiting_acceptance' || r.status === 'repair_done';
    return true;
  });

  return (
    <AppShell
      title={mode === 'form' ? 'แจ้งปัญหา / ซ่อมบำรุง' : 'แจ้งซ่อมของฉัน'}
      backHref="/"
      maxWidth="max-w-[1000px]"
      footer={
        mode === 'form' ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 2500);
              }}
              className="jw-btn-sec flex-1 sm:w-40"
            >
              บันทึกร่าง
            </button>
            <button
              type="button"
              disabled={submitting || !detail.trim()}
              onClick={handleSubmit}
              className="jw-btn flex-[1.5] sm:w-56"
            >
              {submitting ? 'กำลังส่ง...' : 'ส่งเรื่องแจ้งซ่อม'}
            </button>
          </div>
        ) : activeRepair && activeRepair.status === 'repair_awaiting_acceptance' ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleAction(activeRepair.id, 'reopen')}
              className="jw-btn-red flex-1 sm:w-44"
            >
              ยังไม่เรียบร้อย
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleAction(activeRepair.id, 'confirm')}
              className="jw-btn flex-1 sm:w-52"
            >
              ยืนยันตรวจรับงานซ่อม
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'form', label: 'แจ้งปัญหา / ซ่อมบำรุง' },
            { value: 'track', label: `แจ้งซ่อมของฉัน (${repairs.length})` },
          ]}
        />

        {mode === 'form' ? (
          <div className="jw-card p-5 sm:p-6 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="jw-lbl">อาคาร</label>
                <select value={building} onChange={(e) => setBuilding(e.target.value)} className="jw-in">
                  <option>อาคารสำนักงาน</option>
                  <option>ศาลา หมู่ 5</option>
                  <option>สนามกีฬากลาง</option>
                </select>
              </div>
              <div>
                <label className="jw-lbl">ชั้น</label>
                <select value={floor} onChange={(e) => setFloor(e.target.value)} className="jw-in">
                  <option>ชั้น 1</option>
                  <option>ชั้น 2</option>
                  <option>ชั้น 3</option>
                </select>
              </div>
            </div>

            <div>
              <label className="jw-lbl">ห้อง / อุปกรณ์</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="jw-in"
              />
            </div>

            <div>
              <label className="jw-lbl">ประเภทปัญหา</label>
              <div className="flex flex-wrap gap-2">
                {REPAIR_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`h-[38px] px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                      category === c
                        ? 'bg-brand border-brand text-white'
                        : 'bg-white border-line text-ink hover:border-brand'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="jw-lbl">รายละเอียด</label>
              <textarea
                rows={3}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className="jw-in h-24 py-2.5"
              />
            </div>

            <div>
              <label className="jw-lbl">รูปภาพประกอบ (ไม่เกิน 3 รูป)</label>
              <div className="flex gap-3">
                {Array.from({ length: photos }).map((_, idx) => (
                  <div
                    key={idx}
                    className="w-20 h-20 rounded-2xl bg-brand-mint text-brand flex items-center justify-center relative"
                  >
                    <Icon name="photo" className="w-7 h-7" strokeWidth={1.6} />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => Math.max(0, p - 1))}
                      className="w-5 h-5 rounded-full bg-ink text-white absolute -top-1.5 -right-1.5 flex items-center justify-center"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photos < 3 && (
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => Math.min(3, p + 1))}
                    className="w-20 h-20 rounded-2xl bg-white border-[1.5px] border-dashed border-[#7A7A7A] text-ink-mute text-[13px] flex flex-col items-center justify-center gap-1 hover:border-brand"
                  >
                    <Icon name="plus" className="w-5 h-5" />
                    <span>+ รูป</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-[13px] text-ink-mute">
              ขั้นตอนงานแจ้งซ่อม: (1) ผู้แจ้งส่งเรื่อง → (2) เจ้าหน้าที่รับเรื่อง & ซ่อมแซม → (3) ผู้แจ้งตรวจรับงาน (ไม่ต้องลงนาม)
            </p>

            {draftSaved && (
              <div className="rounded-2xl bg-brand-mint text-brand px-3.5 py-2 text-[13px] font-semibold">
                บันทึกร่างการแจ้งซ่อมเรียบร้อยแล้ว
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <Tabs<TrackFilter>
              value={trackFilter}
              onChange={setTrackFilter}
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'in_progress', label: 'กำลังดำเนินการ' },
                { value: 'acceptance', label: 'ตรวจรับงาน' },
              ]}
            />

            {activeRepair && (
              <div className="jw-card p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <b className="text-[16px] text-ink block">{activeRepair.title}</b>
                    <span className="text-[13px] text-ink-mute">
                      {activeRepair.code} · {activeRepair.location} ({activeRepair.floor})
                    </span>
                  </div>
                  <StatusChip status={activeRepair.status} />
                </div>

                <Timeline steps={activeRepair.timeline} orientation="horizontal" />

                <div className="pt-2 border-t border-line flex flex-col gap-2.5">
                  <b className="text-[14px] text-ink">ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)</b>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">1. ผู้แจ้งส่งเรื่อง</span>
                      <span className="text-[13.5px] font-bold text-ink">{activeRepair.requesterName}</span>
                      <span className="text-[12px] text-ink-mute">{formatThaiDateTime(activeRepair.createdAt)}</span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand mt-1">✓ ส่งเรื่องแล้ว</span>
                    </div>
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">2. เจ้าหน้าที่รับเรื่อง & ซ่อม</span>
                      <span className="text-[13.5px] font-bold text-ink">{activeRepair.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}</span>
                      <span className="text-[12px] text-ink-mute">
                        {activeRepair.finishedAt
                          ? `เสร็จ: ${formatThaiDateTime(activeRepair.finishedAt)}`
                          : activeRepair.acceptedAt
                          ? `รับเรื่อง: ${formatThaiDateTime(activeRepair.acceptedAt)}`
                          : 'รอดำเนินการ'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                        activeRepair.finishedAt ? 'text-brand' : activeRepair.acceptedAt ? 'text-amber-600' : 'text-ink-mute'
                      }`}>
                        {activeRepair.finishedAt ? '✓ ซ่อมเสร็จแล้ว' : activeRepair.acceptedAt ? '⟳ กำลังดำเนินการ' : '○ รอช่างรับเรื่อง'}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-ink-mute">3. ผู้แจ้งตรวจรับงาน</span>
                      <span className="text-[13.5px] font-bold text-ink">{activeRepair.requesterName}</span>
                      <span className="text-[12px] text-ink-mute">
                        {activeRepair.acceptedByRequesterAt ? formatThaiDateTime(activeRepair.acceptedByRequesterAt) : '-'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                        activeRepair.status === 'repair_done' ? 'text-brand' : activeRepair.status === 'repair_awaiting_acceptance' ? 'text-amber-600' : 'text-ink-mute'
                      }`}>
                        {activeRepair.status === 'repair_done' ? '✓ ตรวจรับเรียบร้อย' : activeRepair.status === 'repair_awaiting_acceptance' ? '⟳ รอคุณตรวจรับ' : '○ รอซ่อมเสร็จ'}
                      </span>
                    </div>
                  </div>
                </div>

                {activeRepair.status === 'repair_awaiting_acceptance' && (
                  <div className="pt-3 border-t border-line flex flex-col gap-2 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 rounded-2xl border border-amber-200">
                    <b className="text-[14px] text-amber-900 dark:text-amber-200">งานซ่อมเสร็จเรียบร้อยแล้ว รอการตรวจรับจากคุณ</b>
                    <p className="text-[13px] text-amber-800 dark:text-amber-300">
                      ผลการซ่อม: {activeRepair.resolution || 'ดำเนินการซ่อมเรียบร้อย'}
                    </p>
                    <p className="text-[12px] text-ink-mute">
                      หากผลงานเรียบร้อยดี กรุณากดปุ่ม <b>"ยืนยันตรวจรับงานซ่อม"</b> ด้านล่าง (ไม่ต้องลงนาม)
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {filteredRepairs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setActiveId(r.id)}
                  className={`jw-card p-4 flex items-center justify-between gap-3 cursor-pointer transition ${
                    activeRepair?.id === r.id ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-brand'
                  }`}
                >
                  <div>
                    <b className="text-[14px] text-ink block">{r.title}</b>
                    <span className="text-[12px] text-ink-mute">
                      {r.code} · {r.location}
                    </span>
                  </div>
                  <StatusChip status={r.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
