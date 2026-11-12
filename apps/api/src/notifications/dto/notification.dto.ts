import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { NotificationCategory, NotificationChannel } from '@japjong/shared';

/**
 * Data Transfer Object (DTO) สำหรับรายการตั้งค่าช่องทางและประเภทการรับการแจ้งเตือน
 */
export class NotificationPreferenceItemDto {
  // ช่องทางการแจ้งเตือน (ในระบบ IN_APP หรือผ่านไลน์ LINE)
  @IsIn(['IN_APP', 'LINE'], { message: 'ช่องทางการแจ้งเตือนต้องเป็น IN_APP หรือ LINE' })
  channel!: NotificationChannel;

  // หมวดหมู่การแจ้งเตือน (สถานะการจอง, การยืมอุปกรณ์, การแจ้งซ่อม, การลงนามเอกสาร)
  @IsIn(
    ['BOOKING_STATUS', 'BORROW_STATUS', 'BORROW_RETURN', 'REPAIR_STATUS', 'DOCUMENT_SIGNING'],
    { message: 'ประเภทการแจ้งเตือนไม่ถูกต้อง' },
  )
  notificationType!: NotificationCategory;

  // สถานะเปิดใช้งาน (true = เปิดรับ, false = ปิดรับ)
  @IsBoolean({ message: 'สถานะการเปิด/ปิดต้องเป็นค่า Boolean' })
  isEnabled!: boolean;
}

/**
 * Data Transfer Object (DTO) สำหรับบันทึกการตั้งค่าการแจ้งเตือนของผู้ใช้
 */
export class UpdateNotificationPreferencesDto {
  // รายการการตั้งค่าทั้งหมด
  @IsArray({ message: 'รายการตั้งค่าต้องเป็น Array' })
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

/**
 * Data Transfer Object (DTO) สำหรับทดสอบส่งการแจ้งเตือนผ่าน LINE
 */
export class TestLineNotificationDto {
  // รหัสผู้ใช้เป้าหมาย (หากไม่ระบุจะส่งให้ผู้ใช้ปัจจุบัน)
  @IsOptional()
  @IsString()
  userId?: string;

  // เลือกว่าจะส่งเป็น Flex Message หรือข้อความธรรมดา
  @IsOptional()
  @IsBoolean()
  useFlex?: boolean;
}
