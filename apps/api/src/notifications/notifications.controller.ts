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

@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly preferencesService: NotificationPreferencesService,
    private readonly queueService: NotificationQueueService,
  ) {}

  // ===================== In-App Notifications =====================

  @Get('notifications')
  getNotifications(@CurrentUser() user: Account) {
    return this.notificationsService.getUserNotifications(user.id);
  }

  @Get('notifications/unread-count')
  getUnreadCount(@CurrentUser() user: Account) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch('notifications/read-all')
  patchReadAll(@CurrentUser() user: Account) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Post('notifications/read-all')
  postReadAll(@CurrentUser() user: Account) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch('notifications/:id/read')
  async markRead(@CurrentUser() user: Account, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  // ===================== Notification Preferences =====================

  @Get('notifications/preferences')
  async getPreferences(@CurrentUser() user: Account) {
    const preferences = await this.preferencesService.getPreferences(user.id);
    return { preferences };
  }

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

  // ===================== LINE Notification Status & Test =====================

  @Get('line/notification/status')
  async getLineNotificationStatus(@CurrentUser() user: Account) {
    return this.notificationsService.getLineNotificationStatus(user.id);
  }

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

  // ===================== Admin Notification Dashboard =====================

  @Permissions('manageUsers')
  @Get('admin/notifications/logs')
  async getAdminLogs(
    @Query('status') status?: LineDeliveryStatus,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(Number(limit) || 100, 1), 500) : 100;
    return this.notificationsService.getAdminLogs(status, parsedLimit);
  }

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

