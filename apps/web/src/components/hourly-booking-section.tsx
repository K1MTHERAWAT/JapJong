'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ConflictInfo, DayAvailability, Period, Venue } from '@japjong/shared';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
import { CalendarC4 } from '@/components/ui-widgets';
import { api, formatThaiDate } from '@/lib/api';
import {
  formatDurationThai,
  getDayDiff,
  getTodayBkk,
  minutesToTime,
  timeToMinutes,
} from '@/lib/hourly-booking-utils';

export interface HourlyBookingSectionProps {
  selectedVenues: Venue[];
  availability: DayAvailability[];
  month: string;
  onMonthChange: (ym: string) => void;
  period?: Period | null;
  periods?: Period[];
  onSelectPeriod?: (period: Period | null) => void;
  onSelectPeriods?: (periods: Period[]) => void;
  onSwitchToDaily: () => void;
  bookingMode: 'hourly' | 'daily';
}

export function HourlyBookingSection({
  selectedVenues,
  availability,
  month,
  onMonthChange,
  period,
  periods,
  onSelectPeriod,
  onSelectPeriods,
  onSwitchToDaily,
  bookingMode,
}: HourlyBookingSectionProps) {
  const todayBkk = useMemo(() => getTodayBkk(), []);

  // รองรับทั้ง periods (หลายช่วงเวลา) และ period (ช่วงเวลาเดียว สำหรับ backward compatibility)
  const effectivePeriods: Period[] = useMemo(() => {
    if (periods && periods.length > 0) return periods;
    if (period) return [period];
    return [];
  }, [periods, period]);

  const updatePeriods = (nextPeriods: Period[]) => {
    if (onSelectPeriods) {
      onSelectPeriods(nextPeriods);
    }
    if (onSelectPeriod) {
      onSelectPeriod(nextPeriods[0] || null);
    }
  };

  // 1. เงื่อนไขวันจองล่วงหน้าขั้นต่ำตามที่สถานที่กำหนด (Dynamic minAdvanceDays)
  const minAdvanceDays = useMemo(() => {
    if (!selectedVenues.length) return 0;
    return Math.max(...selectedVenues.map((v) => Number(v.advanceDays ?? 0)));
  }, [selectedVenues]);

  // วันที่เร็วที่สุดที่สามารถจองได้
  const earliestBookableDate = useMemo(() => {
    const [y, m, d] = todayBkk.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + minAdvanceDays));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }, [todayBkk, minAdvanceDays]);

  // เวลาเปิด-ปิดทำการของสถานที่ (Effective Open/Close Time)
  const effectiveOpenTime = useMemo(() => {
    if (!selectedVenues.length) return '08:00';
    return selectedVenues.map((v) => v.openTime || '08:00').reduce((max, cur) => (cur > max ? cur : max), '00:00');
  }, [selectedVenues]);

  const effectiveCloseTime = useMemo(() => {
    if (!selectedVenues.length) return '17:00';
    return selectedVenues.map((v) => v.closeTime || '17:00').reduce((min, cur) => (cur < min ? cur : min), '23:59');
  }, [selectedVenues]);

  // วันที่เปิดให้บริการ (openDays)
  const effectiveOpenDays = useMemo(() => {
    if (!selectedVenues.length) return undefined;
    const hasAnyDays = selectedVenues.some((v) => v.openDays && v.openDays.length > 0);
    if (!hasAnyDays) return undefined;
    return [0, 1, 2, 3, 4, 5, 6].filter((day) =>
      selectedVenues.every((v) => !v.openDays || v.openDays.length === 0 || v.openDays.includes(day)),
    );
  }, [selectedVenues]);

  // วันที่เลือกปัจจุบัน (internalDate หรือ วันที่ของช่วงเวลาแรกที่เลือก)
  const [internalDate, setInternalDate] = useState<string>('');
  const selectedDate = useMemo(() => {
    if (internalDate) return internalDate;
    if (effectivePeriods.length > 0) return effectivePeriods[0].start.slice(0, 10);
    return '';
  }, [internalDate, effectivePeriods]);

  // รอบเวลา 1 ชั่วโมงทั้งหมดในวันเปิดทำการ
  const oneHourSlots = useMemo(() => {
    const openM = timeToMinutes(effectiveOpenTime);
    const closeM = timeToMinutes(effectiveCloseTime);
    const slots: { start: string; end: string; startM: number; endM: number }[] = [];
    for (let m = openM; m + 60 <= closeM; m += 60) {
      slots.push({
        start: minutesToTime(m),
        end: minutesToTime(m + 60),
        startM: m,
        endM: m + 60,
      });
    }
    return slots;
  }, [effectiveOpenTime, effectiveCloseTime]);

  // ฟังก์ชันตรวจสอบว่า slot นั้นถูกเลือกอยู่ในช่วงเวลาใดๆ ของ selectedDate หรือไม่
  const isSlotSelected = (slot: { startM: number; endM: number }) => {
    return effectivePeriods.some((p) => {
      if (p.start.slice(0, 10) !== selectedDate) return false;
      const pStartM = timeToMinutes(p.start.slice(11, 16));
      const pEndM = timeToMinutes(p.end.slice(11, 16));
      return slot.startM >= pStartM && slot.endM <= pEndM;
    });
  };

  // ตรวจสอบรอบเวลา 1 ชั่วโมงที่ถูกจองแล้วในวันที่เลือก
  const [bookedSlotIndices, setBookedSlotIndices] = useState<number[]>([]);
  const [checkingSlots, setCheckingSlots] = useState(false);

  const venueIdsKey = useMemo(() => selectedVenues.map((v) => v.id).sort().join(','), [selectedVenues]);
  const oneHourSlotsKey = useMemo(() => oneHourSlots.map((s) => `${s.start}-${s.end}`).join(','), [oneHourSlots]);

  useEffect(() => {
    if (!selectedDate || !selectedVenues.length || !oneHourSlots.length) {
      setBookedSlotIndices((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const testPeriods: Period[] = oneHourSlots.map((s) => ({
      start: `${selectedDate}T${s.start}:00+07:00`,
      end: `${selectedDate}T${s.end}:00+07:00`,
    }));

    let active = true;
    setCheckingSlots(true);
    api
      .checkConflicts(
        selectedVenues.map((v) => v.id),
        testPeriods,
      )
      .then((res) => {
        if (!active) return;
        const booked = res.conflicts.map((c) => c.periodIndex);
        setBookedSlotIndices((prev) => {
          if (prev.length === booked.length && prev.every((v, i) => v === booked[i])) {
            return prev;
          }
          return booked;
        });
      })
      .catch(() => {
        if (active) setBookedSlotIndices((prev) => (prev.length === 0 ? prev : []));
      })
      .finally(() => {
        if (active) setCheckingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [selectedDate, venueIdsKey, oneHourSlotsKey]);

  // State สำหรับ Modal กำหนดเวลาเอง (Custom Time)
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customStartTime, setCustomStartTime] = useState(effectiveOpenTime);
  const [customEndTime, setCustomEndTime] = useState(
    minutesToTime(Math.min(timeToMinutes(effectiveCloseTime), timeToMinutes(effectiveOpenTime) + 90)),
  );
  const [customError, setCustomError] = useState<string | null>(null);
  const [customChecking, setCustomChecking] = useState(false);

  // คำนวณช่วงเวลาในวันที่เลือกปัจจุบัน
  const periodsOnSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return effectivePeriods.filter((p) => p.start.slice(0, 10) === selectedDate);
  }, [effectivePeriods, selectedDate]);

  // ฟังก์ชันตรวจสอบสถานะของวันแต่ละวันในปฏิทิน
  const getDateStatus = (dateStr: string) => {
    const isPast = dateStr < todayBkk;
    const diff = getDayDiff(dateStr, todayBkk);
    const isAdvanceRestricted = !isPast && minAdvanceDays > 0 && diff < minAdvanceDays;

    const [y, m, d] = dateStr.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const isClosed = effectiveOpenDays ? !effectiveOpenDays.includes(dayOfWeek) : false;

    const av = availability.find((a) => a.date === dateStr);
    const isFull = av?.level === 'full';

    let reason: string | null = null;
    if (isPast) reason = 'วันที่ผ่านมาแล้ว';
    else if (isAdvanceRestricted)
      reason = `ต้องจองล่วงหน้าอย่างน้อย ${minAdvanceDays} วัน (จองได้ตั้งแต่วันที่ ${formatThaiDate(earliestBookableDate, false)})`;
    else if (isClosed) reason = 'สถานที่ปิดให้บริการในวันดังกล่าว';
    else if (isFull) reason = 'มีการจองเต็มแล้วทุกช่วงเวลา';

    const disabled = isPast || isAdvanceRestricted || isClosed || isFull;
    return { disabled, reason, isPast, isAdvanceRestricted, isClosed, isFull };
  };

  // เมื่อผู้ใช้เลือกวันในปฏิทิน
  const handleSelectDate = (dateStr: string) => {
    const status = getDateStatus(dateStr);
    if (status.disabled) return;
    setInternalDate(dateStr);

    // หากยังไม่มีช่วงเวลาที่เลือกเลย ให้เลือกช่วงเวลาเริ่มต้นที่เปิดทำการ
    if (effectivePeriods.length === 0) {
      const defaultStart = effectiveOpenTime;
      const defaultEnd = minutesToTime(timeToMinutes(defaultStart) + 60);
      updatePeriods([
        {
          start: `${dateStr}T${defaultStart}:00+07:00`,
          end: `${dateStr}T${defaultEnd}:00+07:00`,
        },
      ]);
    }
  };

  // เมื่อผู้ใช้คลิกเลือก Slot 1 ชั่วโมง (รองรับการเลือกข้ามช่วง และหลายช่วงเวลาได้อย่างอิสระ)
  const handleSlotClick = (slotIndex: number) => {
    if (bookedSlotIndices.includes(slotIndex)) return;
    if (!selectedDate) return;

    const clickedSlot = oneHourSlots[slotIndex];
    if (!clickedSlot) return;

    // หา slot indices ที่ถูกเลือกอยู่ในวันที่เลือกปัจจุบัน
    const currentlySelectedIndices = oneHourSlots
      .map((s, idx) => (isSlotSelected(s) ? idx : -1))
      .filter((idx) => idx !== -1);

    const isAlreadySelected = currentlySelectedIndices.includes(slotIndex);

    let nextIndices: number[];
    if (isAlreadySelected) {
      // แตะซ้ำที่ช่องเดิมเพื่อยกเลิกการเลือก (Deselect)
      nextIndices = currentlySelectedIndices.filter((idx) => idx !== slotIndex);
    } else {
      // แตะเพื่อเลือกช่องนี้ (ข้ามช่วงได้ เช่น เช้า 09:00-12:00 และ บ่าย 13:00-16:00 ข้ามช่วงเที่ยง)
      nextIndices = [...currentlySelectedIndices, slotIndex].sort((a, b) => a - b);
    }

    // จัดกลุ่มช่องที่ต่อเนื่องกันเป็นช่วงเวลา (Period)
    // ช่องที่อยู่ติดกันจะรวมเป็นช่วงเวลาเดียว ส่วนช่องที่เว้นระยะจะแยกเป็นช่วงใหม่ (ข้ามช่วงได้)
    const blocks: { startM: number; endM: number }[] = [];
    let currentBlock: { startM: number; endM: number } | null = null;

    for (const idx of nextIndices) {
      const s = oneHourSlots[idx];
      if (!currentBlock) {
        currentBlock = { startM: s.startM, endM: s.endM };
      } else if (s.startM === currentBlock.endM) {
        currentBlock.endM = s.endM;
      } else {
        blocks.push(currentBlock);
        currentBlock = { startM: s.startM, endM: s.endM };
      }
    }
    if (currentBlock) {
      blocks.push(currentBlock);
    }

    const newDatePeriods: Period[] = blocks.map((b) => ({
      start: `${selectedDate}T${minutesToTime(b.startM)}:00+07:00`,
      end: `${selectedDate}T${minutesToTime(b.endM)}:00+07:00`,
    }));

    // รวมกับช่วงเวลาของวันอื่นๆ (ถ้ามี)
    const otherDatePeriods = effectivePeriods.filter((p) => p.start.slice(0, 10) !== selectedDate);
    const finalPeriods = [...otherDatePeriods, ...newDatePeriods].sort((a, b) => a.start.localeCompare(b.start));

    updatePeriods(finalPeriods);
  };

  // ตรวจสอบและบันทึกเวลาที่กำหนดเอง (Custom Time)
  const handleConfirmCustomTime = async () => {
    setCustomError(null);
    if (!selectedDate) {
      setCustomError('กรุณาเลือกวันที่ก่อน');
      return;
    }

    const startM = timeToMinutes(customStartTime);
    const endM = timeToMinutes(customEndTime);
    const openM = timeToMinutes(effectiveOpenTime);
    const closeM = timeToMinutes(effectiveCloseTime);

    if (startM < openM) {
      setCustomError(`เวลาเริ่มต้น (${customStartTime} น.) ต้องไม่เร็วกว่าเวลาเปิดทำการ (${effectiveOpenTime} น.)`);
      return;
    }
    if (endM > closeM) {
      setCustomError(`เวลาสิ้นสุด (${customEndTime} น.) ต้องไม่เกินเวลาปิดทำการ (${effectiveCloseTime} น.)`);
      return;
    }
    if (endM <= startM) {
      setCustomError('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น');
      return;
    }
    if (endM - startM < 15) {
      setCustomError('ระยะเวลาใช้งานขั้นต่ำต้องไม่น้อยกว่า 15 นาที');
      return;
    }

    // ตรวจสอบกับ Backend API ว่าช่วงเวลาที่กำหนดเองซ้อนทับกับการจองอื่นหรือไม่
    const testPeriod: Period = {
      start: `${selectedDate}T${customStartTime}:00+07:00`,
      end: `${selectedDate}T${customEndTime}:00+07:00`,
    };

    setCustomChecking(true);
    try {
      const res = await api.checkConflicts(
        selectedVenues.map((v) => v.id),
        [testPeriod],
      );
      if (res.conflicts.length > 0) {
        setCustomError(
          `ช่วงเวลา ${customStartTime} - ${customEndTime} น. มีผู้จองแล้ว (${res.conflicts[0].venueName}) กรุณาเลือกช่วงเวลาอื่น`,
        );
        return;
      }

      // ใช้งานช่วงเวลาที่กำหนดเอง (กรองช่วงเวลาที่ซ้อนทับออก แล้วรวมเข้ากับช่วงเวลาเดิม ทำให้เลือกข้ามช่วงได้)
      const nonOverlapping = effectivePeriods.filter(
        (p) => !(p.start < testPeriod.end && p.end > testPeriod.start),
      );
      const nextPeriods = [...nonOverlapping, testPeriod].sort((a, b) => a.start.localeCompare(b.start));
      updatePeriods(nextPeriods);
      setIsCustomModalOpen(false);
    } catch {
      setCustomError('เกิดข้อผิดพลาดในการตรวจสอบเวลาว่าง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setCustomChecking(false);
    }
  };

  // ฟังก์ชันลัดปรับ Custom Duration (เช่น +1.5 ชม.)
  const applyDurationPreset = (hours: number) => {
    const startM = timeToMinutes(customStartTime);
    const nextEndM = Math.min(timeToMinutes(effectiveCloseTime), startM + Math.round(hours * 60));
    setCustomEndTime(minutesToTime(nextEndM));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ================= แถบสลับโหมด: รายชั่วโมง (Default) & รายวัน (Secondary) ================= */}
      <div className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                2
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="text-[15px] sm:text-[16px] text-ink leading-tight">เลือกวันและเวลาใช้งาน</b>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/20">
                    ขั้นตอนที่ 2 จาก 5
                  </span>
                </div>
                <p className="text-[12px] text-ink-mute mt-0.5">
                  {selectedVenues.map((v) => v.name).join(', ')} · เปิดบริการ {effectiveOpenTime} - {effectiveCloseTime} น.
                </p>
              </div>
            </div>
          </div>

          {/* ปุ่มสลับโหมด */}
          <div className="flex items-center gap-1.5 bg-canvas p-1 rounded-full border border-line">
            <button
              type="button"
              aria-pressed={bookingMode === 'hourly'}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-brand text-white shadow-xs transition"
            >
              <Icon name="clock" className="w-3.5 h-3.5 text-white" />
              <span>รายชั่วโมง</span>
            </button>

            <button
              type="button"
              onClick={onSwitchToDaily}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium text-ink-soft hover:text-ink hover:bg-hover transition"
              title="สลับไปโหมดรายวัน"
            >
              <Icon name="calendar" className="w-3.5 h-3.5 text-ink-mute" />
              <span>รายวัน</span>
            </button>
          </div>
        </div>
        <div className="w-full h-[3px] bg-line/30">
          <div className="h-full bg-brand transition-all duration-300" style={{ width: '40%' }} />
        </div>
      </div>

      {/* แจ้งเตือนเงื่อนไขการจองล่วงหน้าขั้นต่ำ */}
      {minAdvanceDays > 0 && (
        <div className="p-3 bg-brand-mint/50 border border-brand/20 rounded-xl flex items-center gap-2.5 text-[12px] text-brand-dark">
          <Icon name="info" className="w-4 h-4 text-brand shrink-0" />
          <span>
            <b>เงื่อนไขการจองล่วงหน้า:</b> สถานที่นี้กำหนดให้ต้องจองล่วงหน้าอย่างน้อย <b>{minAdvanceDays} วัน</b>{' '}
            (สามารถเลือกวันได้ตั้งแต่วันที่ <b>{formatThaiDate(earliestBookableDate, true)}</b> เป็นต้นไป)
          </span>
        </div>
      )}

      {/* ================= ส่วนเนื้อหาหลัก: Step 1 (Calendar) & Step 2 (Time Slots) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.1fr] gap-5 items-start">
        {/* คอลัมน์ซ้าย: Step 1 เลือกวันที่ */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <b className="text-[15px] text-ink flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-brand-mint text-brand text-[12px] font-bold flex items-center justify-center">
                1
              </span>
              เลือกวันที่ต้องการจอง
            </b>
            {selectedDate && (
              <span className="text-[12px] font-semibold text-brand bg-brand-mint px-2 py-0.5 rounded-full">
                {formatThaiDate(selectedDate, true)}
              </span>
            )}
          </div>

          <CalendarC4
            month={month}
            onMonthChange={onMonthChange}
            availability={availability}
            periods={effectivePeriods}
            conflictPeriodIndexes={[]}
            onPickDate={handleSelectDate}
            minAdvanceDays={minAdvanceDays}
            openDays={effectiveOpenDays}
            selectedDate={selectedDate}
            disabledDates={(d) => {
              const st = getDateStatus(d);
              return { disabled: st.disabled, reason: st.reason || undefined };
            }}
          />

          <div className="text-[12px] text-ink-mute flex items-center gap-1.5 px-1">
            <Icon name="calendar" className="w-4 h-4 text-brand shrink-0" />
            <span>แตะวันที่ในปฏิทินเพื่อเลือกวัน จากนั้นระบบจะแสดงรอบเวลาที่ว่างให้เลือก</span>
          </div>
        </div>

        {/* คอลัมน์ขวา: Step 2 เลือกรอบเวลา (1-Hour Slots & Custom Time) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <b className="text-[15px] text-ink flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-brand-mint text-brand text-[12px] font-bold flex items-center justify-center">
                2
              </span>
              เลือกรอบเวลา (รอบละ 1 ชม.)
            </b>

            {/* ปุ่มกำหนดเวลาเอง (Custom Time) */}
            <button
              type="button"
              disabled={!selectedDate}
              onClick={() => {
                setCustomStartTime(effectiveOpenTime);
                setCustomEndTime(minutesToTime(timeToMinutes(effectiveOpenTime) + 90));
                setIsCustomModalOpen(true);
              }}
              className="text-[12px] font-semibold text-brand hover:text-brand-dark flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand/30 hover:bg-brand-mint transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              <span>กำหนดเวลาเอง</span>
            </button>
          </div>

          {!selectedDate ? (
            <div className="jw-card p-8 flex flex-col items-center justify-center text-center gap-2.5 border-dashed border-line">
              <div className="w-12 h-12 rounded-full bg-soft text-ink-mute flex items-center justify-center">
                <Icon name="calendar" className="w-6 h-6" />
              </div>
              <b className="text-[14px] text-ink">กรุณาเลือกวันที่ต้องการจองก่อน</b>
              <p className="text-[12px] text-ink-mute max-w-xs">
                เลือกวันที่ในปฏิทินทางซ้ายมือที่เปิดให้บริการและมีเวลาว่าง เพื่อดูรอบเวลาที่สามารถจองได้
              </p>
            </div>
          ) : (
            <div className="jw-card p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-line/60">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-mute">วันที่เลือก:</span>
                  <b className="text-[13px] text-ink">{formatThaiDate(selectedDate, true)}</b>
                </div>
                {checkingSlots && (
                  <span className="text-[11px] text-ink-mute animate-pulse">กำลังตรวจสอบรอบว่าง...</span>
                )}
              </div>

              {/* ตารางรอบเวลา 1 ชั่วโมง */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {oneHourSlots.map((slot, idx) => {
                  const isBooked = bookedSlotIndices.includes(idx);
                  const isSelected = isSlotSelected(slot);

                  return (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={isBooked}
                      onClick={() => handleSlotClick(idx)}
                      className={`p-3 rounded-xl text-left border transition flex flex-col justify-between min-h-[64px] ${
                        isBooked
                          ? 'bg-soft/70 border-line opacity-55 cursor-not-allowed'
                          : isSelected
                          ? 'bg-brand text-white border-brand shadow-sm font-semibold ring-2 ring-brand/30'
                          : 'bg-white text-ink border-line hover:border-brand hover:bg-brand-mint/40'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-[13px] font-semibold ${
                            isSelected ? 'text-white' : isBooked ? 'text-ink-mute line-through' : 'text-ink'
                          }`}
                        >
                          {slot.start} - {slot.end}
                        </span>
                        {isSelected && <Icon name="check" className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>

                      <div className="text-[11px] mt-1">
                        {isBooked ? (
                          <span className="text-status-crit font-medium">เต็มแล้ว</span>
                        ) : isSelected ? (
                          <span className="text-brand-mint font-medium">เลือกช่วงนี้</span>
                        ) : (
                          <span className="text-brand font-medium">ว่าง (1 ชม.)</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-[11px] text-ink-mute flex items-center justify-between pt-1">
                <span>* แตะเลือกรอบเวลาที่ต้องการ (สามารถแตะเลือกหลายช่วง ข้ามช่วงเวลาพัก หรือข้ามช่วงที่ติดจองได้)</span>
                <span className="text-brand">เปิดบริการ {effectiveOpenTime} - {effectiveCloseTime} น.</span>
              </div>
            </div>
          )}

          {/* ================= Step 4: สรุปการจอง (Booking Summary) ================= */}
          {effectivePeriods.length > 0 && (
            <div className="jw-card p-4 sm:p-5 flex flex-col gap-3 bg-brand-mint/30 border border-brand/20">
              <div className="flex items-center justify-between">
                <b className="text-[14px] text-ink flex items-center gap-1.5">
                  <Icon name="check" className="w-4 h-4 text-brand" strokeWidth={3} /> สรุปช่วงเวลาที่เลือก
                  <span className="text-[12px] font-normal text-ink-mute">
                    ({effectivePeriods.length} ช่วงเวลา)
                  </span>
                </b>
                <Chip tone="green">พร้อมใช้งาน</Chip>
              </div>

              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-ink-mute">สถานที่:</span>
                  <span className="font-semibold text-ink text-right">
                    {selectedVenues.map((v) => v.name).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-mute">วันที่:</span>
                  <span className="font-semibold text-ink">
                    {Array.from(new Set(effectivePeriods.map((p) => p.start.slice(0, 10))))
                      .map((d) => formatThaiDate(d, true))
                      .join(', ')}
                  </span>
                </div>

                {/* รายการแต่ละช่วงเวลา (ข้ามช่วงได้) */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-ink-mute text-[12px] font-medium">รอบเวลาที่เลือก:</span>
                  <div className="flex flex-col gap-1 pl-2 border-l-2 border-brand/40">
                    {effectivePeriods.map((p, idx) => {
                      const durM = timeToMinutes(p.end.slice(11, 16)) - timeToMinutes(p.start.slice(11, 16));
                      return (
                        <div key={idx} className="flex items-center justify-between text-[13px] py-0.5">
                          <span className="font-semibold text-ink">
                            ช่วงที่ {idx + 1}: {p.start.slice(11, 16)} - {p.end.slice(11, 16)} น.
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-brand text-[12px] font-medium">
                              ({formatDurationThai(durM)})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = effectivePeriods.filter((_, i) => i !== idx);
                                updatePeriods(next);
                              }}
                              className="text-ink-mute hover:text-status-crit transition p-0.5"
                              title="ลบช่วงเวลานี้"
                            >
                              <Icon name="x" className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-between pt-1 border-t border-brand/10">
                  <span className="text-ink-mute">ระยะเวลารวม:</span>
                  <span className="font-bold text-ink">
                    {formatDurationThai(
                      effectivePeriods.reduce((sum, p) => {
                        return sum + (timeToMinutes(p.end.slice(11, 16)) - timeToMinutes(p.start.slice(11, 16)));
                      }, 0),
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-mute">รูปแบบ:</span>
                  <span className="text-ink">
                    จองรายชั่วโมง {effectivePeriods.length > 1 ? '(หลายช่วงเวลา / ข้ามช่วง)' : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-brand/10">
                <button
                  type="button"
                  onClick={() => updatePeriods([])}
                  className="text-[12px] text-ink-mute hover:text-status-crit transition"
                >
                  ล้างเวลาที่เลือกทั้งหมด
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= Modal: กำหนดเวลาเอง (Custom Time) ================= */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-high border border-line flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div>
                <b className="text-[16px] text-ink">กำหนดเวลาเอง (Custom Time)</b>
                <p className="text-[12px] text-ink-mute">
                  {formatThaiDate(selectedDate, true)} · เปิดบริการ {effectiveOpenTime} - {effectiveCloseTime} น.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="w-7 h-7 rounded-full bg-soft text-ink-mute flex items-center justify-center hover:text-ink"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-ink-soft">เวลาเริ่มต้น</label>
                <input
                  type="time"
                  value={customStartTime}
                  onChange={(e) => setCustomStartTime(e.target.value)}
                  min={effectiveOpenTime}
                  max={effectiveCloseTime}
                  className="jw-in text-[14px] font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-ink-soft">เวลาสิ้นสุด</label>
                <input
                  type="time"
                  value={customEndTime}
                  onChange={(e) => setCustomEndTime(e.target.value)}
                  min={effectiveOpenTime}
                  max={effectiveCloseTime}
                  className="jw-in text-[14px] font-medium"
                />
              </div>
            </div>

            {/* Quick Duration Preset Chips */}
            <div>
              <span className="text-[11px] font-semibold text-ink-mute block mb-1.5">
                ปุ่มเลือกด่วน (จากเวลาเริ่มต้น):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[1.0, 1.5, 2.0, 2.5, 3.0].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => applyDurationPreset(h)}
                    className="px-2.5 py-1 text-[12px] font-medium border border-line rounded-lg bg-soft hover:bg-brand-mint hover:border-brand transition"
                  >
                    + {h} ชม.
                  </button>
                ))}
              </div>
            </div>

            {/* สรุปเวลาใน Modal */}
            <div className="p-3 bg-soft rounded-xl text-[12px] flex items-center justify-between">
              <span className="text-ink-mute">ระยะเวลาที่เลือก:</span>
              <b className="text-ink text-[13px]">
                {formatDurationThai(timeToMinutes(customEndTime) - timeToMinutes(customStartTime))}
              </b>
            </div>

            {/* แสดง Error Message ถ้ามี */}
            {customError && (
              <div className="p-2.5 rounded-xl bg-status-crit/10 border border-status-crit/30 text-status-crit text-[12px]">
                {customError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="jw-btn-sec px-4 py-2 text-[13px]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={customChecking}
                onClick={handleConfirmCustomTime}
                className="jw-btn px-5 py-2 text-[13px]"
              >
                {customChecking ? 'กำลังตรวจสอบ...' : 'ยืนยันเวลา'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
