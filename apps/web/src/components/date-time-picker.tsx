'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { formatMonthTitle, formatThaiDate } from '@/lib/api';

export function DatePickerField({
  value,
  onChange,
  label,
  minDate,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value ? value.slice(0, 7) : new Date().toISOString().slice(0, 7));
  const [year, monthNumber] = viewMonth.split('-').map(Number);
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const shiftMonth = (amount: number) => {
    const next = new Date(year, monthNumber - 1 + amount, 1);
    setViewMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && value) setViewMonth(value.slice(0, 7));
          setOpen((current) => !current);
        }}
        className="jw-in flex w-full items-center justify-between gap-2 px-3 text-left"
      >
        <span className="truncate text-[13px] font-semibold text-ink">{formatThaiDate(value, true)}</span>
        <CalendarDays className="size-4 shrink-0 text-brand" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="ปิดปฏิทิน"
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-2xl border border-line bg-white p-3 shadow-high sm:w-[300px]"
          >
            <div className="mb-2 flex items-center justify-between">
              <b className="text-[14px] font-bold text-ink">{formatMonthTitle(viewMonth)}</b>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="เดือนก่อนหน้า"
                  onClick={(e) => {
                    e.stopPropagation();
                    shiftMonth(-1);
                  }}
                  className="flex size-8 items-center justify-center rounded-full border border-line text-ink hover:bg-soft"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="เดือนถัดไป"
                  onClick={(e) => {
                    e.stopPropagation();
                    shiftMonth(1);
                  }}
                  className="flex size-8 items-center justify-center rounded-full border border-line text-ink hover:bg-soft"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((weekday) => (
                <span key={weekday} className="flex h-8 items-center justify-center text-[11px] font-semibold text-ink-mute">
                  {weekday}
                </span>
              ))}
              {Array.from({ length: firstWeekday }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1;
                const date = `${viewMonth}-${String(day).padStart(2, '0')}`;
                const selected = date === value;
                const isToday = date === todayString;
                const isBeforeMin = minDate ? date < minDate : false;
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={isBeforeMin}
                    title={isBeforeMin ? `ต้องจองตั้งแต่วันที่ ${formatThaiDate(minDate, false)} เป็นต้นไป` : undefined}
                    aria-pressed={selected}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isBeforeMin) return;
                      onChange(date);
                      setOpen(false);
                    }}
                    className={`mx-auto flex size-9 items-center justify-center rounded-full text-[13px] transition ${
                      selected
                        ? 'bg-brand font-bold text-white'
                        : isBeforeMin
                        ? 'text-ink-mute/50 line-through cursor-not-allowed'
                        : isToday
                        ? 'border border-brand font-semibold text-brand-ink'
                        : 'text-ink hover:bg-brand-tint'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

export function TimePickerField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const hourWheelRef = useRef<HTMLDivElement>(null);
  const minuteWheelRef = useRef<HTMLDivElement>(null);
  const initialTimeRef = useRef(value);
  const [selectedHour, selectedMinute] = (value || '09:00').split(':');

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const [hour, minute] = (initialTimeRef.current || '09:00').split(':');
      if (hourWheelRef.current) hourWheelRef.current.scrollTop = Number(hour) * 36;
      if (minuteWheelRef.current) minuteWheelRef.current.scrollTop = Number(minute) * 36;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const updateHour = (hour: string) => onChange(`${hour}:${selectedMinute}`);
  const updateMinute = (minute: string) => onChange(`${selectedHour}:${minute}`);

  const handleWheelScroll = (kind: 'hour' | 'minute', event: React.UIEvent<HTMLDivElement>) => {
    const options = kind === 'hour' ? HOUR_OPTIONS : MINUTE_OPTIONS;
    const index = Math.max(0, Math.min(options.length - 1, Math.round(event.currentTarget.scrollTop / 36)));
    if (kind === 'hour') updateHour(options[index]);
    else updateMinute(options[index]);
  };

  const renderWheel = (kind: 'hour' | 'minute', options: string[], selected: string, ref: React.RefObject<HTMLDivElement | null>) => (
    <div className="relative h-[180px] min-w-0 flex-1 overflow-hidden rounded-2xl bg-[#F7F8F6]">
      <div className="pointer-events-none absolute inset-x-1 top-[72px] z-10 h-9 rounded-xl border border-brand/20 bg-brand/10" />
      <div
        ref={ref}
        role="listbox"
        aria-label={kind === 'hour' ? 'เลือกชั่วโมง' : 'เลือกนาที'}
        onScroll={(event) => handleWheelScroll(kind, event)}
        className="relative z-0 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div aria-hidden="true" className="h-[72px]" />
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={option === selected}
            onClick={(e) => {
              e.stopPropagation();
              const wheel = kind === 'hour' ? hourWheelRef.current : minuteWheelRef.current;
              wheel?.scrollTo({ top: Number(option) * 36, behavior: 'smooth' });
              if (kind === 'hour') updateHour(option);
              else updateMinute(option);
            }}
            className={`flex h-9 w-full snap-center items-center justify-center text-[16px] tabular-nums transition-colors ${
              option === selected ? 'font-bold text-brand-ink' : 'font-medium text-ink-mute'
            }`}
          >
            {option}
          </button>
        ))}
        <div aria-hidden="true" className="h-[72px]" />
      </div>
    </div>
  );

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) initialTimeRef.current = value;
          setOpen((current) => !current);
        }}
        className="jw-in flex items-center justify-between gap-1 px-2.5 text-[13px] font-semibold tabular-nums"
      >
        <span>{value}</span>
        <span className="flex items-center gap-1 text-brand">
          <Clock3 className="size-4" />
          <ChevronDown className="size-3.5" />
        </span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="ปิดตัวเลือกเวลา"
            className="fixed inset-0 z-20 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-2xl border border-line bg-white p-3 shadow-high"
          >
            <div className="mb-2 flex justify-around text-[11px] font-medium text-ink-mute">
              <span>ชั่วโมง</span>
              <span>นาที</span>
            </div>
            <div className="flex items-center gap-2">
              {renderWheel('hour', HOUR_OPTIONS, selectedHour, hourWheelRef)}
              <span className="text-lg font-bold text-ink">:</span>
              {renderWheel('minute', MINUTE_OPTIONS, selectedMinute, minuteWheelRef)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

