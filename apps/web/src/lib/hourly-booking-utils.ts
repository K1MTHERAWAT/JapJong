/**
 * Helper utilities for Hourly Booking & Advance Booking calculations
 */

/** คำนวณวันที่ปัจจุบันตามโซนเวลา Asia/Bangkok (YYYY-MM-DD) */
export function getTodayBkk(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** คำนวณความต่างของวัน (dateStr - todayStr) */
export function getDayDiff(dateStr: string, todayStr: string): number {
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [cy, cm, cd] = dateStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const curUtc = Date.UTC(cy, cm - 1, cd);
  return Math.floor((curUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

/** แปลงนาทีเป็นข้อความภาษาไทย เช่น 90 นาที -> "1 ชั่วโมง 30 นาที" */
export function formatDurationThai(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 นาที';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours > 0 && minutes > 0) return `${hours} ชั่วโมง ${minutes} นาที`;
  if (hours > 0) return `${hours} ชั่วโมง`;
  return `${minutes} นาที`;
}

/** แปลง HH:mm เป็นนาที */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** แปลงนาทีเป็น HH:mm */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}
