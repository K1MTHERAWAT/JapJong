/**
 * =====================================================================
 * ตัวช่วยสั่งพิมพ์เอกสารและส่งออก PDF มาตรฐานกลาง (Central Print Helper)
 * =====================================================================
 */

export type PrintOrientation = 'portrait' | 'landscape';

/** จำนวนรายการสูงสุดในหัวข้อ "มีความประสงค์... ดังนี้" ต่อ 1 หน้ากระดาษ A4 (1-3 ข้อต่อหน้า) */
export const ITEMS_PER_GOV_FORM_PAGE = 3;

/**
 * แบ่งรายการออกเป็นหน้าย่อย หน้าละไม่เกิน perPage รายการ (ค่าเริ่มต้น 3 ข้อต่อหน้า)
 * เพื่อให้หน้าถัดไปเริ่มนับข้อ 1 ใหม่โดยอัตโนมัติตามมาตรฐานแบบฟอร์มราชการ
 */
export function chunkDocumentItems<T>(items: T[], perPage = ITEMS_PER_GOV_FORM_PAGE): T[][] {
  if (!items || items.length === 0) return [[]];
  const size = Math.max(1, perPage);
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

export interface TriggerPrintOptions {
  /** ชื่อเอกสารสำหรับบันทึก PDF (เว้นว่างเพื่อไม่ให้เบราว์เซอร์พิมพ์ title ลงหัวกระดาษ) */
  title?: string;
  /** แนวกระดาษมาตรฐาน A4: แนวตั้ง (portrait) หรือแนวนอน (landscape) */
  orientation?: PrintOrientation;
}

/**
 * สั่งพิมพ์เอกสารผ่านหน้าต่าง Print / Save as PDF ของเบราว์เซอร์อย่างเป็นมาตรฐาน:
 * 1. จัดการ document.title ชั่วคราวเพื่อป้องกันหัวกระดาษ/URL ส่วนเกิน
 * 2. กำหนดทิศทางหน้ากระดาษ (portrait / landscape) บน <html> ชั่วคราว
 * 3. คืนค่าสถานะเดิมหลังพิมพ์เสร็จผ่าน event afterprint และ fallback timeout
 */
export function triggerDocumentPrint(options: TriggerPrintOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const { title = '', orientation = 'portrait' } = options;
  const root = document.documentElement;
  const originalTitle = document.title;
  const prevOrientation = root.getAttribute('data-print-orientation');

  document.title = title;
  if (orientation === 'landscape') {
    root.setAttribute('data-print-orientation', 'landscape');
  } else {
    root.removeAttribute('data-print-orientation');
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = originalTitle;
    if (prevOrientation) {
      root.setAttribute('data-print-orientation', prevOrientation);
    } else {
      root.removeAttribute('data-print-orientation');
    }
    window.removeEventListener('afterprint', restore);
  };

  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 1500);
}
