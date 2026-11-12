import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Account, LineDeliveryStatus, hasPermission } from '@japjong/shared';
import { CurrentUser, Permissions } from '../auth/auth.guard';
import {
  TestLineNotificationDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsService } from './notifications.service';

/**
 * Controller ศูนย์กลางระบบแจ้งเตือน (Notifications Center)
 * ให้บริการ: รายการแจ้งเตือนภายในเว็บ (In-App), การตั้งค่า Preferences, สถานะการแจ้งเตือน LINE, และแดชบอร์ดแอดมิน
 */
@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly preferencesService: NotificationPreferencesService,
    private readonly queueService: NotificationQueueService,
  ) {}

  // ===================== In-App Notifications (แจ้งเตือนภายในเว็บ) =====================

  /**
   * ดึงรายการการแจ้งเตือนทั้งหมดของผู้ใช้ปัจจุบัน
   * GET /notifications
   */
  @Get('notifications')
  getNotifications(@CurrentUser() user: Account) {
    return this.notificationsService.getUserNotifications(user.id);
  }

  /**
   * นับจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
   * GET /notifications/unread-count
   */
  @Get('notifications/unread-count')
  getUnreadCount(@CurrentUser() user: Account) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  /**
   * ทำเครื่องหมายว่าอ่านการแจ้งเตือนทั้งหมดแล้ว (PATCH)
   * PATCH /notifications/read-all
   */
  @Patch('notifications/read-all')
  patchReadAll(@CurrentUser() user: Account) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  /**
   * ทำเครื่องหมายว่าอ่านการแจ้งเตือนทั้งหมดแล้ว (POST)
   * POST /notifications/read-all
   */
  @Post('notifications/read-all')
  postReadAll(@CurrentUser() user: Account) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  /**
   * ทำเครื่องหมายว่าอ่านการแจ้งเตือนรายการที่ระบุแล้ว
   * PATCH /notifications/:id/read
   */
  @Patch('notifications/:id/read')
  async markRead(@CurrentUser() user: Account, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  // ===================== Notification Preferences (ตั้งค่าการรับแจ้งเตือน) =====================

  /**
   * ดึงการตั้งค่าช่องทางและประเภทการรับแจ้งเตือนของผู้ใช้ปัจจุบัน
   * GET /notifications/preferences
   */
  @Get('notifications/preferences')
  async getPreferences(@CurrentUser() user: Account) {
    const preferences = await this.preferencesService.getPreferences(user.id);
    return { preferences };
  }

  /**
   * บันทึกการตั้งค่าช่องทางและประเภทการรับแจ้งเตือน
   * PATCH /notifications/preferences
   */
  @Patch('notifications/preferences')
  async updatePreferences(
    @CurrentUser() user: Account,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    const preferences = await this.preferencesService.updatePreferences(
      user.id,
      dto.preferences || [],
    );
    return { ok: true, preferences };
  }

  // ===================== LINE Notification Status & Test (สถานะและทดสอบ LINE) =====================

  /**
   * ตรวจสอบสถานะความพร้อมของการแจ้งเตือนผ่าน LINE ของผู้ใช้
   * GET /line/notification/status
   */
  @Get('line/notification/status')
  async getLineNotificationStatus(@CurrentUser() user: Account) {
    return this.notificationsService.getLineNotificationStatus(user.id);
  }

  /**
   * ทดสอบส่งการแจ้งเตือนผ่าน LINE
   * POST /line/notification/test
   */
  @Post('line/notification/test')
  async sendTestNotification(
    @CurrentUser() user: Account,
    @Body() dto: TestLineNotificationDto,
  ) {
    const targetUserId = dto?.userId && dto.userId !== user.id ? dto.userId : user.id;

    // หากระบุส่งให้ผู้อื่น ต้องเป็น ADMIN หรือมีสิทธิ์ manageUsers เท่านั้น
    if (targetUserId !== user.id && user.role !== 'ADMIN' && !hasPermission(user, 'manageUsers')) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถทดสอบส่งข้อความไปยังผู้ใช้อื่นได้');
    }

    return this.notificationsService.sendTestNotification(targetUserId, dto?.useFlex ?? false);
  }

  // ===================== Admin Notification Dashboard (แดชบอร์ดประวัติการส่ง) =====================

  /**
   * ดึงประวัติ Log การส่งข้อความแจ้งเตือนทั้งหมดสำหรับแอดมิน
   * GET /admin/notifications/logs
   */
  @Permissions('manageUsers')
  @Get('admin/notifications/logs')
  async getAdminLogs(
    @Query('status') status?: LineDeliveryStatus,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(Number(limit) || 100, 1), 500) : 100;
    return this.notificationsService.getAdminLogs(status, parsedLimit);
  }

  /**
   * ดึงประวัติข้อความแจ้งเตือนที่ส่งไม่สำเร็จ (Failed Deliveries) สำหรับตรวจสอบและแก้ไข
   * GET /admin/notifications/failed
   */
  @Permissions('manageUsers')
  @Get('admin/notifications/failed')
  async getAdminFailedLogs(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(Math.max(Number(limit) || 100, 1), 500) : 100;
    const summary = await this.notificationsService.getAdminLogs('FAILED', parsedLimit);
    return {
      failedCount: summary.failed,
      logs: summary.logs,
    };
  }

  /**
   * สั่งให้ระบบลองส่งข้อความที่ล้มเหลวใหม่อีกครั้ง (Retry Failed Notification)
   * POST /admin/notifications/:id/retry
   */
  @Permissions('manageUsers')
  @Post('admin/notifications/:id/retry')
  async retryFailedNotification(@Param('id') id: string) {
    const log = await this.queueService.retryFailedJob(id);
    return {
      ok: log.status === 'SENT',
      log,
    };
  }
}
