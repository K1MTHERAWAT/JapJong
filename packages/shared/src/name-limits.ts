/**
 * =====================================================================
 * มาตรฐานการจำกัดความยาวการกรอกชื่อ (Centralized Name Input Length Config)
 * =====================================================================
 * กำหนดจำนวนตัวอักษรสูงสุด (Max Length) แยกตามประเภทของชื่อในระบบ
 * เพื่อใช้ร่วมกันทั้งฝั่ง Frontend (UI Input, Counter, Validation) และ Backend (DTO, Controller, Service)
 */

export const NAME_MAX_LENGTH = {
  /** ชื่อ-นามสกุลผู้ใช้งาน / ผู้ยื่นคำขอ / ผู้แจ้งซ่อม / ผู้ลงนาม */
  PERSON_NAME: 40,
  /** ชื่อเล่น / ชื่อเรียก */
  NICKNAME: 20,
  /** ชื่อบัญชีผู้ใช้งาน (@username) */
  USERNAME: 30,
  /** ชื่อตำแหน่งงาน / ตำแหน่งในแบบคำขอ */
  POSITION: 40,
  /** ชื่อหน่วยงาน / ชุมชน / สังกัด / กลุ่มองค์กร */
  ORGANIZATION: 60,
  /** ชื่อสถานที่ราชการ (เช่น ห้องประชุม, ศาลาประชาคม, สนามกีฬา) */
  VENUE_NAME: 50,
  /** ชื่ออุปกรณ์ / ครุภัณฑ์ (รองรับชื่ออุปกรณ์มาตรฐานที่มีรายละเอียดวงเล็บ) */
  EQUIPMENT_NAME: 60,
  /** ชื่ออาคาร / สถานที่ตั้ง */
  BUILDING_NAME: 40,
  /** ชื่อชั้น / โซนพื้นที่ (เช่น ชั้น 1, กลางแจ้ง) */
  FLOOR_NAME: 20,
  /** ชื่อจุดสังเกต / ห้อง / บริเวณที่แจ้งซ่อม */
  LOCATION_NAME: 60,
  /** ชื่อสิ่งอำนวยความสะดวกย่อย */
  FACILITY_NAME: 30,
  /** ชื่องาน / โครงการ / กิจกรรมที่ขอใช้สถานที่ */
  ACTIVITY_NAME: 80,
  /** ชื่อรายการสถานที่หรือครุภัณฑ์ในตารางความประสงค์ */
  PURPOSE_ITEM_NAME: 60,
  /** ชื่อสถานที่เขียนคำขอ (เขียนที่) */
  WRITTEN_AT: 50,
  /** ชื่อบริการ / เมนูใน Sidebar */
  SERVICE_NAME: 40,
  /** ชื่อหมวดหมู่ (หมวดหมู่บริการ, หมวดหมู่อุปกรณ์, หมวดหมู่งานซ่อม) */
  CATEGORY_NAME: 30,
  /** ชื่อบทบาทผู้ใช้งาน (Role Name) */
  ROLE_NAME: 40,
  /** ชื่อแม่แบบเอกสารราชการ / ชื่อแบบฟอร์ม / หัวเรื่องเอกสาร */
  TEMPLATE_NAME: 60,
  /** ชื่อช่องดึงข้อมูลในแม่แบบเอกสาร (Data Slot Label) */
  SLOT_LABEL: 30,
  /** ชื่อ LINE Rich Menu หรือชื่อแม่แบบ Flex Message */
  RICH_MENU_NAME: 50,
  /** ข้อความแถบเมนูแชท LINE (ตามข้อจำกัด LINE Messaging API สูงสุด 14 ตัวอักษร) */
  RICH_MENU_BAR_TEXT: 14,
  /** ชื่อป้ายกำกับปุ่มใน LINE Rich Menu / ปุ่ม Flex Message */
  RICH_MENU_ACTION_LABEL: 20,
} as const;

export type NameFieldKey = keyof typeof NAME_MAX_LENGTH;

export interface NameFieldMeta {
  key: NameFieldKey;
  maxLength: number;
  label: string;
  example: string;
}

