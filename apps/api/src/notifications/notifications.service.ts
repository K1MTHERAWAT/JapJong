import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Account,
  AdminNotificationDashboardSummary,
  AppNotification,
  LineDeliveryStatus,
  LineNotificationLog,
  LineNotificationStatusResponse,
  Role,
} from '@jongwen/shared';
import { DbService } from '../db/db.service';
import { LineMessageTemplateService } from '../line/messaging/line-message-template.service';
import { LineMessagingService } from '../line/messaging/line-messaging.service';
import { NotificationTemplateInput } from '../line/messaging/line-messaging.types';
import { NotificationQueueService } from './notification-queue.service';

export interface DispatchNotificationOptions extends NotificationTemplateInput {
  userId: string;
  eventKey?: string;
  bypassLinePreference?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly processedInAppEventKeys = new Set<string>();

  constructor(
    private readonly db: DbService,
    private readonly templateService: LineMessageTemplateService,
    private readonly lineMessaging: LineMessagingService,
    private readonly queueService: NotificationQueueService,
  ) {}

  /**
   * ดึงรายการแจ้งเตือนของผู้ใช้ (User Data Isolation: เห็นเฉพาะของตนเองเท่านั้น)
   */
  getUserNotifications(userId: string): AppNotification[] {
    return this.db.notifications
      .filter((n) => n.userId === userId)
      .map((n) => ({
        ...n,
        message: n.message ?? n.body,
        isRead: n.isRead ?? n.read,
        createdAt: n.createdAt ?? n.at,
      }));
  }

  /**
   * นับจำนวนแจ้งเตือนที่ยังไม่ได้อ่านของผู้ใช้
   */
  getUnreadCount(userId: string): { unreadCount: number } {
    const unreadCount = this.db.notifications.filter((n) => n.userId === userId && !n.read).length;
    return { unreadCount };
  }

  /**
   * อ่านแจ้งเตือนรายการเดียว (ตรวจสอบความเป็นเจ้าของเสมอ)
   */
  async markAsRead(userId: string, notificationId: string): Promise<AppNotification> {
    const updated = await this.db.markNotificationRead(userId, notificationId);
    if (!updated) {
      throw new NotFoundException('ไม่พบรายการแจ้งเตือน หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้');
    }
    return {
      ...updated,
      message: updated.message ?? updated.body,
      isRead: true,
      createdAt: updated.createdAt ?? updated.at,
    };
  }

  /**
   * อ่านแจ้งเตือนทั้งหมดของผู้ใช้
   */
  markAllAsRead(userId: string): { ok: boolean } {
    this.db.markAllNotificationsRead(userId);
    return { ok: true };
  }

  /**
   * สร้างและส่งการแจ้งเตือนทั้ง In-App และ LINE ตามการตั้งค่าของผู้รับ
   * - แยกสถานะ Business Event ออกจากสถานะการส่งแจ้งเตือน (ไม่ทำให้ Transaction หลักล้มเหลว)
   */
  async dispatchToUser(options: DispatchNotificationOptions): Promise<{
    inApp: AppNotification | null;
    lineLog: LineNotificationLog | null;
    duplicate?: boolean;
  }> {
    try {
      const built = this.templateService.buildNotification(options);
      const dedupeKey = options.eventKey
        ? `${options.userId}:${options.eventKey}`
        : undefined;

      if (dedupeKey && this.processedInAppEventKeys.has(dedupeKey)) {
        const existingLine = await this.db.getLineNotificationLogByEventKey(dedupeKey);
        return {
          inApp: null,
          lineLog: existingLine,
          duplicate: true,
        };
      }

      if (dedupeKey) {
        this.processedInAppEventKeys.add(dedupeKey);
      }

      // 1. สร้าง In-App Notification (ตรวจสอบ Preference ภายใน db.notify)
      const inApp = await this.db.notify(
        options.userId,
        built.inAppTitle,
        built.inAppMessage,
        built.link,
        {
          notificationType: built.category,
          referenceType: built.referenceType,
          referenceId: built.referenceId,
        },
      );

      // 2. ส่งเข้าคิว LINE Notification (ตรวจสอบ Preference + LINE Account + Friendship Status)
      const queueRes = await this.queueService.enqueueAndDispatch({
        userId: options.userId,
        notificationId: inApp?.id ?? null,
        notificationType: built.category,
        eventKey: dedupeKey ?? null,
        referenceType: built.referenceType,
        referenceId: built.referenceId,
        messages: built.lineMessages,
        bypassPreferenceCheck: options.bypassLinePreference,
      });

      return {
        inApp,
        lineLog: queueRes.log,
        duplicate: queueRes.duplicate,
      };
    } catch (err) {
      this.logger.error(
        `Failed to dispatch notification to user ${options.userId}: ${err instanceof Error ? err.message : err}`,
      );
      return { inApp: null, lineLog: null };
    }
  }

