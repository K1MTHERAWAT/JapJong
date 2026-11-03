import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DbService } from '../../db/db.service';
import { LineWebhookEventPayload, LineWebhookRequestBody } from './line-webhook.types';

@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name);

  constructor(private readonly db: DbService) {}

  private get channelSecret(): string {
    return (process.env.LINE_CHANNEL_SECRET || '').trim();
  }

  /**
   * ตรวจสอบ X-Line-Signature จาก Raw Request Body ด้วย HMAC-SHA256
   */
  verifySignature(rawBody: string | Buffer, signature?: string): boolean {
    if (!signature || !rawBody) return false;
    const secret = this.channelSecret;
    if (!secret) {
      this.logger.warn('LINE_CHANNEL_SECRET is not configured for webhook verification');
      return false;
    }

    const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf-8');
    const expected = crypto.createHmac('sha256', secret).update(bodyBuf).digest('base64');

    const sigBuf = Buffer.from(String(signature).trim(), 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * ประมวลผล Webhook Events จาก LINE Platform แบบ Idempotent
   */
  async handleWebhook(
    rawBody: string | Buffer,
    signature: string | undefined,
    parsedBody: LineWebhookRequestBody,
  ): Promise<{
    ok: boolean;
    processed: number;
    duplicates: number;
    failed: number;
  }> {
    if (!this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid X-Line-Signature');
    }

    const events = Array.isArray(parsedBody?.events) ? parsedBody.events : [];
    let processed = 0;
    let duplicates = 0;
    let failed = 0;

    for (const ev of events) {
      const result = await this.processSingleEvent(ev);
      if (result === 'DUPLICATE') duplicates++;
      else if (result === 'FAILED') failed++;
      else processed++;
    }

    return {
      ok: true,
      processed,
      duplicates,
      failed,
    };
  }

  async processSingleEvent(
    ev: LineWebhookEventPayload,
  ): Promise<'PROCESSED' | 'IGNORED' | 'DUPLICATE' | 'FAILED'> {
    const lineUserId = ev.source?.userId || null;
    const eventTime = ev.timestamp ? new Date(ev.timestamp) : new Date();
    const webhookEventId =
      ev.webhookEventId ||
      `evt_${crypto
        .createHash('sha256')
        .update(`${ev.type}:${lineUserId || 'anon'}:${ev.timestamp || Date.now()}`)
        .digest('hex')
        .slice(0, 32)}`;

    try {
      // 1. ตรวจสอบ Event ซ้ำ (Idempotency)
      const existing = await this.db.findWebhookEvent(webhookEventId);
      if (existing && existing.processingStatus !== 'FAILED') {
        return 'DUPLICATE';
      }

      let status: 'PROCESSED' | 'IGNORED' = 'IGNORED';

      if (ev.type === 'follow' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND');
        status = 'PROCESSED';
      } else if (ev.type === 'unfollow' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'BLOCKED');
        status = 'PROCESSED';
      } else if (ev.type === 'message' && lineUserId) {
        // หากส่งข้อความเข้ามา แปลว่าเป็นเพื่อนกับ OA อยู่
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND');
        status = 'PROCESSED';
      } else if (ev.type === 'accountLink' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND');
        status = 'PROCESSED';
      }

      await this.db.recordWebhookEvent({
        webhookEventId,
        eventType: ev.type || 'unknown',
        lineUserId,
        eventTimestamp: eventTime,
        processingStatus: status,
      });

      return status;
    } catch (err) {
      this.logger.error(
        `Failed to process LINE webhook event ${webhookEventId}: ${err instanceof Error ? err.message : err}`,
      );
      await this.db
        .recordWebhookEvent({
          webhookEventId,
          eventType: ev.type || 'unknown',
          lineUserId,
          eventTimestamp: eventTime,
          processingStatus: 'FAILED',
        })
        .catch(() => {});
      return 'FAILED';
    }
  }
}