export const NAME_FIELD_META: Record<NameFieldKey, NameFieldMeta> = {
  PERSON_NAME: {
    key: 'PERSON_NAME',
    maxLength: NAME_MAX_LENGTH.PERSON_NAME,
    label: 'ชื่อ-นามสกุล',
    example: 'สมชาย ใจดี',
  },
  NICKNAME: {
    key: 'NICKNAME',
    maxLength: NAME_MAX_LENGTH.NICKNAME,
    label: 'ชื่อเล่น / ชื่อเรียก',
    example: 'สมชาย',
  },
  USERNAME: {
    key: 'USERNAME',
    maxLength: NAME_MAX_LENGTH.USERNAME,
    label: 'ชื่อบัญชีผู้ใช้',
    example: 'somchai',
  },
  POSITION: {
    key: 'POSITION',
    maxLength: NAME_MAX_LENGTH.POSITION,
    label: 'ชื่อตำแหน่ง',
    example: 'ประชาชน / ประธานชุมชน',
  },
  ORGANIZATION: {
    key: 'ORGANIZATION',
    maxLength: NAME_MAX_LENGTH.ORGANIZATION,
    label: 'ชื่อหน่วยงาน / ชุมชน / สังกัด',
    example: 'กลุ่มแม่บ้านบ้านหนองบัว',
  },
  VENUE_NAME: {
    key: 'VENUE_NAME',
    maxLength: NAME_MAX_LENGTH.VENUE_NAME,
    label: 'ชื่อสถานที่ราชการ',
    example: 'ห้องประชุมใหญ่ อบต.',
  },
  EQUIPMENT_NAME: {
    key: 'EQUIPMENT_NAME',
    maxLength: NAME_MAX_LENGTH.EQUIPMENT_NAME,
    label: 'ชื่ออุปกรณ์ / ครุภัณฑ์',
    example: 'ชุดเครื่องเสียงเคลื่อนที่ (ไมค์ 2 ตัว + ลำโพง)',
  },
  BUILDING_NAME: {
    key: 'BUILDING_NAME',
    maxLength: NAME_MAX_LENGTH.BUILDING_NAME,
    label: 'ชื่ออาคาร',
    example: 'อาคารสำนักงาน',
  },
  FLOOR_NAME: {
    key: 'FLOOR_NAME',
    maxLength: NAME_MAX_LENGTH.FLOOR_NAME,
    label: 'ชื่อชั้น / โซน',
    example: 'ชั้น 1',
  },
  LOCATION_NAME: {
    key: 'LOCATION_NAME',
    maxLength: NAME_MAX_LENGTH.LOCATION_NAME,
    label: 'ชื่อห้อง / จุดเกิดเหตุ / อุปกรณ์ที่แจ้งซ่อม',
    example: 'ห้องประชุมใหญ่ · เครื่องปรับอากาศ',
  },
  FACILITY_NAME: {
    key: 'FACILITY_NAME',
    maxLength: NAME_MAX_LENGTH.FACILITY_NAME,
    label: 'ชื่อสิ่งอำนวยความสะดวก',
    example: 'เครื่องเสียง/ไมค์',
  },
  ACTIVITY_NAME: {
    key: 'ACTIVITY_NAME',
    maxLength: NAME_MAX_LENGTH.ACTIVITY_NAME,
    label: 'ชื่องาน / กิจกรรม',
    example: 'ประชุมสมาชิกและอบรมอาชีพเสริม',
  },
  PURPOSE_ITEM_NAME: {
    key: 'PURPOSE_ITEM_NAME',
    maxLength: NAME_MAX_LENGTH.PURPOSE_ITEM_NAME,
    label: 'ชื่อรายการสถานที่/อุปกรณ์ในคำขอ',
    example: 'ห้องประชุมใหญ่ อบต.',
  },
  WRITTEN_AT: {
    key: 'WRITTEN_AT',
    maxLength: NAME_MAX_LENGTH.WRITTEN_AT,
    label: 'ชื่อสถานที่เขียนคำขอ (เขียนที่)',
    example: 'ที่ทำการองค์การบริหารส่วนตำบล',
  },
  SERVICE_NAME: {
    key: 'SERVICE_NAME',
    maxLength: NAME_MAX_LENGTH.SERVICE_NAME,
    label: 'ชื่อบริการ / เมนู',
    example: 'ขอใช้สถานที่ราชการ',
  },
  CATEGORY_NAME: {
    key: 'CATEGORY_NAME',
    maxLength: NAME_MAX_LENGTH.CATEGORY_NAME,
    label: 'ชื่อหมวดหมู่',
    example: 'บริการหลัก',
  },
  ROLE_NAME: {
    key: 'ROLE_NAME',
    maxLength: NAME_MAX_LENGTH.ROLE_NAME,
    label: 'ชื่อบทบาทผู้ใช้งาน',
    example: 'เจ้าหน้าที่ผู้รับผิดชอบ',
  },
  TEMPLATE_NAME: {
    key: 'TEMPLATE_NAME',
    maxLength: NAME_MAX_LENGTH.TEMPLATE_NAME,
    label: 'ชื่อแม่แบบเอกสาร / แบบฟอร์ม',
    example: 'แบบขอใช้สถานที่ราชการ (ทั่วไป)',
  },
  SLOT_LABEL: {
    key: 'SLOT_LABEL',
    maxLength: NAME_MAX_LENGTH.SLOT_LABEL,
    label: 'ชื่อช่องดึงข้อมูล',
    example: 'ชื่อ-นามสกุลผู้ขอ',
  },
  RICH_MENU_NAME: {
    key: 'RICH_MENU_NAME',
    maxLength: NAME_MAX_LENGTH.RICH_MENU_NAME,
    label: 'ชื่อ Rich Menu / แม่แบบแจ้งเตือน',
    example: 'เมนูหลักสำหรับประชาชน (Citizen)',
  },
  RICH_MENU_BAR_TEXT: {
    key: 'RICH_MENU_BAR_TEXT',
    maxLength: NAME_MAX_LENGTH.RICH_MENU_BAR_TEXT,
    label: 'ข้อความแถบเมนูแชท LINE',
    example: 'เมนูบริการ อบต.',
  },
  RICH_MENU_ACTION_LABEL: {
    key: 'RICH_MENU_ACTION_LABEL',
    maxLength: NAME_MAX_LENGTH.RICH_MENU_ACTION_LABEL,
    label: 'ชื่อปุ่มเมนู / ป้ายกำกับปุ่ม',
    example: 'ดูรายละเอียดในระบบ',
  },
};

