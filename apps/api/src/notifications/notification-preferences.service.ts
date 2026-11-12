import { Injectable } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  UserNotificationPreference,
} from '@japjong/shared';
import { DbService } from '../db/db.service';

/**
 * Service บริหารจัดการการตั้งค่าการแจ้งเตือนส่วนบุคคล (Notification Preferences)
 * ควบคุมว่าผู้ใช้ยินยอมให้ส่งการแจ้งเตือนผ่านช่องทางใด (IN_APP, LINE) และในหมวดหมู่ใดบ้าง
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly db: DbService) {}

  /**
   * ดึงรายการการตั้งค่าการแจ้งเตือนทั้งหมดของผู้ใช้
   * @param userId รหัสบัญชีผู้ใช้
   */
  async getPreferences(userId: string): Promise<UserNotificationPreference[]> {
    return this.db.getUserNotificationPreferences(userId);
  }

  /**
   * บันทึกหรืออัปเดตการตั้งค่าการแจ้งเตือน
   * @param userId รหัสบัญชีผู้ใช้
   * @param items รายการการตั้งค่าใหม่
   */
  async updatePreferences(
    userId: string,
    items: {
      channel: NotificationChannel;
      notificationType: NotificationCategory;
      isEnabled: boolean;
    }[],
  ): Promise<UserNotificationPreference[]> {
    return this.db.upsertUserNotificationPreferences(userId, items);
  }

  /**
   * ตรวจสอบว่าผู้ใช้อนุญาตให้ส่งข้อความผ่านช่องทางและหมวดหมู่ที่ระบุหรือไม่
   * @param userId รหัสบัญชีผู้ใช้
   * @param channel ช่องทาง (IN_APP หรือ LINE)
   * @param notificationType หมวดหมู่การแจ้งเตือน
   * @returns true หากผู้ใช้เปิดรับการแจ้งเตือน
   */
  async isChannelEnabled(
    userId: string,
    channel: NotificationChannel,
    notificationType: NotificationCategory | string,
  ): Promise<boolean> {
    return this.db.isChannelEnabled(userId, channel, notificationType);
  }
}
