import { NotificationCategory, NotificationReferenceType } from '@japjong/shared';

/**
 * รูปแบบข้อความตัวอักษรธรรมดาของ LINE Messaging API
 */
export interface LineTextMessage {
  type: 'text';
  text: string;
}

/**
 * รูปแบบข้อความ Flex Message แบบการ์ดสวยงามของ LINE Messaging API
 */
export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
}

/**
 * รวมชนิดของข้อความ LINE ที่ระบบรองรับ (ข้อความธรรมดา หรือ Flex Message)
 */
export type LineMessageObject = LineTextMessage | LineFlexMessage;

/**
 * ข้อมูลผลลัพธ์การส่งข้อความ Push Message ผ่าน LINE API
 */
export interface LinePushResult {
  ok: boolean;                     // สถานะความสำเร็จ
  providerMessageId?: string;       // รหัสข้อความจากเซิร์ฟเวอร์ LINE
  statusCode?: number;             // รหัส HTTP Status Code
  errorCode?: string;              // รหัสข้อผิดพลาด
  errorMessage?: string;           // คำอธิบายข้อผิดพลาด
  retryable: boolean;              // สามารถลองส่งใหม่ได้หรือไม่ (เช่น กรณี Timeout/Network)
  mock?: boolean;                  // เป็นการจำลองส่งในโหมดเดโมหรือไม่
}

/**
 * ผลลัพธ์การเรียก LINE API ทั่วไป พร้อม Generic Data Payload
 */
export interface LineApiResult<T = unknown> extends LinePushResult {
  data?: T;
}

/**
 * พื้นที่คลิกบนแถบเมนูด้านล่าง (Rich Menu Area)
 */
export interface LineRichMenuArea {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  action: {
    type: 'uri' | 'message' | 'postback';
    label?: string;
    uri?: string;
    text?: string;
    data?: string;
    displayText?: string;
  };
}

/**
 * โครงสร้างข้อมูล Rich Menu ของ LINE
 */
export interface LineRichMenuObject {
  size: {
    width: number;
    height: number;
  };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: LineRichMenuArea[];
}

/**
 * คีย์เหตุการณ์การแจ้งเตือนทั้งหมดในระบบราชการจับจอง
 */
export type NotificationEventKey =
  // ขอใช้สถานที่ — ประชาชนผู้ขอ
  | 'BOOKING_SUBMITTED'
  | 'BOOKING_IN_REVIEW'
  | 'BOOKING_NEED_MORE_INFO'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_REMINDER'
  // ขอใช้สถานที่ — เจ้าหน้าที่ & ผู้มีอำนาจลงนาม
  | 'STAFF_NEW_BOOKING'
  | 'STAFF_BOOKING_RESCHEDULED'
  // ขอยืมอุปกรณ์ — ประชาชนผู้ขอ
  | 'BORROW_SUBMITTED'
  | 'BORROW_IN_REVIEW'
  | 'BORROW_APPROVED'
  | 'BORROW_REJECTED'
  | 'BORROW_PICKUP_REMINDER'
  | 'BORROW_RETURN_REMINDER'
  | 'BORROW_OVERDUE'
  | 'BORROW_RETURNED'
  // ขอยืมอุปกรณ์ — เจ้าหน้าที่
  | 'STAFF_NEW_BORROW'
  | 'STAFF_BORROW_RETURN_REQUESTED'
  | 'STAFF_BORROW_OVERDUE'
  // แจ้งซ่อมบำรุง — ประชาชนผู้แจ้ง
  | 'REPAIR_SUBMITTED'
  | 'REPAIR_ACCEPTED'
  | 'REPAIR_IN_PROGRESS'
  | 'REPAIR_NEED_MORE_INFO'
  | 'REPAIR_APPROVED'
  | 'REPAIR_REJECTED'
  | 'REPAIR_FINISHED'
  | 'REPAIR_DONE'
  // แจ้งซ่อมบำรุง — เจ้าหน้าที่งานซ่อม
  | 'STAFF_NEW_REPAIR'
  | 'STAFF_REPAIR_REOPENED'
  | 'STAFF_REPAIR_CONFIRMED'
  // ลงนามเอกสารอิเล็กทรอนิกส์ — ทุกฝ่าย
  | 'SIGNING_PENDING'
  | 'SIGNING_COMPLETED'
  | 'SIGNING_FULLY_APPROVED'
  | 'STAFF_SIGNING_REQUIRED'
  | 'STAFF_SIGNING_RETURNED'
  // ข้อความทดสอบระบบ
  | 'TEST_NOTIFICATION';

/**
 * ข้อมูล Input สำหรับประกอบร่างเทมเพลตการแจ้งเตือน
 */
export interface NotificationTemplateInput {
  event: NotificationEventKey;
  recipientRole: 'CITIZEN' | 'STAFF';
  requestCode?: string;
  requestId?: string;
  requesterName?: string;
  venueName?: string;
  equipmentSummary?: string;
  location?: string;
  dateText?: string;
  statusLabel?: string;
  reason?: string;
  linkPath?: string;
  useFlex?: boolean;
}

/**
 * ข้อมูลการแจ้งเตือนที่สร้างเสร็จสมบูรณ์พร้อมส่งต่อ
 */
export interface BuiltNotificationContent {
  category: NotificationCategory;
  referenceType: NotificationReferenceType;
  referenceId: string | null;
  inAppTitle: string;
  inAppMessage: string;
  link: string;
  lineMessages: LineMessageObject[];
}
