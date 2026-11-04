import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  LineApiResult,
  LineMessageObject,
  LinePushResult,
  LineRichMenuObject,
} from './line-messaging.types';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';

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

  /**
   * ส่ง Reply Message กลับไปยังผู้ใช้ผ่าน replyToken
   */
  async sendReplyMessage(
    replyToken: string,
    messages: LineMessageObject[],
  ): Promise<LinePushResult> {
    const token = String(replyToken || '').trim();
    if (!token) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: 'MISSING_REPLY_TOKEN',
        errorMessage: 'ไม่พบ replyToken ของคำขอ',
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

    if (!this.isEnabled || !this.channelAccessToken) {
      const mockId = `mock_reply_${crypto.randomBytes(8).toString('hex')}`;
      this.logger.log(
        `[MOCK LINE REPLY] Token=${token.slice(0, 6)}... Messages=${messages.length} Id=${mockId}`,
      );
      return {
        ok: true,
        providerMessageId: mockId,
        statusCode: 200,
        retryable: false,
        mock: true,
      };
    }

    try {
      const response = await fetch(LINE_REPLY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({
          replyToken: token,
          messages,
        }),
      });

      const requestId = response.headers.get('x-line-request-id') || undefined;

      if (response.ok) {
        return {
          ok: true,
          providerMessageId: requestId || `reply_${Date.now()}`,
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
        err instanceof Error ? err.message : 'Network error connecting to LINE Reply API',
      );
      this.logger.error(`LINE Reply API network failure: ${safeMsg}`);
      return {
        ok: false,
        statusCode: 503,
        errorCode: 'NETWORK_ERROR',
        errorMessage: safeMsg,
        retryable: false,
      };
    }
  }

  // ===================== Phase 5: Rich Menu API =====================

  /** true เมื่อเรียก LINE API จริงได้ (เปิดใช้งาน + มี Token) — นอกนั้นเป็น Mock สำหรับ Dev/Test */
  get canCallLineApi(): boolean {
    return this.isEnabled && !!this.channelAccessToken;
  }

  /** สร้าง Rich Menu บน LINE และคืน richMenuId */
  async createRichMenu(definition: LineRichMenuObject | Record<string, unknown>): Promise<LineApiResult<{ richMenuId: string }>> {
    const res = await this.callLineApi('POST', 'https://api.line.me/v2/bot/richmenu', JSON.stringify(definition), 'application/json');
    if (!res.ok) return res as LineApiResult<{ richMenuId: string }>;
    const richMenuId = (res.data as { richMenuId?: string } | undefined)?.richMenuId
      || (res.mock ? `richmenu-mock${crypto.randomBytes(12).toString('hex')}` : '');
    if (!richMenuId) {
      return { ok: false, statusCode: 502, errorCode: 'LINE_BAD_RESPONSE', errorMessage: 'LINE ไม่ส่ง richMenuId กลับมา', retryable: false };
    }
    return { ...res, data: { richMenuId } };
  }

  /** อัปโหลดภาพ Rich Menu (PNG/JPEG) */
  uploadRichMenuImage(richMenuId: string, image: Buffer, mimeType: 'image/png' | 'image/jpeg') {
    return this.callLineApi(
      'POST',
      `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`,
      image,
      mimeType,
    );
  }

  deleteRichMenu(richMenuId: string) {
    return this.callLineApi('DELETE', `https://api.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`);
  }

  setDefaultRichMenu(richMenuId: string) {
    return this.callLineApi('POST', `https://api.line.me/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`);
  }

  linkRichMenuToUser(lineUserId: string, richMenuId: string) {
    return this.callLineApi(
      'POST',
      `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
    );
  }

  unlinkRichMenuFromUser(lineUserId: string) {
    return this.callLineApi('DELETE', `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`);
  }

  private async callLineApi(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body?: string | Buffer,
    contentType?: string,
  ): Promise<LineApiResult<unknown>> {
    if (!this.canCallLineApi) {
      this.logger.log(`[MOCK LINE API] ${method} ${url.replace(/\/user\/U[0-9a-f]+/i, '/user/U***')}`);
      return { ok: true, statusCode: 200, retryable: false, mock: true };
    }
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${this.channelAccessToken}` };
      if (contentType) headers['Content-Type'] = contentType;
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : (body as unknown as BodyInit),
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        data = undefined;
      }
      if (response.ok) {
        return { ok: true, statusCode: response.status, retryable: false, data };
      }
      const detail = this.sanitizeErrorMessage((data as { message?: string } | undefined)?.message || `HTTP ${response.status}`);
      return this.classifyHttpError(response.status, detail);
    } catch (err) {
      const safeMsg = this.sanitizeErrorMessage(err instanceof Error ? err.message : 'Network error connecting to LINE API');
      this.logger.error(`LINE API network failure: ${safeMsg}`);
      return { ok: false, statusCode: 503, errorCode: 'NETWORK_ERROR', errorMessage: safeMsg, retryable: true };
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