/**
 * รูปแบบอักขระที่อนุญาตสำหรับข้อมูลประเภทชื่อ:
 * รองรับภาษาไทย (ก-๙), ภาษาอังกฤษ (A-Z, a-z), ตัวเลข (0-9, ๐-๙), ช่องว่าง,
 * และอักขระพิเศษที่จำเป็นในชื่อราชการ เช่น . , - – — _ / ( ) [ ] · • & + @ # ' " :
 * โดยไม่อนุญาตอักขระควบคุม (Control Characters)
 */
export const NAME_SAFE_CHAR_REGEX = /^[^\u0000-\u001F\u007F]*$/;

/**
 * ตัดความยาวข้อความไม่ให้เกินขีดจำกัดสูงสุดที่กำหนด (และตัด Control Characters ที่ไม่พึงประสงค์ออก)
 */
export function clampNameInput(value: string | undefined | null, maxLength: number): string {
  if (!value) return '';
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F]/g, '');
  if (maxLength <= 0) return cleaned;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * คืนค่าข้อความตัวนับจำนวนตัวอักษร เช่น "25/100"
 */
export function formatNameCounter(value: string | undefined | null, maxLength: number): string {
  const len = value ? String(value).length : 0;
  return `${Math.min(len, maxLength)}/${maxLength}`;
}

/**
 * ตรวจสอบว่าความยาวข้อความถึงขีดจำกัดสูงสุดแล้วหรือไม่
 */
export function isNameAtLimit(value: string | undefined | null, maxLength: number): boolean {
  const len = value ? String(value).length : 0;
  return maxLength > 0 && len >= maxLength;
}

/**
 * คืนค่าข้อความแจ้งเตือนเมื่อกรอกชื่อถึงขีดจำกัดสูงสุด
 */
export function getNameLimitWarning(
  value: string | undefined | null,
  maxLength: number,
  fieldLabel?: string,
): string | null {
  if (!isNameAtLimit(value, maxLength)) return null;
  const prefix = fieldLabel ? `${fieldLabel}: ` : '';
  return `${prefix}ถึงขีดจำกัดความยาวสูงสุดแล้ว (${maxLength}/${maxLength} ตัวอักษร)`;
}
