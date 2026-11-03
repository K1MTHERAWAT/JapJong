'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CalendarDays, ChevronDown, Clock3 } from 'lucide-react';
import { BookingRequest, DayAvailability, Period, RequestWithTimeline, periodDurationText } from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { CalendarC4, Chip, StatusChip, Tabs } from '@/components/ui';
import { api, formatPeriodRange } from '@/lib/api';

type Mode = 'reschedule' | 'cancel';

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) =>
  `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
);

function DateField({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" className="jw-in flex items-center justify-between gap-2 px-2.5 text-left">
        <span className="truncate text-[13px] font-semibold text-ink">{formatPickerDate(value)}</span>
        <CalendarDays className="size-4 shrink-0 text-brand" />
      </button>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function formatPickerDate(value: string) {
  if (!value) return 'เลือกวันที่';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T00:00:00`));
}

function TimeField({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="jw-in flex items-center justify-between gap-1 px-2.5 text-[13px] font-semibold tabular-nums"
      >
        <span>{value}</span>
        <span className="flex items-center gap-1 text-brand"><Clock3 className="size-4" /><ChevronDown className="size-3.5" /></span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="ปิดตัวเลือกเวลา" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div ref={listRef} role="listbox" aria-label={label} className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-52 w-28 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white p-1.5 shadow-high">
            {TIME_OPTIONS.map((time) => (
              <button
                key={time}
                type="button"
                role="option"
                aria-selected={time === value}
                data-selected={time === value}
                onClick={() => { onChange(time); setOpen(false); }}
                className={`flex h-9 w-full items-center justify-center rounded-xl text-[13px] font-semibold tabular-nums transition ${time === value ? 'bg-brand text-white' : 'text-ink hover:bg-brand-tint'}`}
              >
                {time}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function RescheduleOrCancelPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = useState<(RequestWithTimeline & BookingRequest) | null>(null);
  const [mode, setMode] = useState<Mode>('reschedule');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [newPeriod, setNewPeriod] = useState<Period>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      start: `${dateStr}T13:00:00+07:00`,
      end: `${dateStr}T17:00:00+07:00`,
    };
  });
  const [cancelReason, setCancelReason] = useState('ติดภารกิจเร่งด่วน ขอเลื่อน/ยกเลิกการใช้สถานที่');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('mode') === 'cancel') setMode('cancel');
      if (sp.get('mode') === 'reschedule') setMode('reschedule');
    }
  }, []);

  useEffect(() => {
    if (!params.id) return;
    api
      .getRequest(params.id)
      .then((r) => {
        if (r.type === 'booking') {
          setReq(r as RequestWithTimeline & BookingRequest);
          api.availability(r.venueIds, month).then(setAvailability).catch(() => {});
        }
      })
      .catch(() => {});
  }, [params.id, month]);

  const handleSubmit = async () => {
    if (!req) return;
    setSubmitting(true);
    try {
      if (mode === 'reschedule') {
        await api.reschedule(req.id, [newPeriod]);
      } else {
        await api.cancelRequest(req.id, cancelReason);
      }
      router.push(`/requests/${req.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="ขอเลื่อนวัน / ยกเลิก"
      backHref={`/requests/${params.id}`}
      maxWidth="max-w-[900px]"
      footer={
        <div className="flex w-full sm:w-auto gap-2.5">
          <button
            type="button"
            onClick={() => router.push(`/requests/${params.id}`)}
            className="jw-btn-sec flex-1 sm:w-36"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className={mode === 'reschedule' ? 'jw-btn flex-[1.5] sm:w-56' : 'jw-btn-red flex-[1.5] sm:w-56'}
          >
            {mode === 'reschedule' ? 'ส่งคำขอเลื่อนวัน' : 'ยืนยันยกเลิกการจอง'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {req && (
          <div className="jw-card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <b className="text-[15px]">{req.code}</b>
              <StatusChip status={req.status} />
            </div>
            <span className="text-[14px] text-ink">
              {req.title} {req.subtitle ? `· ${req.subtitle}` : ''}
            </span>
            <span className="text-[13px] text-ink-mute">เดิม: {formatPeriodRange(req.periods[0])}</span>
          </div>
        )}

        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'reschedule', label: 'เลื่อนวัน' },
            { value: 'cancel', label: 'ยกเลิกการจอง' },
          ]}
        />

        {mode === 'reschedule' ? (
          <>
            <CalendarC4
              month={month}
              onMonthChange={setMonth}
              availability={availability}
              periods={[newPeriod]}
              showDots={false}
              onPickDate={(dateStr) =>
                setNewPeriod({
                  start: `${dateStr}T13:00:00+07:00`,
                  end: `${dateStr}T17:00:00+07:00`,
                })
              }
            />

            <div className="jw-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <b className="text-[14px]">ช่วงเวลาใหม่</b>
                <Chip tone="green">{periodDurationText(newPeriod)}</Chip>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="min-w-0 rounded-2xl border border-line bg-white p-2.5 flex flex-col gap-1.5">
                  <span className="text-[11px] text-ink-mute">เริ่มต้น</span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <DateField
                      value={newPeriod.start.slice(0, 10)}
                      label="วันที่เริ่มต้น"
                      onChange={(date) => setNewPeriod((period) => ({
                        start: `${date}T${period.start.slice(11, 16)}:00+07:00`,
                        end: `${period.end.slice(0, 10) < date ? date : period.end.slice(0, 10)}T${period.end.slice(11, 16)}:00+07:00`,
                      }))}
                    />
                    <TimeField
                      value={newPeriod.start.slice(11, 16)}
                      label="เวลาเริ่มต้น"
                      onChange={(time) => setNewPeriod((period) => ({
                        ...period,
                        start: `${period.start.slice(0, 10)}T${time}:00+07:00`,
                      }))}
                    />
                  </div>
                </div>
                <span className="hidden sm:inline text-ink-mute">
                  <Icon name="arrow-right" className="w-4 h-4" />
                </span>
                <div className="min-w-0 rounded-2xl border border-line bg-white p-2.5 flex flex-col gap-1.5">
                  <span className="text-[11px] text-ink-mute">สิ้นสุด</span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <DateField
                      value={newPeriod.end.slice(0, 10)}
                      label="วันที่สิ้นสุด"
                      onChange={(date) => setNewPeriod((period) => ({
                        ...period,
                        end: `${date < period.start.slice(0, 10) ? period.start.slice(0, 10) : date}T${period.end.slice(11, 16)}:00+07:00`,
                      }))}
                    />
                    <TimeField
                      value={newPeriod.end.slice(11, 16)}
                      label="เวลาสิ้นสุด"
                      onChange={(time) => setNewPeriod((period) => ({
                        ...period,
                        end: `${period.end.slice(0, 10)}T${time}:00+07:00`,
                      }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[13px] text-ink-mute">
              ช่วงเวลาเดิมจะถูกปล่อยเมื่อคำขอใหม่ได้รับอนุมัติ
            </p>
          </>
        ) : (
          <div className="jw-card p-5 flex flex-col gap-3">
            <label className="jw-lbl">เหตุผลในการยกเลิกการจอง</label>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="jw-in h-24 py-2.5"
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
