import { describe, expect, it } from 'vitest';
import {
  formatDurationThai,
  getDayDiff,
  getTodayBkk,
  minutesToTime,
  timeToMinutes,
} from '../lib/hourly-booking-utils';

describe('HourlyBooking Helper Logic', () => {
  it('formats duration in Thai correctly', () => {
    expect(formatDurationThai(0)).toBe('0 นาที');
    expect(formatDurationThai(30)).toBe('30 นาที');
    expect(formatDurationThai(60)).toBe('1 ชั่วโมง');
    expect(formatDurationThai(90)).toBe('1 ชั่วโมง 30 นาที');
    expect(formatDurationThai(150)).toBe('2 ชั่วโมง 30 นาที');
    expect(formatDurationThai(165)).toBe('2 ชั่วโมง 45 นาที');
    expect(formatDurationThai(180)).toBe('3 ชั่วโมง');
  });

  it('converts time to minutes and back accurately', () => {
    expect(timeToMinutes('09:00')).toBe(540);
    expect(timeToMinutes('10:30')).toBe(630);
    expect(minutesToTime(540)).toBe('09:00');
    expect(minutesToTime(630)).toBe('10:30');
    expect(minutesToTime(timeToMinutes('08:30') + 90)).toBe('10:00');
  });

  it('calculates day difference accurately from Bangkok date string', () => {
    const today = '2026-11-05';
    expect(getDayDiff('2026-11-05', today)).toBe(0);
    expect(getDayDiff('2026-11-06', today)).toBe(1);
    expect(getDayDiff('2026-11-07', today)).toBe(2);
    expect(getDayDiff('2026-11-08', today)).toBe(3);
    expect(getDayDiff('2026-11-12', today)).toBe(7);
    expect(getDayDiff('2026-11-04', today)).toBe(-1);
  });

  it('evaluates advance booking restriction based on minAdvanceDays condition', () => {
    const today = '2026-11-05';
    const minAdvanceDays = 3;

    // Day 5: 0 days -> restricted
    expect(getDayDiff('2026-11-05', today) < minAdvanceDays).toBe(true);
    // Day 6: 1 day -> restricted
    expect(getDayDiff('2026-11-06', today) < minAdvanceDays).toBe(true);
    // Day 7: 2 days -> restricted
    expect(getDayDiff('2026-11-07', today) < minAdvanceDays).toBe(true);
    // Day 8: 3 days -> allowed!
    expect(getDayDiff('2026-11-08', today) < minAdvanceDays).toBe(false);
    // Day 9: 4 days -> allowed!
    expect(getDayDiff('2026-11-09', today) < minAdvanceDays).toBe(false);
  });

  it('returns valid YYYY-MM-DD for Bangkok current date', () => {
    const bkk = getTodayBkk();
    expect(bkk).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
