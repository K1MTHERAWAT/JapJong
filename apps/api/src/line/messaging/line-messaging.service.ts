import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { LineMessageObject, LinePushResult } from './line-messaging.types';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  get isEnabled(): boolean {
    return process.env.LINE_NOTIFICATION_ENABLED === 'true';
  }

  get channelAccessToken(): string {
    return (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  }

  get oaBasicId(): string | null {
    const id = (process.env.LINE_OA_BASIC_ID || '').trim();
    return id || null;
  }

  get addFriendUrl(): string | null {
    const basicId = this.oaBasicId;
    if (!basicId) return null;
    const normalized = basicId.startsWith('@') ? basicId : `@${basicId}`;
    return `https://line.me/R/ti/p/${encodeURIComponent(normalized)}`;
  }

  /**
   * ส่ง Push Message ไปยัง LINE User ID ผ่าน LINE Messaging API
   * - หาก LINE_NOTIFICATION_ENABLED !== 'true' หรือไม่มี Channel Access Token ในโหมด Dev/Test จะใช้ Mock Provider
   * - ไม่เคยบันทึกหรือส่งคืน Access Token ใน Log หรือ Error Message
   */
  async sendPushMessage(
    lineUserId: string,
    messages: LineMessageObject[],
    retryKey?: string,
  ): Promise<LinePushResult> {
    const target = String(lineUserId || '').trim();
    if (!target) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: 'MISSING_LINE_USER_ID',
        errorMessage: 'ไม่พบ LINE User ID ของผู้รับ',
        retryable: false,
      };
    }

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 5) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: 'INVALID_MESSAGE_PAYLOAD',
        errorMessage: 'จำนวนข้อความต้องอยู่ระหว่าง 1 ถึง 5 ข้อความตามข้อกำหนดของ LINE Messaging API',
        retryable: false,
      };
    }

    // หากปิดการใช้งานจริง หรือยังไม่ได้ตั้งค่า Token ให้ใช้ Mock Provider สำหรับ Dev/Test
    if (!this.isEnabled || !this.channelAccessToken) {
      const mockId = `mock_${crypto.randomBytes(8).toString('hex')}`;
      this.logger.log(
        `[MOCK LINE PUSH] To=${this.maskLineUserId(target)} Messages=${messages.length} Id=${mockId}`,
      );
      return {
        ok: true,
        providerMessageId: mockId,
        statusCode: 200,
        retryable: false,
        mock: true,
      };
    }

    const idempotencyUuid = retryKey && this.isValidUuid(retryKey) ? retryKey : crypto.randomUUID();

    try {
      const response = await fetch(LINE_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
          'X-Line-Retry-Key': idempotencyUuid,
        },
        body: JSON.stringify({
          to: target,
          messages,
        }),
      });

      const requestId = response.headers.get('x-line-request-id') || undefined;

      if (response.ok) {
        let bodyMsgId: string | undefined;
        try {
          const data = (await response.json()) as { sentMessages?: { id?: string }[] };
          bodyMsgId = data?.sentMessages?.[0]?.id;
        } catch {
          // Ignore empty JSON body
        }
        return {
          ok: true,
          providerMessageId: bodyMsgId || requestId || `line_${Date.now()}`,
          statusCode: response.status,
          retryable: false,
        };
      }

      let errDetail = '';
      try {
        const errJson = (await response.json()) as { message?: string };
        errDetail = this.sanitizeErrorMessage(errJson?.message || '');
      } catch {
        errDetail = `HTTP ${response.status}`;
      }

      return this.classifyHttpError(response.status, errDetail);
    } catch (err) {
      const safeMsg = this.sanitizeErrorMessage(
        err instanceof Error ? err.message : 'Network error connecting to LINE Messaging API',
      );
      this.logger.error(`LINE Messaging API network failure: ${safeMsg}`);
      return {
        ok: false,
        statusCode: 503,
        errorCode: 'NETWORK_ERROR',
        errorMessage: safeMsg,
        retryable: true,
      };
    }
  }

  private classifyHttpError(status: number, detail: string): LinePushResult {
    const lower = detail.toLowerCase();

    if (status === 401 || status === 403) {
      return {
        ok: false,
        statusCode: status,
        errorCode: 'INVALID_ACCESS_TOKEN',
        errorMessage: 'Channel Access Token ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน LINE Messaging API',
        retryable: false,
      };
    }

    if (status === 429) {
      const isQuota = lower.includes('limit') || lower.includes('quota') || lower.includes('monthly');
      return {
        ok: false,
        statusCode: 429,
        errorCode: isQuota ? 'QUOTA_EXCEEDED' : 'RATE_LIMIT_EXCEEDED',
        errorMessage: detail || 'เกินขีดจำกัดการส่งข้อความ (Rate Limit / Quota Exceeded)',
        retryable: !isQuota,
      };
    }

    if (status === 400 || status === 404) {
      if (lower.includes('not found') || lower.includes('not a friend') || lower.includes('failed to send')) {
        return {
          ok: false,
          statusCode: status,
          errorCode: 'USER_NOT_FRIEND_OR_BLOCKED',
          errorMessage: 'ผู้ใช้ยังไม่ได้เพิ่มเพื่อนหรือบล็อก LINE Official Account',
          retryable: false,
        };
      }
      return {
        ok: false,
        statusCode: status,
        errorCode: 'LINE_BAD_REQUEST',
        errorMessage: detail || 'คำขอส่งข้อความไม่ถูกต้อง',
        retryable: false,
      };
    }

    if (status >= 500 || status === 409) {
      return {
        ok: false,
        statusCode: status,
        errorCode: 'LINE_SERVER_ERROR',
        errorMessage: detail || `LINE Platform ขัดข้องชั่วคราว (HTTP ${status})`,
        retryable: true,
      };
    }

    return {
      ok: false,
      statusCode: status,
      errorCode: `HTTP_${status}`,
      errorMessage: detail || `เกิดข้อผิดพลาดจาก LINE API (HTTP ${status})`,
      retryable: false,
    };
  }

  /**
   * ป้องกันไม่ให้ Token หรือ Secret หลุดลงใน Error Message หรือ Log
   */
  private sanitizeErrorMessage(msg: string): string {
    if (!msg) return '';
    let sanitized = msg;
    const token = this.channelAccessToken;
    const secret = (process.env.LINE_CHANNEL_SECRET || '').trim();
    if (token && token.length > 4) {
      sanitized = sanitized.split(token).join('[REDACTED_TOKEN]');
    }
    if (secret && secret.length > 4) {
      sanitized = sanitized.split(secret).join('[REDACTED_SECRET]');
    }
    return sanitized.slice(0, 500);
  }

  private maskLineUserId(lineUserId: string): string {
    if (lineUserId.length <= 8) return '***';
    return `${lineUserId.slice(0, 4)}...${lineUserId.slice(-4)}`;
  }

  private isValidUuid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  }
}

