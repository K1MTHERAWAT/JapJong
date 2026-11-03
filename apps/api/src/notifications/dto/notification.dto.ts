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

export class NotificationPreferenceItemDto {
  @IsIn(['IN_APP', 'LINE'], { message: 'ช่องทางการแจ้งเตือนต้องเป็น IN_APP หรือ LINE' })
  channel!: NotificationChannel;

  @IsIn(
    ['BOOKING_STATUS', 'BORROW_STATUS', 'BORROW_RETURN', 'REPAIR_STATUS', 'DOCUMENT_SIGNING'],
    { message: 'ประเภทการแจ้งเตือนไม่ถูกต้อง' },
  )
  notificationType!: NotificationCategory;

  @IsBoolean({ message: 'สถานะการเปิด/ปิดต้องเป็นค่า Boolean' })
  isEnabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray({ message: 'รายการตั้งค่าต้องเป็น Array' })
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

export class TestLineNotificationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  useFlex?: boolean;
}

