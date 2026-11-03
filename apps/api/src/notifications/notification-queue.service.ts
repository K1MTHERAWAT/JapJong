import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LineNotificationLog } from '@jongwen/shared';
import { DbService } from '../db/db.service';
import { LineMessagingService } from '../line/messaging/line-messaging.service';
import { LineMessageObject } from '../line/messaging/line-messaging.types';

export interface EnqueueLineJobInput {
  userId: string;
  notificationId?: string | null;
  notificationType: string;
  eventKey?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  messages: LineMessageObject[];
  bypassPreferenceCheck?: boolean;
}

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);
  private readonly maxAttempts = 3;
  private readonly baseBackoffMs = 1000;

  constructor(
    private readonly db: DbService,
    private readonly lineMessaging: LineMessagingService,
  ) {}

  /**
   * บันทึกลง Outbox และส่งข้อความผ่าน LINE Messaging API
   * - ป้องกันการส่งซ้ำด้วย eventKey (Idempotency)
   * - ตรวจสอบสถานะ LINE Account และ Friendship Status (FRIEND / BLOCKED / UNFRIEND / UNKNOWN)
   * - ไม่โยน Error ออกไปกระทบ Business Transaction หลัก
   */
  async enqueueAndDispatch(input: EnqueueLineJobInput): Promise<{
    log: LineNotificationLog | null;
    duplicate?: boolean;
    skippedReason?: string;
  }> {
    try {
      // 1. ตรวจสอบ Idempotency / Duplicate Prevention
      if (input.eventKey) {
        const existing = await this.db.getLineNotificationLogByEventKey(input.eventKey);
        if (existing) {
          return { log: existing, duplicate: true };
        }
      }

      // 2. ตรวจสอบการตั้งค่า LINE Notification ของผู้รับ
      if (!input.bypassPreferenceCheck) {
        const lineEnabled = await this.db.isChannelEnabled(
          input.userId,
          'LINE',
          input.notificationType,
        );
        if (!lineEnabled) {
          return { log: null, skippedReason: 'LINE_PREFERENCE_DISABLED' };
        }
      }

      // 3. ตรวจสอบบัญชี LINE ที่เชื่อมต่อ
      const lineAccount = await this.db.getLineAccount(input.userId);
      if (!lineAccount || !lineAccount.isActive || !lineAccount.lineUserId) {
        const skipped = await this.db.createLineNotificationLog({
          userId: input.userId,
          notificationId: input.notificationId ?? null,
          lineUserId: 'UNLINKED',
          notificationType: input.notificationType,
          eventKey: input.eventKey ?? null,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          messagePayload: input.messages,
          status: 'SKIPPED',
          errorCode: 'NO_LINE_ACCOUNT',
          errorMessage: 'ผู้ใช้งานยังไม่ได้เชื่อมต่อบัญชี LINE',
        });
        return { log: skipped, skippedReason: 'NO_LINE_ACCOUNT' };
      }

      // 4. ตรวจสอบสถานะการบล็อก / เลิกเป็นเพื่อนกับ LINE OA
      if (lineAccount.friendshipStatus === 'BLOCKED' || lineAccount.friendshipStatus === 'UNFRIEND') {
        const skipped = await this.db.createLineNotificationLog({
          userId: input.userId,
          notificationId: input.notificationId ?? null,
          lineUserId: lineAccount.lineUserId,
          notificationType: input.notificationType,
          eventKey: input.eventKey ?? null,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          messagePayload: input.messages,
          status: 'SKIPPED',
          errorCode: `LINE_OA_${lineAccount.friendshipStatus}`,
          errorMessage: 'ผู้ใช้งานยังไม่ได้เพิ่มเพื่อนหรือบล็อก LINE Official Account',
        });
        return { log: skipped, skippedReason: `LINE_OA_${lineAccount.friendshipStatus}` };
      }

      // 5. สร้างรายการ Outbox (PENDING)
      const job = await this.db.createLineNotificationLog({
        userId: input.userId,
        notificationId: input.notificationId ?? null,
        lineUserId: lineAccount.lineUserId,
        notificationType: input.notificationType,
        eventKey: input.eventKey ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        messagePayload: input.messages,
        status: 'PENDING',
      });

      // 6. ส่งข้อความทันทีพร้อมกลไก Retry
      const finalLog = await this.processJob(job.id);
      return { log: finalLog };
    } catch (err) {
      this.logger.error(
        `Unexpected error in NotificationQueueService.enqueueAndDispatch: ${err instanceof Error ? err.message : err}`,
      );
      return { log: null, skippedReason: 'INTERNAL_QUEUE_ERROR' };
    }
  }

  /**
   * ประมวลผลการส่งข้อความของรายการใน Outbox
   */
  async processJob(
    logId: string,
    options?: { isManualRetry?: boolean },
  ): Promise<LineNotificationLog | null> {
    const job = await this.db.getLineNotificationLogById(logId);
    if (!job) return null;

    if (job.status === 'SENT') {
      return job;
    }

    const messages: LineMessageObject[] = Array.isArray(job.messagePayload)
      ? job.messagePayload
      : [{ type: 'text', text: 'จับจอง แจ้งเตือนระบบ' }];

    const nextAttempt = (job.attemptCount || 0) + 1;

    await this.db.updateLineNotificationLog(job.id, {
      status: 'PROCESSING',
      attemptCount: nextAttempt,
    });

    const result = await this.lineMessaging.sendPushMessage(job.lineUserId, messages);

    if (result.ok) {
      const updated = await this.db.updateLineNotificationLog(job.id, {
        status: 'SENT',
        providerMessageId: result.providerMessageId ?? null,
        errorCode: null,
        errorMessage: null,
        nextRetryAt: null,
        sentAt: new Date(),
      });
      return updated;
    }

    // กรณีผู้รับไม่ได้เป็นเพื่อนหรือบล็อก OA ให้อัปเดตสถานะเป็น UNFRIEND เพื่อไม่ส่งซ้ำโดยไม่จำเป็น
    if (result.errorCode === 'USER_NOT_FRIEND_OR_BLOCKED') {
      await this.db.updateLineFriendshipStatus(job.lineUserId, 'UNFRIEND');
    }

    const canRetry = result.retryable && nextAttempt < this.maxAttempts && !options?.isManualRetry;
    const backoffDelay = this.baseBackoffMs * Math.pow(2, nextAttempt - 1);
    const nextRetryAt = canRetry ? new Date(Date.now() + backoffDelay) : null;

    const failedLog = await this.db.updateLineNotificationLog(job.id, {
      status: 'FAILED',
      errorCode: result.errorCode || 'SEND_FAILED',
      errorMessage: result.errorMessage || 'ไม่สามารถส่งข้อความผ่าน LINE ได้',
      nextRetryAt,
    });

    return failedLog;
  }

  /**
   * สำหรับ Admin หรือระบบสั่ง Retry งานที่ส่งไม่สำเร็จ (FAILED)
   */
  async retryFailedJob(logId: string): Promise<LineNotificationLog> {
    const job = await this.db.getLineNotificationLogById(logId);
    if (!job) {
      throw new NotFoundException('ไม่พบรายการแจ้งเตือนที่ต้องการส่งซ้ำ');
    }

    if (job.status === 'SENT') {
      throw new BadRequestException('รายการนี้ถูกส่งสำเร็จไปแล้ว ไม่สามารถส่งซ้ำได้');
    }

    if (job.status === 'PROCESSING') {
      throw new BadRequestException('รายการนี้กำลังอยู่ระหว่างดำเนินการส่ง');
    }

    if (job.lineUserId === 'UNLINKED' || !job.lineUserId) {
      throw new BadRequestException('ผู้ใช้งานยังไม่ได้เชื่อมต่อบัญชี LINE ไม่สามารถส่งซ้ำได้');
    }

    const updated = await this.processJob(job.id, { isManualRetry: true });
    if (!updated) {
      throw new NotFoundException('ไม่สามารถอัปเดตสถานะการส่งซ้ำได้');
    }

    return updated;
  }
}

