import { Injectable } from '@nestjs/common';
import { NotificationCategory, NotificationReferenceType } from '@japjong/shared';
import {
  BuiltNotificationContent,
  LineFlexMessage,
  LineMessageObject,
  LineTextMessage,
  NotificationTemplateInput,
} from './line-messaging.types';

export interface TemplateOverride {
  status?: 'ACTIVE' | 'DISABLED';
  templateType?: 'FLEX' | 'TEXT';
  headline?: string;
  footerNote?: string;
  headerColor?: string;
  buttonLabel?: string;
}

const MAX_LINE_TEXT_LENGTH = 5000;
const MAX_FLEX_ALT_TEXT_LENGTH = 400;

@Injectable()
export class LineMessageTemplateService {
  private overrideResolver?: (event: string) => TemplateOverride | null;

  setOverrideResolver(resolver?: (event: string) => TemplateOverride | null) {
    this.overrideResolver = resolver;
  }

  private get frontendUrl(): string {
    const raw = (process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'http://localhost:3000';
      }
      return parsed.origin;
    } catch {
      return 'http://localhost:3000';
    }
  }

  /**
   * ตรวจสอบและสร้าง URL ที่ปลอดภัยสำหรับแนบในข้อความแจ้งเตือน
   * หากมีการกำหนด LIFF ID ในระบบ จะสร้างเป็น LIFF URL เพื่อเปิดผ่าน LINE In-App Browser ทันที
   */
  buildSafeUrl(linkPath?: string): string {
    const liffId = (process.env.NEXT_PUBLIC_LIFF_ID || process.env.LINE_LIFF_ID || '').trim();
    if (!linkPath) {
      if (liffId) return `https://liff.line.me/${liffId}`;
      return this.frontendUrl;
    }
    const cleanPath = linkPath.startsWith('/') ? linkPath : `/${linkPath}`;
    if (liffId) {
      return `https://liff.line.me/${liffId}?target=${encodeURIComponent(cleanPath)}`;
    }
    return `${this.frontendUrl}${cleanPath}`;
  }

  /**
   * สร้างเนื้อหาแจ้งเตือนทั้ง In-App และ LINE (Text / Flex Message)
   */
  buildNotification(input: NotificationTemplateInput): BuiltNotificationContent {
    const code = input.requestCode || '-';
    const refId = input.requestId || input.requestCode || null;
    const venue = input.venueName || 'สถานที่ราชการ';
    const equip = input.equipmentSummary || 'อุปกรณ์ราชการ';
    const loc = input.location || 'พื้นที่ภายในหน่วยงาน';
    const dateText = input.dateText || '-';
    const requester = input.requesterName || 'ผู้ยื่นคำขอ';
    const reason = input.reason || 'ไม่ผ่านเกณฑ์การพิจารณา';

    let category: NotificationCategory = 'SYSTEM';
    let referenceType: NotificationReferenceType = 'system';
    let inAppTitle = 'จับจอง แจ้งเตือน';
    let inAppMessage = '';
    let defaultLink = '/';
    let headerLabel = 'จับจอง';
    let headline = '';
    let details: { label: string; value: string }[] = [];
    let footerNote = 'สามารถเข้าสู่ระบบจับจอง เพื่อตรวจสอบรายละเอียดเพิ่มเติม';

    switch (input.event) {
      // ===================== 5.1 ระบบจองสถานที่ราชการ =====================
      case 'BOOKING_SUBMITTED':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        inAppTitle = `ส่งคำขอจองสถานที่ ${code} สำเร็จ`;
        inAppMessage = `สถานที่: ${venue} · อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบ`;
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'ส่งคำขอจองสถานที่สำเร็จ';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานที่', value: venue },
          { label: 'วันที่ใช้งาน', value: dateText },
          { label: 'สถานะ', value: 'รอเจ้าหน้าที่ตรวจสอบ' },
        ];
        break;

      case 'BOOKING_IN_REVIEW':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        inAppTitle = `คำขอจองสถานที่ ${code} อยู่ระหว่างตรวจสอบ`;
        inAppMessage = input.statusLabel || `เจ้าหน้าที่รับเรื่องและส่งต่อตามลำดับอนุมัติแล้ว`;
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'คำขอจองสถานที่อยู่ระหว่างการพิจารณา';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานที่', value: venue },
          { label: 'สถานะ', value: input.statusLabel || 'อยู่ระหว่างตรวจสอบ' },
        ];
        break;

      case 'BOOKING_NEED_MORE_INFO':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        inAppTitle = `คำขอจองสถานที่ ${code} ขอข้อมูล/เอกสารเพิ่มเติม`;
        inAppMessage = reason;
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'ขอเอกสารหรือข้อมูลเพิ่มเติมสำหรับคำขอจองสถานที่';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานที่', value: venue },
          { label: 'หมายเหตุ', value: reason },
        ];
        break;

      case 'BOOKING_APPROVED':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        inAppTitle = `คำขอ ${code} อนุมัติแล้ว`;
        inAppMessage = 'ดาวน์โหลดเอกสารใบอนุญาต (PDF) ได้แล้ว';
        defaultLink = refId ? `/approver/permit/${refId}` : '/history';
        headline = 'คำขอจองสถานที่ของคุณได้รับการอนุมัติแล้ว';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานที่', value: venue },
          { label: 'วันที่ใช้งาน', value: dateText },
          { label: 'สถานะ', value: 'อนุมัติแล้ว (เอกสารพร้อมดาวน์โหลด)' },
        ];
        break;

      case 'BOOKING_REJECTED':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        inAppTitle = `คำขอ ${code} ไม่ผ่าน`;
        inAppMessage = reason;
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'คำขอจองสถานที่ไม่ได้รับการอนุมัติ';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานที่', value: venue },
          { label: 'สถานะ', value: 'ไม่ผ่านการพิจารณา' },
          { label: 'เหตุผล', value: reason },
        ];
        break;

      case 'BOOKING_REMINDER':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        inAppTitle = `แจ้งเตือนก่อนถึงวันใช้งานสถานที่ (${code})`;
        inAppMessage = `สถานที่: ${venue} · วันที่ใช้งาน: ${dateText}`;
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'แจ้งเตือนกำหนดการเข้าใช้สถานที่ราชการ';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานที่', value: venue },
          { label: 'วันที่ใช้งาน', value: dateText },
        ];
        break;

      case 'STAFF_NEW_BOOKING':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = 'มีคำขอจองสถานที่ใหม่';
        inAppMessage = `${code} · ${requester}`;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'มีคำขอจองสถานที่ใหม่';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'ผู้ยื่นคำขอ', value: requester },
          { label: 'วันที่ยื่นคำขอ', value: dateText },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบคำขอ';
        break;

      case 'STAFF_BOOKING_RESCHEDULED':
        category = 'BOOKING_STATUS';
        referenceType = 'booking';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = `คำขอจอง ${code} ขอเลื่อนวันใช้งาน`;
        inAppMessage = `${code} · ${requester} ส่งคำขอพิจารณาใหม่`;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'มีคำขอจองสถานที่ถูกส่งกลับมาตรวจสอบใหม่ (ขอเลื่อนวัน)';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'ผู้ยื่นคำขอ', value: requester },
          { label: 'สถานะ', value: 'รอตรวจสอบใหม่' },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบคำขอ';
        break;

      // ===================== 5.2 ระบบยืม-คืนอุปกรณ์ =====================
      case 'BORROW_SUBMITTED':
        category = 'BORROW_STATUS';
        referenceType = 'borrow';
        inAppTitle = `ส่งคำขอยืมอุปกรณ์ ${code} สำเร็จ`;
        inAppMessage = `${equip} · อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบ`;
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'ส่งคำขอยืมอุปกรณ์สำเร็จ';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'รายการ', value: equip },
          { label: 'วันที่รับ-คืน', value: dateText },
          { label: 'สถานะ', value: 'รอเจ้าหน้าที่ตรวจสอบ' },
        ];
        break;

      case 'BORROW_IN_REVIEW':
        category = 'BORROW_STATUS';
        referenceType = 'borrow';
        inAppTitle = `คำขอยืมอุปกรณ์ ${code} อยู่ระหว่างตรวจสอบ`;
        inAppMessage = input.statusLabel || 'อยู่ระหว่างการพิจารณาตามลำดับอนุมัติ';
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'คำขอยืมอุปกรณ์อยู่ระหว่างตรวจสอบ';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'รายการ', value: equip },
          { label: 'สถานะ', value: input.statusLabel || 'อยู่ระหว่างตรวจสอบ' },
        ];
        break;

      case 'BORROW_APPROVED':
        category = 'BORROW_STATUS';
        referenceType = 'borrow';
        inAppTitle = `คำขอ ${code} อนุมัติแล้ว`;
        inAppMessage = 'ดาวน์โหลดเอกสารใบอนุญาต (PDF) ได้แล้ว';
        defaultLink = refId ? `/approver/permit/${refId}` : '/borrow/my';
        headline = 'คำขอยืมอุปกรณ์ของคุณได้รับการอนุมัติแล้ว';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'รายการ', value: equip },
          { label: 'กำหนดรับ-คืน', value: dateText },
          { label: 'สถานะ', value: 'อนุมัติแล้ว (เอกสารพร้อมดาวน์โหลด)' },
        ];
        break;

      case 'BORROW_REJECTED':
        category = 'BORROW_STATUS';
        referenceType = 'borrow';
        inAppTitle = `คำขอ ${code} ไม่ผ่าน`;
        inAppMessage = reason;
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'คำขอยืมอุปกรณ์ไม่ได้รับการอนุมัติ';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานะ', value: 'ไม่ผ่านการพิจารณา' },
          { label: 'เหตุผล', value: reason },
        ];
        break;

      case 'BORROW_PICKUP_REMINDER':
        category = 'BORROW_RETURN';
        referenceType = 'borrow';
        inAppTitle = `แจ้งเตือนก่อนถึงวันรับอุปกรณ์ (${code})`;
        inAppMessage = `กำหนดรับอุปกรณ์วันที่ ${dateText}`;
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'แจ้งเตือนก่อนถึงวันรับอุปกรณ์';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'รายการ', value: equip },
          { label: 'กำหนดรับอุปกรณ์', value: dateText },
        ];
        break;

      case 'BORROW_RETURN_REMINDER':
        category = 'BORROW_RETURN';
        referenceType = 'borrow';
        inAppTitle = `แจ้งเตือนกำหนดคืนอุปกรณ์ (${code})`;
        inAppMessage = `กรุณาส่งคืนอุปกรณ์ภายในวันที่ ${dateText}`;
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'แจ้งเตือนกำหนดส่งคืนอุปกรณ์';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'รายการ', value: equip },
          { label: 'กำหนดคืน', value: dateText },
        ];
        break;

      case 'BORROW_OVERDUE':
        category = 'BORROW_RETURN';
        referenceType = 'borrow';
        inAppTitle = `เลยกำหนดคืนอุปกรณ์ (${code})`;
        inAppMessage = `ครบกำหนดคืนเมื่อ ${dateText} กรุณาติดต่อส่งคืนอุปกรณ์`;
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'แจ้งเตือนรายการยืมอุปกรณ์เลยกำหนดส่งคืน';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'รายการ', value: equip },
          { label: 'กำหนดคืน', value: dateText },
          { label: 'สถานะ', value: 'เลยกำหนดคืน' },
        ];
        break;

      case 'BORROW_RETURNED':
        category = 'BORROW_RETURN';
        referenceType = 'borrow';
        inAppTitle = `รับคืนอุปกรณ์ ${code} เรียบร้อยแล้ว`;
        inAppMessage = 'เจ้าหน้าที่ตรวจรับคืนอุปกรณ์ครบถ้วนแล้ว';
        defaultLink = refId ? `/requests/${refId}` : '/borrow/my';
        headline = 'ส่งคืนอุปกรณ์เรียบร้อยแล้ว';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'สถานะ', value: 'คืนอุปกรณ์แล้ว' },
        ];
        break;

      case 'STAFF_NEW_BORROW':
        category = 'BORROW_STATUS';
        referenceType = 'borrow';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = 'มีคำขอยืมครุภัณฑ์ใหม่';
        inAppMessage = `${code} · ${requester}`;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'มีคำขอยืมอุปกรณ์ใหม่';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'ผู้ยื่นคำขอ', value: requester },
          { label: 'วันที่ยื่นคำขอ', value: dateText },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบคำขอ';
        break;

      case 'STAFF_BORROW_RETURN_REQUESTED':
        category = 'BORROW_RETURN';
        referenceType = 'borrow';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = `แจ้งคืนอุปกรณ์ ${code}`;
        inAppMessage = requester;
        defaultLink = refId ? `/staff/handover?id=${refId}` : '/staff/handover';
        headline = 'มีรายการรอรับคืนและตรวจสภาพอุปกรณ์';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'ผู้ขอยืม', value: requester },
          { label: 'สถานะ', value: 'รอตรวจสภาพรับคืน' },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจรับคืนอุปกรณ์';
        break;

      case 'STAFF_BORROW_OVERDUE':
        category = 'BORROW_RETURN';
        referenceType = 'borrow';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = `รายการยืม ${code} เลยกำหนดส่งคืน`;
        inAppMessage = `${requester} · กำหนดคืน ${dateText}`;
        defaultLink = refId ? `/staff/handover?id=${refId}` : '/staff/handover';
        headline = 'มีรายการยืมอุปกรณ์เลยกำหนดคืน';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'ผู้ขอยืม', value: requester },
          { label: 'กำหนดคืน', value: dateText },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อติดตามการคืนอุปกรณ์';
        break;

      // ===================== 5.3 ระบบแจ้งปัญหาและซ่อมบำรุง =====================
      case 'REPAIR_SUBMITTED':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `ส่งแจ้งซ่อม ${code} สำเร็จ`;
        inAppMessage = `สถานที่: ${loc} · รอเจ้าหน้าที่รับเรื่อง`;
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'รับแจ้งปัญหาและซ่อมบำรุงสำเร็จ';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'บริเวณที่แจ้ง', value: loc },
          { label: 'สถานะ', value: 'รอเจ้าหน้าที่รับเรื่อง' },
        ];
        break;

      case 'REPAIR_ACCEPTED':
      case 'REPAIR_IN_PROGRESS':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `งานซ่อม ${code} กำลังดำเนินการ`;
        inAppMessage = `เจ้าหน้าที่รับเรื่องและเริ่มดำเนินการซ่อมบำรุงที่ ${loc}`;
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'เจ้าหน้าที่รับเรื่องและเริ่มดำเนินการซ่อมบำรุงแล้ว';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'บริเวณที่แจ้ง', value: loc },
          { label: 'สถานะ', value: 'กำลังดำเนินการซ่อมบำรุง' },
        ];
        break;

      case 'REPAIR_NEED_MORE_INFO':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `งานซ่อม ${code} ขอข้อมูลเพิ่มเติม`;
        inAppMessage = reason;
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'ขอข้อมูลเพิ่มเติมสำหรับรายการแจ้งซ่อม';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'บริเวณที่แจ้ง', value: loc },
          { label: 'รายละเอียด', value: reason },
        ];
        break;

      case 'REPAIR_APPROVED':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `คำขอแจ้งซ่อม ${code} ได้รับการอนุมัติ`;
        inAppMessage = `สถานที่: ${loc}`;
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'คำขอแจ้งซ่อมได้รับการอนุมัติแล้ว';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'บริเวณที่แจ้ง', value: loc },
          { label: 'สถานะ', value: 'อนุมัติให้ดำเนินการ' },
        ];
        break;

      case 'REPAIR_REJECTED':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `คำขอแจ้งซ่อม ${code} ไม่ผ่านการอนุมัติ`;
        inAppMessage = reason;
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'คำขอแจ้งซ่อมถูกปฏิเสธ';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'เหตุผล', value: reason },
        ];
        break;

      case 'REPAIR_FINISHED':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `${loc} ซ่อมเสร็จแล้ว`;
        inAppMessage = 'รอคุณตรวจรับงาน';
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'ดำเนินการซ่อมบำรุงเสร็จสิ้นแล้ว';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'บริเวณที่แจ้ง', value: loc },
          { label: 'ผลการซ่อม', value: input.statusLabel || 'ดำเนินการซ่อมเรียบร้อย' },
          { label: 'สถานะ', value: 'รอผู้แจ้งตรวจรับงาน' },
        ];
        break;

      case 'REPAIR_DONE':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        inAppTitle = `ปิดงานซ่อม ${code} เรียบร้อยแล้ว`;
        inAppMessage = `สถานที่: ${loc} · ตรวจรับงานเสร็จสมบูรณ์`;
        defaultLink = refId ? `/repair?mode=track&id=${refId}` : '/repair';
        headline = 'ตรวจรับและปิดงานซ่อมบำรุงเรียบร้อยแล้ว';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'บริเวณที่แจ้ง', value: loc },
          { label: 'สถานะ', value: 'เสร็จสิ้นสมบูรณ์' },
        ];
        break;

      case 'STAFF_NEW_REPAIR':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = 'แจ้งซ่อมใหม่';
        inAppMessage = `${code} · ${loc}`;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'มีรายการแจ้งปัญหาและซ่อมบำรุงใหม่';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'สถานที่', value: loc },
          { label: 'ผู้แจ้ง', value: requester },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบและรับเรื่อง';
        break;

      case 'STAFF_REPAIR_REOPENED':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = `งานซ่อม ${code} ขอให้ตรวจสอบซ้ำ`;
        inAppMessage = `${loc} · ผู้แจ้งขอให้แก้ไขเพิ่มเติม`;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'มีรายการซ่อมบำรุงถูกส่งกลับมาดำเนินการต่อ';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'สถานที่', value: loc },
          { label: 'สถานะ', value: 'รอดำเนินการแก้ไข' },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายละเอียด';
        break;

      case 'STAFF_REPAIR_CONFIRMED':
        category = 'REPAIR_STATUS';
        referenceType = 'repair';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = `ผู้แจ้งตรวจรับงานซ่อม ${code} แล้ว`;
        inAppMessage = `${loc} · ปิดงานซ่อมเรียบร้อย`;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'ผู้แจ้งตรวจรับและปิดงานซ่อมบำรุงแล้ว';
        details = [
          { label: 'เลขที่รายการ', value: code },
          { label: 'สถานที่', value: loc },
          { label: 'สถานะ', value: 'ปิดงานเรียบร้อย' },
        ];
        footerNote = 'สามารถเข้าสู่ระบบเพื่อดูประวัติงานซ่อม';
        break;

      // ===================== 5.4 การลงนามเอกสาร =====================
      case 'SIGNING_PENDING':
        category = 'DOCUMENT_SIGNING';
        referenceType = 'signing';
        inAppTitle = `เอกสารคำขอ ${code} รอการลงนาม`;
        inAppMessage = input.statusLabel || 'มีเอกสารรอการลงนามตามลำดับขั้นตอน';
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'มีเอกสารรอการลงนาม';
        details = [
          { label: 'เลขที่เอกสาร', value: code },
          { label: 'สถานะ', value: input.statusLabel || 'รอการลงนาม' },
        ];
        break;

      case 'SIGNING_COMPLETED':
        category = 'DOCUMENT_SIGNING';
        referenceType = 'signing';
        inAppTitle = `ลงนามเอกสาร ${code} สำเร็จ`;
        inAppMessage = input.statusLabel || 'บันทึกข้อมูลลายมือชื่ออิเล็กทรอนิกส์เรียบร้อยแล้ว';
        defaultLink = refId ? `/requests/${refId}` : '/history';
        headline = 'ลงนามเอกสารสำเร็จ';
        details = [
          { label: 'เลขที่เอกสาร', value: code },
          { label: 'สถานะ', value: input.statusLabel || 'ลงนามแล้ว' },
        ];
        break;

      case 'SIGNING_FULLY_APPROVED':
        category = 'DOCUMENT_SIGNING';
        referenceType = 'signing';
        inAppTitle = `เอกสาร ${code} ได้รับการอนุมัติครบถ้วน`;
        inAppMessage = 'ลงนามครบทุกระดับแล้ว พร้อมดาวน์โหลดใบอนุญาต (PDF)';
        defaultLink = refId ? `/approver/permit/${refId}` : '/history';
        headline = 'เอกสารได้รับการอนุมัติครบถ้วนแล้ว';
        details = [
          { label: 'เลขที่เอกสาร', value: code },
          { label: 'สถานะ', value: 'อนุมัติครบถ้วน (พร้อมดาวน์โหลด PDF)' },
        ];
        break;

      case 'STAFF_SIGNING_REQUIRED':
        category = 'DOCUMENT_SIGNING';
        referenceType = 'signing';
        headerLabel = 'จับจอง ผู้มีอำนาจลงนาม';
        inAppTitle = input.statusLabel ? `${input.statusLabel} ${code}` : `รอลงนามเอกสาร ${code}`;
        inAppMessage = requester;
        defaultLink = refId ? `/approver/sign/${refId}` : '/approver';
        headline = 'มีเอกสารรอการพิจารณาและลงนาม';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'ผู้ยื่นคำขอ', value: requester },
          { label: 'สถานะ', value: input.statusLabel || 'รอลงนามอนุมัติ' },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบและลงนามเอกสาร';
        break;

      case 'STAFF_SIGNING_RETURNED':
        category = 'DOCUMENT_SIGNING';
        referenceType = 'signing';
        headerLabel = 'จับจอง เจ้าหน้าที่';
        inAppTitle = `เอกสาร ${code} ถูกส่งกลับมาแก้ไข`;
        inAppMessage = reason;
        defaultLink = refId ? `/staff/review?id=${refId}` : '/staff/review';
        headline = 'มีเอกสารถูกส่งกลับมาแก้ไข';
        details = [
          { label: 'เลขที่คำขอ', value: code },
          { label: 'หมายเหตุ', value: reason },
        ];
        footerNote = 'กรุณาเข้าสู่ระบบเพื่อดำเนินการแก้ไข';
        break;

      case 'TEST_NOTIFICATION':
      default:
        category = 'SYSTEM';
        referenceType = 'system';
        inAppTitle = 'ทดสอบระบบแจ้งเตือน จับจอง';
        inAppMessage = 'ระบบเชื่อมต่อการแจ้งเตือนผ่านเว็บไซต์และ LINE Official Account พร้อมใช้งาน';
        defaultLink = '/account';
        headline = 'ทดสอบการแจ้งเตือนสำเร็จ';
        details = [
          { label: 'บริการ', value: 'ระบบแจ้งเตือนอัตโนมัติ จับจอง' },
          { label: 'สถานะ', value: 'เชื่อมต่อพร้อมใช้งาน' },
        ];
        break;
    }

    const override = this.overrideResolver ? this.overrideResolver(input.event) : null;
    if (override) {
      if (override.headline) headline = override.headline;
      if (override.footerNote) footerNote = override.footerNote;
    }
    // เปิดใช้ Flex Message เป็นค่าเริ่มต้นเสมอ เว้นแต่จะถูก Override เป็น TEXT หรือ DISABLED
    const useFlex = input.useFlex !== false && !(override && (override.status === 'DISABLED' || override.templateType === 'TEXT'));

    const finalLink = input.linkPath || defaultLink;
    const detailLines = details.map((d) => `${d.label}: ${d.value}`).join('\n');
    const rawText = `${headerLabel}\n\n${headline}\n\n${detailLines}\n\n${footerNote}`;
    const safeText =
      rawText.length > MAX_LINE_TEXT_LENGTH
        ? `${rawText.slice(0, MAX_LINE_TEXT_LENGTH - 3)}...`
        : rawText;

    const textMessage: LineTextMessage = {
      type: 'text',
      text: safeText,
    };

    const lineMessages: LineMessageObject[] = useFlex
      ? [
          this.buildFlexCard(headerLabel, headline, details, footerNote, finalLink, {
            headerColor: override?.headerColor,
            buttonLabel: override?.buttonLabel,
          }),
        ]
      : [textMessage];

    return {
      category,
      referenceType,
      referenceId: refId,
      inAppTitle,
      inAppMessage,
      link: finalLink,
      lineMessages,
    };
  }

  /**
   * สร้าง Flex Message Bubble ตามมาตรฐาน LINE Messaging API
   */
  buildFlexCard(
    headerLabel: string,
    headline: string,
    details: { label: string; value: string }[],
    footerNote: string,
    linkPath?: string,
    options?: { headerColor?: string; buttonLabel?: string },
  ): LineFlexMessage {
    const brandColor = options?.headerColor && /^#[0-9A-Fa-f]{6}$/.test(options.headerColor) ? options.headerColor : '#1B5E3C';
    const buttonLabel = (options?.buttonLabel || 'ดูรายละเอียด').slice(0, 20);
    const rawAlt = `${headerLabel}: ${headline}`;
    const altText =
      rawAlt.length > MAX_FLEX_ALT_TEXT_LENGTH
        ? `${rawAlt.slice(0, MAX_FLEX_ALT_TEXT_LENGTH - 3)}...`
        : rawAlt;

    const safeUrl = this.buildSafeUrl(linkPath);

    return {
      type: 'flex',
      altText,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1B5E3C',
          paddingAll: '14px',
          contents: [
            {
              type: 'text',
              text: headerLabel,
              color: '#FFFFFF',
              weight: 'bold',
              size: 'sm',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: headline,
              weight: 'bold',
              size: 'md',
              wrap: true,
              color: '#111827',
            },
            {
              type: 'separator',
              margin: 'md',
            },
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              margin: 'md',
              contents: details.map((d) => ({
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: d.label,
                    color: '#6B7280',
                    size: 'xs',
                    flex: 2,
                  },
                  {
                    type: 'text',
                    text: String(d.value || '-').slice(0, 200),
                    color: '#111827',
                    size: 'xs',
                    weight: 'bold',
                    wrap: true,
                    flex: 4,
                  },
                ],
              })),
            },
            {
              type: 'text',
              text: footerNote,
              size: 'xxs',
              color: '#6B7280',
              wrap: true,
              margin: 'md',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#1B5E3C',
              height: 'sm',
              action: {
                type: 'uri',
                label: 'เข้าสู่ระบบจับจอง',
                uri: safeUrl,
              },
            },
          ],
        },
      },
    };
  }
}