  /**
   * ส่งการแจ้งเตือนไปยังผู้ใช้งานทุกคนในบทบาทที่กำหนด (เช่น STAFF, APPROVER_L2, APPROVER_L1)
   */
  async dispatchToRole(
    role: Role,
    templateInput: Omit<NotificationTemplateInput, 'recipientRole'>,
    eventKeyPrefix?: string,
  ): Promise<void> {
    try {
      const recipients: Account[] = this.db.accounts.filter(
        (a) => a.role === role && a.active !== false,
      );

      for (const recipient of recipients) {
        await this.dispatchToUser({
          ...templateInput,
          recipientRole: 'STAFF',
          userId: recipient.id,
          eventKey: eventKeyPrefix ? `${eventKeyPrefix}:${recipient.id}` : undefined,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to dispatch role notification (${role}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อ LINE OA และการรับแจ้งเตือนของผู้ใช้
   * (ไม่เปิดเผย lineUserId ดิบออกไปยัง Frontend ตามหลักความปลอดภัย Section 11)
   */
  async getLineNotificationStatus(userId: string): Promise<LineNotificationStatusResponse> {
    const lineAccount = await this.db.getLineAccount(userId);
    return {
      lineNotificationEnabled: this.lineMessaging.isEnabled,
      isLinked: Boolean(lineAccount && lineAccount.isActive),
      lineAccount: lineAccount
        ? {
            displayName: lineAccount.displayName,
            pictureUrl: lineAccount.pictureUrl,
            linkedAt: lineAccount.linkedAt.toISOString(),
            friendshipStatus: lineAccount.friendshipStatus || 'UNKNOWN',
          }
        : null,
      oaBasicId: this.lineMessaging.oaBasicId,
      addFriendUrl: this.lineMessaging.addFriendUrl,
    };
  }

  /**
   * ทดสอบส่งแจ้งเตือนผ่าน LINE
   */
  async sendTestNotification(userId: string, useFlex = false) {
    const res = await this.dispatchToUser({
      userId,
      event: 'TEST_NOTIFICATION',
      recipientRole: 'CITIZEN',
      useFlex,
      bypassLinePreference: true,
    });

    return {
      ok: Boolean(res.lineLog && res.lineLog.status === 'SENT'),
      inAppNotification: res.inApp,
      lineLog: res.lineLog,
    };
  }

  /**
   * ข้อมูลสรุปสำหรับ Admin Notification Dashboard
   */
  async getAdminLogs(status?: LineDeliveryStatus, limit = 100): Promise<AdminNotificationDashboardSummary> {
    const allLogs = await this.db.getLineNotificationLogs({ limit: 500 });
    const filteredLogs = status ? allLogs.filter((l) => l.status === status).slice(0, limit) : allLogs.slice(0, limit);

    return {
      total: allLogs.length,
      sent: allLogs.filter((l) => l.status === 'SENT').length,
      failed: allLogs.filter((l) => l.status === 'FAILED').length,
      pending: allLogs.filter((l) => l.status === 'PENDING' || l.status === 'PROCESSING').length,
      skipped: allLogs.filter((l) => l.status === 'SKIPPED').length,
      logs: filteredLogs,
    };
  }
}

