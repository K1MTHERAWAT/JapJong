'use client';

import React, { useEffect, useState } from 'react';
import {
  DayAvailability,
  DocumentVerification,
  EquipmentCategory,
  OfficialFormPurposeItem,
  Period,
  RequestStatus,
  RequestWithTimeline,
  SIGN_LEVEL_TITLE,
  STATUS_META,
  TimelineStep,
  Tone,
  VenueType,
} from '@jongwen/shared';
import { Icon, IconName } from './icons';
import { api, formatMonthTitle, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

// ===== Chip / Status Badge =====
const TONE_CLASS: Record<Tone, string> = {
  green: 'bg-[#ECF5D8] text-[#405D0A] ring-1 ring-inset ring-[#A8C965]/45',
  amber: 'bg-[#FFF4CC] text-[#765500] ring-1 ring-inset ring-[#E8C75C]/45',
  orange: 'bg-[#FFF0E3] text-[#963F08] ring-1 ring-inset ring-[#F3B47E]/45',
  red: 'bg-[#FDE7E7] text-[#A32121] ring-1 ring-inset ring-[#ECA0A0]/45',
  purple: 'bg-[#EBDDFB] text-[#5B21B6] ring-1 ring-inset ring-[#B995EA]/55',
  blue: 'bg-[#E8F1FF] text-[#2454A6] ring-1 ring-inset ring-[#A7C4F2]/45',
  cyan: 'bg-[#E3FAFD] text-[#0B6572] ring-1 ring-inset ring-[#8DDBE5]/45',
  indigo: 'bg-[#E2DFFF] text-[#39258C] ring-1 ring-inset ring-[#A99BEA]/60',
  pink: 'bg-[#FCE7F1] text-[#972454] ring-1 ring-inset ring-[#EBA5C4]/45',
  teal: 'bg-[#E5F4EF] text-[#176548] ring-1 ring-inset ring-[#99CCB9]/45',
  gray: 'bg-[#EEF0F3] text-[#4B5563] ring-1 ring-inset ring-[#C5CBD4]/55',
};

export function Chip({
  tone = 'green',
  children,
  className = '',
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 min-h-[26px] px-2.5 rounded-full ring-1 ring-inset ring-black/[0.035] text-[12px] font-semibold shrink-0 ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusChip({ status }: { status: RequestStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'gray' as Tone };
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

// ===== Stepper (4 ขั้นตอน / 3 ขั้นตอน / 2 ขั้นตอน) =====
export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: string[];
  current: number; // 1-indexed
  onSelect?: (step: number) => void;
}) {
  return (
    <div className="jw-card px-3 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between w-full">
      {steps.map((label, idx) => {
        const num = idx + 1;
        const done = num < current;
        const active = num === current;
        const isLast = idx === steps.length - 1;
        return (
          <React.Fragment key={label}>
            <button
              type="button"
              disabled={!onSelect || num > current}
              onClick={() => onSelect?.(num)}
              className={`flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 text-[11px] sm:text-[13px] font-semibold transition shrink-0 ${
                active
                  ? 'text-brand-ink'
                  : done
                  ? 'text-ink cursor-pointer hover:text-brand'
                  : 'text-ink-mute'
              }`}
            >
              <span
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-[12.5px] sm:text-[13px] font-bold transition-all ${
                  done
                    ? 'bg-brand border-brand text-white'
                    : active
                    ? 'bg-brand border-brand text-white ring-4 ring-brand/15'
                    : 'bg-surface-muted border-line text-ink-mute'
                }`}
              >
                {done ? <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} /> : num}
              </span>
              <span className="truncate max-w-[72px] sm:max-w-none">{label}</span>
            </button>
            {!isLast && (
              <div
                className={`flex-1 h-[2px] mx-1.5 sm:mx-3 rounded-full transition-colors ${
                  done ? 'bg-brand' : 'bg-line'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ===== Segmented Tabs =====
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex w-full min-w-0 max-w-full overflow-x-auto bg-soft rounded-control p-[3px] ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 min-w-max h-9 px-3 rounded-[8px] text-[13px] font-semibold whitespace-nowrap transition ${
              active ? 'bg-white text-ink shadow-xs' : 'text-ink-mute hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ===== Toggle Switch =====
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-[26px] rounded-full relative transition shrink-0 ${
        checked ? 'bg-brand' : 'bg-[#C4C8D6]'
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full bg-white absolute top-[3px] transition-all ${
          checked ? 'right-[3px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

// ===== Icons for Venue & Equipment =====
export function venueIconName(type: VenueType): IconName {
  switch (type) {
    case 'meeting':
      return 'building-community';
    case 'pavilion':
      return 'building-pavilion';
    case 'field':
      return 'ball-football';
    case 'yard':
      return 'building-pavilion';
    case 'training':
      return 'armchair';
  }
}

export function equipmentIconName(cat: EquipmentCategory): IconName {
  switch (cat) {
    case 'audio':
      return 'volume';
    case 'tent':
      return 'tent';
    case 'it':
      return 'device-projector';
  }
}

// ===== Calendar C4 + Availability Dots + Range Highlight =====
const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export function CalendarC4({
  month,
  onMonthChange,
  availability,
  periods,
  conflictPeriodIndexes = [],
  onPickDate,
  showDots = true,
}: {
  month: string; // YYYY-MM
  onMonthChange: (nextYm: string) => void;
  availability: DayAvailability[];
  periods: Period[];
  conflictPeriodIndexes?: number[];
  onPickDate?: (dateStr: string) => void;
  showDots?: boolean;
}) {
  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const availMap = new Map(availability.map((a) => [a.date, a]));

  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    onMonthChange(`${ny}-${nm}`);
  };

  const dayState = (dateStr: string) => {
    let isEndpoint = false;
    let isStart = false;
    let isEnd = false;
    let isMid = false;
    let isConflict = false;

    periods.forEach((p, idx) => {
      const sd = p.start.slice(0, 10);
      const ed = p.end.slice(0, 10);
      if (dateStr >= sd && dateStr <= ed) {
        if (conflictPeriodIndexes.includes(idx)) isConflict = true;
        if (sd === ed && dateStr === sd) {
          isEndpoint = true;
        } else if (dateStr === sd) {
          isEndpoint = true;
          isStart = true;
        } else if (dateStr === ed) {
          isEndpoint = true;
          isEnd = true;
        } else {
          isMid = true;
        }
      }
    });

    return { isEndpoint, isStart, isEnd, isMid, isConflict };
  };

  return (
    <div className="jw-card p-3.5 sm:p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <b className="text-[16px] sm:text-[18px]">{formatMonthTitle(month)}</b>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="w-8 h-8 rounded-full border-[1.5px] border-ink flex items-center justify-center hover:bg-soft"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="w-8 h-8 rounded-full border-[1.5px] border-ink flex items-center justify-center hover:bg-soft"
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center select-none">
        {WEEKDAYS_TH.map((w) => (
          <div key={w} className="h-6 text-[12px] font-semibold text-ink-mute flex items-center justify-center">
            {w}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e-${i}`} className="h-10 sm:h-12" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const day = idx + 1;
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          const av = availMap.get(dateStr);
          const todayStr = new Date().toISOString().slice(0, 10);
          const isPast = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isFull = av?.level === 'full';
          const { isEndpoint, isStart, isEnd, isMid, isConflict } = dayState(dateStr);

          const stripBg = isConflict ? 'bg-[#FDE8E8]' : 'bg-brand-calRange';

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onPickDate?.(dateStr)}
              className="h-10 sm:h-12 relative flex flex-col items-center justify-center text-[14px] sm:text-[15px]"
            >
              {(isMid || isStart || isEnd) && (
                <span
                  className={`absolute top-1/2 -translate-y-1/2 h-7 sm:h-8 ${stripBg} ${
                    isStart ? 'left-1/2 right-0' : isEnd ? 'left-0 right-1/2' : 'inset-x-0'
                  }`}
                />
              )}
              <span
                className={`relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition ${
                  isEndpoint
                    ? isConflict
                      ? 'bg-status-crit text-white font-bold'
                      : 'bg-brand text-white font-bold'
                    : isConflict
                    ? 'text-status-crit font-bold'
                    : isToday
                    ? 'border-[1.5px] border-brand text-brand font-bold'
                    : isFull
                    ? 'text-[#9AA0B4] line-through'
                    : isPast
                    ? 'text-[#B5B9C9]'
                    : 'text-ink hover:bg-brand-mint'
                }`}
              >
                {day}
              </span>
              {showDots && !isPast && !isFull && av && (
                <i
                  className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    av.level === 'few' ? 'bg-status-warn' : 'bg-status-ok'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-ink-mute pt-1">
        {showDots && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <i className="w-2 h-2 rounded-full bg-status-ok inline-block" />
              ว่างมาก
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="w-2 h-2 rounded-full bg-status-warn inline-block" />
              เหลือน้อย
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-[3px] bg-soft border border-line inline-block" />
          เต็ม
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-[3px] bg-brand-calRange inline-block" />
          ช่วงที่เลือก
        </span>
        {conflictPeriodIndexes.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <i className="w-3 h-3 rounded-[3px] bg-[#FDE8E8] border border-[#f9b4b4] inline-block" />
            ช่วงที่ไม่ว่าง
          </span>
        )}
      </div>
    </div>
  );
}

// ===== Timeline =====
export function Timeline({ steps, orientation = 'vertical' }: { steps: TimelineStep[]; orientation?: 'vertical' | 'horizontal' }) {
  if (orientation === 'horizontal') {
    return (
      <div className="w-full overflow-x-auto pb-2 [scrollbar-width:thin]">
        <div className="flex min-w-max sm:min-w-full">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div key={s.key} className="relative flex min-w-[156px] flex-1 flex-col items-center px-2 text-center sm:min-w-0">
                <div className="relative flex h-[30px] w-full items-center justify-center">
                  {!isLast && <div className="absolute left-[calc(50%+15px)] right-0 top-1/2 h-[2px] -translate-y-1/2 bg-line" />}
                  {s.state === 'done' ? (
                    <div className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Icon name="check" className="size-4" strokeWidth={3} />
                    </div>
                  ) : s.state === 'current' ? (
                    <div className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-[#D9A53A] bg-white text-[12px] font-bold text-[#8A6200]">{i + 1}</div>
                  ) : s.state === 'rejected' ? (
                    <div className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-status-crit bg-[#FDE8E8] text-status-crit">
                      <Icon name="x" className="size-4" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-line bg-white text-[12px] font-semibold text-[#9A9A9A]">{i + 1}</div>
                  )}
                </div>
                <div className="mt-2 w-full px-1">
                  <div className="text-[13px] font-semibold leading-snug text-ink">{s.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-ink-mute">
                    {s.at ? formatThaiDateTime(s.at) : ''}
                    {s.at && s.note ? ' · ' : ''}
                    {s.note ?? (!s.at ? 'รอดำเนินการ' : '')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={s.key} className="flex gap-3.5 min-h-[54px]">
            <div className="flex flex-col items-center">
              {s.state === 'done' ? (
                <div className="w-[26px] h-[26px] rounded-full bg-brand text-white flex items-center justify-center shrink-0">
                  <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
              ) : s.state === 'current' ? (
                <div className="w-[26px] h-[26px] rounded-full bg-white border-2 border-[#D9A53A] text-[#8A6200] text-[12px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
              ) : s.state === 'rejected' ? (
                <div className="w-[26px] h-[26px] rounded-full bg-[#FDE8E8] border-2 border-status-crit text-status-crit flex items-center justify-center shrink-0">
                  <Icon name="x" className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
              ) : (
                <div className="w-[26px] h-[26px] rounded-full bg-white border-2 border-line text-[#9A9A9A] text-[12px] font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
              )}
              {!isLast && <div className="w-[2px] flex-1 bg-line my-1" />}
            </div>
            <div className="pb-3">
              <div className="font-semibold text-[14px] text-ink">{s.label}</div>
              <div className="text-[12px] text-ink-mute">
                {s.at ? formatThaiDateTime(s.at) : ''}
                {s.at && s.note ? ' · ' : ''}
                {s.note ?? (!s.at ? 'รอดำเนินการ' : '')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== Signature Box (HTML5 Canvas วาดลายเซ็นบนหน้าจอ หรือดึงลายเซ็นที่บันทึกไว้ด้วยรหัส PIN 6 หลัก) =====
export function SignatureBox({
  value,
  onChange,
  savedSignature,
  signerLabel,
  height = 180,
  skipPinPrompt = true,
  pinAccountId,
}: {
  value: string;
  onChange: (val: string) => void;
  savedSignature?: string | null;
  signerLabel?: string;
  height?: number;
  skipPinPrompt?: boolean;
  pinAccountId?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const internalValueRef = React.useRef<string>('');
  const [showPinModal, setShowPinModal] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [pinError, setPinError] = React.useState('');
  const [usedSavedWithPin, setUsedSavedWithPin] = React.useState(false);

  // ซิงค์ค่าเริ่มต้นหรือเมื่อกดล้าง / กดใช้ลายเซ็นที่บันทึกไว้
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!value) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      internalValueRef.current = '';
      return;
    }

    if (value === internalValueRef.current) return;

    if (value.startsWith('data:image/')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const padX = 24;
        const padY = 14;
        const availW = canvas.width - padX * 2;
        const availH = canvas.height - padY * 2;
        const scale = Math.min(availW / (img.width || 320), availH / (img.height || 110));
        const drawW = (img.width || 320) * scale;
        const drawH = (img.height || 110) * scale;
        const dx = (canvas.width - drawW) / 2;
        const dy = (canvas.height - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
        internalValueRef.current = value;
      };
      img.src = value;
    }
  }, [value]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getPoint(e);
    drawingRef.current = true;
    lastPointRef.current = pt;

    ctx.strokeStyle = '#085041';
    ctx.fillStyle = '#085041';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPointRef.current) return;

    const pt = getPoint(e);
    ctx.strokeStyle = '#085041';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    internalValueRef.current = dataUrl;
    onChange(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    internalValueRef.current = '';
    setUsedSavedWithPin(false);
    onChange('');
  };

  const hasDrawnSignature = Boolean(value && value.startsWith('data:image/'));
  const validSavedSig = savedSignature && savedSignature.startsWith('data:image/') ? savedSignature : null;

  const handleRequestSavedSignature = () => {
    if (!validSavedSig) return;
    if (skipPinPrompt) {
      internalValueRef.current = '';
      setUsedSavedWithPin(true);
      onChange(validSavedSig);
      return;
    }
    setPin('');
    setPinError('');
    setShowPinModal(true);
  };

  const handleVerifyPinForSignature = async (fullPin: string) => {
    if (!validSavedSig) return;
    setPinError('');
    try {
      await api.verifyPin(fullPin);
      internalValueRef.current = '';
      setUsedSavedWithPin(true);
      onChange(validSavedSig);
      setShowPinModal(false);
      setPin('');
    } catch (err) {
      setPinError((err as Error).message || 'รหัส PIN 6 หลักไม่ถูกต้อง');
      setPin('');
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div
        style={{ height }}
        className={`border-[1.5px] rounded-card relative bg-white overflow-hidden select-none transition ${
          hasDrawnSignature ? 'border-brand' : 'border-line'
        }`}
      >
        <div className="absolute left-3.5 right-3.5 top-2.5 grid grid-cols-[minmax(0,1fr)_max-content] items-start gap-2 pointer-events-none z-10">
          <span className="min-w-0 text-[11px] leading-4 text-ink-mute">
            {signerLabel ? `ลายเซ็น: ${signerLabel}` : 'ใช้นิ้วหรือเมาส์ลากเขียนลายเซ็นในกรอบนี้ หรือดึงลายเซ็นที่บันทึกไว้'}
          </span>
          {hasDrawnSignature ? (
            <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-brand bg-brand-mint px-2 py-0.5 rounded-full">
              {usedSavedWithPin ? '✓ ใช้ลายเซ็นที่บันทึกไว้ (ยืนยัน PIN)' : '✓ ลงลายมือชื่อแล้ว'}
            </span>
          ) : (
            <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-[#9A4A08] bg-[#f8842d]/15 px-2 py-0.5 rounded-full">
              ยังไม่ได้ลงลายเซ็น
            </span>
          )}
        </div>

        {!hasDrawnSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="max-w-[280px] px-5 text-center text-[14px] leading-relaxed text-ink-ph">
              ใช้นิ้วหรือเมาส์ลากเซ็นชื่อในช่องนี้
            </span>
          </div>
        )}

        <div className="absolute left-5 right-5 bottom-8 border-t border-dashed border-[#BBBBBB] pointer-events-none" />

        <canvas
          ref={canvasRef}
          width={640}
          height={220}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
          className="w-full h-full cursor-crosshair touch-none relative z-20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {validSavedSig && (
          <button
            type="button"
            onClick={handleRequestSavedSignature}
            className="inline-flex items-center gap-1.5 border border-brand text-brand rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold bg-brand-mint hover:bg-brand hover:text-white transition"
          >
            <Icon name="lock" className="w-3.5 h-3.5" />
            <span>{skipPinPrompt ? 'ใช้ลายเซ็นที่บันทึกไว้' : 'ใช้ลายเซ็นที่บันทึกไว้ (กด PIN 6 หลัก)'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 border border-line rounded-full px-3 py-1.5 text-[12.5px] font-medium bg-white hover:bg-soft"
        >
          <Icon name="eraser" className="w-4 h-4" /> ล้างและเขียนใหม่
        </button>
      </div>

      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[420px] bg-white rounded-hard p-6 flex flex-col items-center gap-4 shadow-md">
            <div className="w-full flex items-center justify-between">
              <b className="text-[16px] text-ink">ยืนยัน PIN 6 หลักเพื่อใช้ลายเซ็นที่บันทึกไว้</b>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="text-ink-mute hover:text-ink"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <PinKeypad
              pin={pin}
              onChange={setPin}
              subtitle={
                signerLabel
                  ? `กดรหัส PIN 6 หลักของ ${signerLabel}`
                  : 'กดรหัส PIN 6 หลักของคุณเพื่อดึงลายเซ็นที่บันทึกไว้'
              }
              onComplete={handleVerifyPinForSignature}
            />
            {pinError && (
              <div className="w-full rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2 text-[13px] text-[#7a1010] text-center">
                {pinError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Signature Preview Card (สำหรับแสดงลายเซ็นที่วาดจริงของทุกฝ่ายในเอกสารและใบอนุญาต PDF) =====
export function SignaturePreviewCard({
  roleTitle,
  roleLabel,
  signerName,
  signature,
  at,
  signedAt,
  pendingText = 'รอเขียนลายมือชื่อ',
  decision,
  status,
}: {
  roleTitle?: string;
  roleLabel?: string;
  signerName?: string;
  signature?: string | null;
  at?: string;
  signedAt?: string;
  pendingText?: string;
  decision?: 'approve' | 'reject';
  status?: 'signed' | 'pending' | 'rejected';
}) {
  const title = roleLabel || roleTitle || '';
  const hasImg = Boolean(signature && signature.startsWith('data:image/'));
  const isRejected = decision === 'reject' || status === 'rejected';
  const timeText = signedAt || (at ? formatThaiDateTime(at) : undefined);

  return (
    <div
      className={`rounded-2xl border-[1.5px] p-2.5 min-h-[118px] flex flex-col items-center justify-between text-center ${
        isRejected
          ? 'border-status-crit bg-[#FDE8E8]/50'
          : hasImg
          ? 'border-brand bg-brand-mint/50'
          : 'border-dashed border-line bg-soft/50'
      }`}
    >
      <span className="text-[11px] font-bold text-ink-mute">{title}</span>

      <div className="h-12 w-full flex items-center justify-center my-1">
        {hasImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signature!}
            alt={`ลายเซ็น ${signerName || title}`}
            className="max-h-12 max-w-full object-contain"
          />
        ) : (
          <span className="text-[11.5px] text-ink-ph italic">{pendingText}</span>
        )}
      </div>

      <div className="text-[11px] leading-tight">
        <div className="font-semibold text-ink">{signerName ? `(${signerName})` : '—'}</div>
        {timeText && <div className="text-[10.5px] text-ink-mute mt-0.5">{timeText}</div>}
      </div>
    </div>
  );
}

// ===== 6-digit PIN Keypad =====
export function PinKeypad({
  pin,
  onChange,
  subtitle,
  onComplete,
}: {
  pin: string;
  onChange: (next: string) => void;
  subtitle?: string;
  onComplete?: (fullPin: string) => void;
}) {
  const press = (digit: string) => {
    if (pin.length >= 6) return;
    const next = pin + digit;
    onChange(next);
    if (next.length === 6) onComplete?.(next);
  };
  const backspace = () => onChange(pin.slice(0, -1));

  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-brand-mint text-brand flex items-center justify-center">
        <Icon name="lock" className="w-7 h-7" />
      </div>
      {subtitle && <div className="text-[13px] text-ink-mute">{subtitle}</div>}
      <div className="flex gap-3.5 justify-center my-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <i
            key={i}
            className={`w-4 h-4 rounded-full border-2 border-brand block transition ${
              i < pin.length ? 'bg-brand' : 'bg-transparent'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 justify-center">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            className="w-16 h-16 rounded-full border border-line bg-white text-[22px] font-medium flex items-center justify-center hover:bg-brand-mint active:scale-95 transition"
          >
            {d}
          </button>
        ))}
        <div className="w-16 h-16" />
        <button
          type="button"
          onClick={() => press('0')}
          className="w-16 h-16 rounded-full border border-line bg-white text-[22px] font-medium flex items-center justify-center hover:bg-brand-mint active:scale-95 transition"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          className="w-16 h-16 rounded-full border border-line bg-white flex items-center justify-center hover:bg-soft active:scale-95 transition"
        >
          <Icon name="backspace" className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function parseThaiDateParts(iso?: string): { day: string; month: string; year: string } {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      day: String(now.getDate()),
      month: THAI_MONTHS_FULL[now.getMonth()] || '',
      year: String(now.getFullYear() + 543),
    };
  }
  return {
    day: String(d.getDate()),
    month: THAI_MONTHS_FULL[d.getMonth()] || '',
    year: String(d.getFullYear() + 543),
  };
}

// ===== เอกสารราชการ: แบบขอใช้สถานที่ราชการ / แบบคำขอยืมครุภัณฑ์ราชการ =====
export function OfficialGovFormDocument({
  req,
  blankMode = false,
  sampleDocMode = false,
  customFields,
  verification,
}: {
  req?: RequestWithTimeline | null;
  blankMode?: boolean;
  /** แสดงข้อมูลตัวอย่าง */
  sampleDocMode?: boolean;
  verification?: DocumentVerification | null;
  customFields?: {
    formTitle?: string;
    subject?: string;
    toWhom?: string;
    writtenAt?: string;
    day?: string;
    month?: string;
    year?: string;
    requesterName?: string;
    requesterPosition?: string;
    addressHouseNo?: string;
    addressMoo?: string;
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
    organization?: string;
    desireLabel?: string;
    purposeItems?: OfficialFormPurposeItem[];
    periodText?: string;
    attendeesText?: string;
    requesterSignature?: string | null;
    requesterRoleCaption?: string;
  };
}) {
  const [internalVer, setInternalVer] = useState<DocumentVerification | null>(null);

  useEffect(() => {
    if (verification !== undefined) return;
    if (!req?.id) return;
    api.getVerification(req.id)
      .then((v) => {
        if (v) {
          setInternalVer(v);
        } else if (req.status === 'approved' || req.status === 'borrowing' || req.status === 'returned') {
          api.createVerification(req.id).then(setInternalVer).catch(() => {});
        }
      })
      .catch(() => {});
  }, [req?.id, req?.status, verification]);

  const activeVer = verification !== undefined ? verification : internalVer;

  const isBorrow = req?.type === 'borrow';
  const formTitle =
    customFields?.formTitle ||
    (isBorrow ? 'แบบคำขอใช้อุปกรณ์ราชการ' : 'แบบขอใช้สถานที่ราชการ');
  const subject =
    customFields?.subject ||
    (isBorrow ? 'ขออนุญาตใช้อุปกรณ์ของทางราชการ' : 'ขออนุญาตใช้สถานที่ราชการ');
  const toWhom = customFields?.toWhom || 'ผู้มีอำนาจอนุมัติ';
  const desireLabel =
    customFields?.desireLabel ||
    (isBorrow ? 'มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้' : 'มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้');
  const requesterRoleCaption =
    customFields?.requesterRoleCaption ||
    (isBorrow ? 'ผู้ขออนุญาตใช้อุปกรณ์ราชการ' : 'ผู้ขออนุญาตใช้สถานที่ราชการ');

  const dateParts = parseThaiDateParts(req?.createdAt);
  const writtenAt = blankMode
    ? ''
    : sampleDocMode
    ? 'ที่ทำการ'
    : customFields?.writtenAt ?? req?.writtenAt ?? '';
  const day = blankMode ? '' : customFields?.day ?? dateParts.day;
  const month = blankMode ? '' : customFields?.month ?? dateParts.month;
  const year = blankMode ? '' : customFields?.year ?? dateParts.year;

  const requesterName = blankMode
    ? ''
    : customFields?.requesterName ?? req?.requesterName ?? '';
  const requesterPosition = blankMode
    ? ''
    : customFields?.requesterPosition ?? req?.requesterPosition ?? '';
  const addressHouseNo = blankMode
    ? ''
    : customFields?.addressHouseNo ?? req?.addressHouseNo ?? '';
  const addressMoo = blankMode
    ? ''
    : customFields?.addressMoo ?? req?.addressMoo ?? '';
  const addressSubdistrict = blankMode
    ? ''
    : customFields?.addressSubdistrict ?? req?.addressSubdistrict ?? '';
  const addressDistrict = blankMode
    ? ''
    : customFields?.addressDistrict ?? req?.addressDistrict ?? '';
  const addressProvince = blankMode
    ? ''
    : customFields?.addressProvince ?? req?.addressProvince ?? '';
  const organization = blankMode
    ? ''
    : customFields?.organization ?? req?.organization ?? '';

  // รายการข้อ 1..3 เพื่อ...
  let items: OfficialFormPurposeItem[] = [];
  if (blankMode) {
    items = [
      { item: '', forWhat: '' },
      { item: '', forWhat: '' },
      { item: '', forWhat: '' },
    ];
  } else if (sampleDocMode) {
    items = [
      { item: 'อาคารหอประชุม', forWhat: 'จัดประชุมและสัมมนา' },
      { item: 'เครื่องเสียงพร้อมไมโครโฟน 1 ชุด', forWhat: 'ใช้ประกอบการประชุม' },
      { item: '', forWhat: '' },
    ];
  } else if (customFields?.purposeItems && customFields.purposeItems.length > 0) {
    items = [...customFields.purposeItems];
  } else if (req?.purposeItems && req.purposeItems.length > 0) {
    items = [...req.purposeItems];
  } else if (req) {
    const line1Item = req.title || 'อาคารสถานที่';
    const line1For =
      req.type === 'booking'
        ? `${req.activity || req.purpose}${req.attendees ? ` (ผู้เข้าร่วม ${req.attendees} คน)` : ''}`
        : req.type === 'borrow'
        ? req.purpose
        : req.detail;
    const line2Item =
      req.subtitle ||
      (req.type === 'booking' && req.periods.length > 0
        ? `วันที่ใช้สถานที่: ${req.periods.map((p) => formatPeriodRange(p)).join(', ')}`
        : req.type === 'borrow'
        ? `กำหนดยืม-คืน: ${formatThaiDate(req.pickupDate, false)} ถึง ${formatThaiDate(req.returnDate, true)}`
        : '');
    const line2For =
      req.type === 'booking'
        ? req.purpose
        : req.type === 'borrow'
        ? 'ใช้ในกิจกรรมของหน่วยงาน/ชุมชน'
        : '';
    items = [
      { item: line1Item, forWhat: line1For },
      { item: line2Item, forWhat: line2For },
      { item: '', forWhat: '' },
    ];
  } else {
    items = [
      { item: '', forWhat: '' },
      { item: '', forWhat: '' },
      { item: '', forWhat: '' },
    ];
  }

  const reqSig = blankMode ? null : customFields?.requesterSignature ?? req?.requesterSignature ?? null;
  const sigStaff = !blankMode && req && req.type !== 'repair' ? req.signatures.find((s) => s.level === 'staff') : undefined;
  const sigL2 = !blankMode && req && req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l2') : undefined;
  const sigL1 = !blankMode && req && req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l1') : undefined;

  const resolveRoleTitle = (sig: { title?: string } | undefined, fallback: string) => {
    const raw = sig?.title?.trim();
    if (!raw || raw === 'เจ้าหน้าที่ผู้ตรวจสอบ' || raw === 'ผู้พิจารณา' || raw === 'ผู้มีอำนาจอนุมัติ') {
      return fallback;
    }
    return raw;
  };

  const staffRoleTitle = resolveRoleTitle(sigStaff, SIGN_LEVEL_TITLE.staff);
  const l2RoleTitle = resolveRoleTitle(sigL2, SIGN_LEVEL_TITLE.l2);
  const l1RoleTitle = resolveRoleTitle(sigL1, SIGN_LEVEL_TITLE.l1);

  const DottedSpan = ({
    children,
    minW = 'min-w-[80px]',
    className = '',
  }: {
    children?: React.ReactNode;
    minW?: string;
    className?: string;
  }) => (
    <span
      className={`inline-block border-b border-dotted border-[#4A4A4A] px-2 text-center font-semibold text-[#0B2545] leading-snug ${minW} ${className}`}
    >
      {children || '\u00A0'}
    </span>
  );

  return (
    <div className="gov-form-paper bg-white p-5 sm:p-8 text-black text-[13.5px] sm:text-[14.5px] leading-[1.65] relative">
      <div>
        <h2 className="text-center text-[18px] sm:text-[20px] font-bold text-black tracking-wide mb-5">
          {formTitle}
        </h2>

        <div className="flex flex-col items-end gap-1.5 mb-4 text-[13.5px] sm:text-[14px]">
          <div>
            เขียนที่ <DottedSpan minW="min-w-[190px] sm:min-w-[230px]">{writtenAt}</DottedSpan>
          </div>
          <div className="gov-form-date-line">
            วันที่ <DottedSpan minW="min-w-[44px]">{day}</DottedSpan> เดือน{' '}
            <DottedSpan minW="min-w-[100px]">{month}</DottedSpan> พ.ศ.{' '}
            <DottedSpan minW="min-w-[60px]">{year}</DottedSpan>
          </div>
        </div>

        {/* เรื่อง / เรียน */}
        <div className="flex flex-col gap-1 mb-3">
          <div>
            <b>เรื่อง</b>&nbsp;&nbsp;{subject}
          </div>
          <div>
            <b>เรียน</b>&nbsp;&nbsp;{toWhom}
          </div>
        </div>

        {/* ย่อหน้าเนื้อความตามแบบขอใช้สถานที่ราชการ */}
        <div className="flex flex-col gap-1.5 text-left leading-[1.8] mb-3">
          <div className="pl-6 sm:pl-10 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span>ข้าพเจ้า&nbsp;&nbsp;นาย/นาง/นางสาว</span>
            <DottedSpan minW="min-w-[170px] sm:min-w-[210px] flex-1">{requesterName}</DottedSpan>
            <span>ตำแหน่ง</span>
            <DottedSpan minW="min-w-[150px] sm:min-w-[180px] flex-1">{requesterPosition}</DottedSpan>
          </div>
          <div className="gov-form-address flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span>อยู่บ้านเลขที่</span>
            <DottedSpan minW="min-w-[48px]">{addressHouseNo}</DottedSpan>
            <span>หมู่ที่</span>
            <DottedSpan minW="min-w-[38px]">{addressMoo}</DottedSpan>
            <span>ตำบล</span>
            <DottedSpan minW="min-w-[70px]">{addressSubdistrict}</DottedSpan>
            <span>อำเภอ</span>
            <DottedSpan minW="min-w-[70px]">{addressDistrict}</DottedSpan>
            <span>จังหวัด</span>
            <DottedSpan minW="min-w-[80px]">{addressProvince}</DottedSpan>
            <span>หน่วยงาน</span>
            <DottedSpan minW="min-w-[140px] flex-1">{organization}</DottedSpan>
          </div>
          <div>{desireLabel}</div>
        </div>

        {/* รายการ 1..N เพื่อ... */}
        <div className="flex flex-col gap-2 pl-5 sm:pl-10 mb-3">
          {items.map((row, idx) => (
            <div
              key={idx}
              className="gov-form-purpose grid grid-cols-[1.15fr_1fr] gap-2 sm:gap-3 items-baseline"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold shrink-0">{idx + 1}.</span>
                <DottedSpan minW="w-full" className="text-left">
                  {row.item}
                </DottedSpan>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="shrink-0">เพื่อ</span>
                <DottedSpan minW="w-full" className="text-left">
                  {row.forWhat}
                </DottedSpan>
              </div>
            </div>
          ))}
        </div>

        {/* จึงเรียนมาเพื่อพิจารณาอนุญาต */}
        <div className="pl-6 sm:pl-10 mb-3">จึงเรียนมาเพื่อพิจารณาอนุญาต</div>

        {/* ขอแสดงความนับถือ + ลายมือชื่อผู้ขออนุญาตใช้สถานที่ราชการ (ฝ่ายที่ 1) */}
        <div className="gov-form-requester-signature flex justify-end pr-4 sm:pr-8 mb-4">
          <div className="w-[240px] sm:w-[270px] flex flex-col items-center text-center gap-0.5">
            <div>ขอแสดงความนับถือ</div>
            <div className="h-10 w-48 border-b border-dotted border-[#4A4A4A] flex items-center justify-center">
              {reqSig && reqSig.startsWith('data:image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reqSig}
                  alt="ลายเซ็นผู้ขออนุญาต"
                  className="max-h-9 max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-ink-ph italic no-print">
                  {blankMode || sampleDocMode ? '' : 'รอลงลายมือชื่อผู้ขออนุญาต'}
                </span>
              )}
            </div>
            <div>
              (<DottedSpan minW="min-w-[165px]">{requesterName}</DottedSpan>)
            </div>
            <div className="text-[13px]">{requesterRoleCaption}</div>
          </div>
        </div>
      </div>

      <div>
        {/* ความเห็นของเจ้าหน้าที่ (2 คอลัมน์ซ้าย-ขวา ตามแบบฟอร์มราชการ) */}
        <div className="mb-3">
          <b className="block text-[14px] underline underline-offset-4 mb-1.5">
            ความเห็นของเจ้าหน้าที่ผู้ตรวจสอบและผู้พิจารณา
          </b>
          <div className="grid grid-cols-2 gap-5 sm:gap-8">
            {/* ซ้าย: เจ้าหน้าที่ */}
            <div className="flex flex-col items-center text-center gap-0.5">
              <div className="gov-form-staff-signature flex items-baseline justify-center gap-2 w-full">
                <span className="shrink-0">ลงชื่อ</span>
                <div className="h-9 flex-1 max-w-[170px] border-b border-dotted border-[#4A4A4A] flex items-center justify-center">
                  {sigStaff?.signature && sigStaff.signature.startsWith('data:image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sigStaff.signature}
                      alt="ลายเซ็นเจ้าหน้าที่"
                      className="max-h-8 max-w-full object-contain"
                    />
                  ) : null}
                </div>
              </div>
              <div>
                (<DottedSpan minW="min-w-[160px]">{sigStaff?.signerName}</DottedSpan>)
              </div>
              <div className="text-[12.5px]">{staffRoleTitle}</div>
            </div>

            {/* ขวา: ปลัดองค์การบริหารส่วนตำบล */}
            <div className="flex flex-col items-center text-center gap-0.5">
              <div className="gov-form-staff-signature flex items-baseline justify-center gap-2 w-full">
                <span className="shrink-0">ลงชื่อ</span>
                <div className="h-9 flex-1 max-w-[170px] border-b border-dotted border-[#4A4A4A] flex items-center justify-center">
                  {sigL2?.signature && sigL2.signature.startsWith('data:image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sigL2.signature}
                      alt="ลายเซ็นปลัดองค์การบริหารส่วนตำบล"
                      className="max-h-8 max-w-full object-contain"
                    />
                  ) : null}
                </div>
              </div>
              <div>
                (<DottedSpan minW="min-w-[160px]">{sigL2?.signerName}</DottedSpan>)
              </div>
              <div className="text-[12.5px]">{l2RoleTitle}</div>
            </div>
          </div>
        </div>

        {/* คำสั่งของนายกองค์การบริหารส่วนตำบล */}
        <div>
          <b className="block text-[14px] underline underline-offset-4 mb-1.5">
            คำสั่งของนายกองค์การบริหารส่วนตำบล
          </b>
          <div className="max-w-[340px] mx-auto flex flex-col items-center text-center gap-0.5">
            <div className="gov-form-approver-signature flex items-baseline justify-center gap-2 w-full">
              <span className="shrink-0">ลงชื่อ</span>
              <div className="h-9 flex-1 max-w-[180px] border-b border-dotted border-[#4A4A4A] flex items-center justify-center">
                {sigL1?.signature && sigL1.signature.startsWith('data:image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sigL1.signature}
                    alt="ลายเซ็นนายกองค์การบริหารส่วนตำบล"
                    className="max-h-8 max-w-full object-contain"
                  />
                ) : null}
              </div>
            </div>
            <div>
              (<DottedSpan minW="min-w-[160px]">{sigL1?.signerName}</DottedSpan>)
            </div>
            <div className="text-[12.5px]">{l1RoleTitle}</div>
          </div>
        </div>

        {/* QR Code Document Verification (ฝั่งประชาชน: มุมล่างขวาของเอกสาร) */}
        {activeVer && activeVer.qrCodeDataUrl && (
          <div className="mt-6 pt-3 border-t border-dashed border-[#8A8A8A] flex flex-wrap items-center justify-between gap-3 text-[11px] leading-relaxed text-[#2C3E50]">
            <div className="flex items-center gap-3">
              <div className="w-[74px] h-[74px] shrink-0 border border-[#CBD5E1] rounded-lg p-1 bg-white shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeVer.qrCodeDataUrl}
                  alt={`QR Code ตรวจสอบเอกสาร ${activeVer.documentNumber}`}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-0.5 text-left">
                <span className="font-bold text-[12px] text-[#0B2545] flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#10B981]"></span>
                  เอกสารดิจิทัลผ่านการรับรองและลงนามอิเล็กทรอนิกส์
                </span>
                <div>
                  <b>เลขที่เอกสาร:</b>{' '}
                  <span className="font-mono text-[#0B2545]">{activeVer.documentNumber}</span>{' '}
                  (ฉบับที่ {activeVer.version})
                </div>
                <div>
                  <b>วันที่ออกเอกสาร:</b> {formatThaiDateTime(activeVer.issuedAt, true)}
                </div>
                <div>
                  <b>หน่วยงานผู้ออกเอกสาร:</b> {activeVer.issuingOrg || 'องค์การบริหารส่วนตำบลน้ำชำ'}
                </div>
                <div className="text-[10px] text-[#64748B] font-mono break-all">
                  รหัสยืนยัน: {activeVer.verificationToken}
                </div>
              </div>
            </div>
            <div className="text-right text-[11px] text-[#475569] flex flex-col items-end">
              <span className="font-semibold text-[#0B2545]">สแกน QR Code เพื่อตรวจสอบความถูกต้อง</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
