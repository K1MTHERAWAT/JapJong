import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DbService } from '../../db/db.service';
import { LineMessagingService } from '../messaging/line-messaging.service';
import { LineMessageObject } from '../messaging/line-messaging.types';
import { LineWebhookEventPayload, LineWebhookRequestBody } from './line-webhook.types';

@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name);

  constructor(
    private readonly db: DbService,
    private readonly messaging: LineMessagingService,
  ) {}

  private get channelSecret(): string {
    return (process.env.LINE_CHANNEL_SECRET || '').trim();
  }

  private get frontendUrl(): string {
    const raw = (process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(raw);
      return parsed.origin;
    } catch {
      return 'http://localhost:3000';
    }
  }

  private get liffId(): string | null {
    const id = (process.env.NEXT_PUBLIC_LIFF_ID || process.env.LINE_LIFF_ID || '').trim();
    return id || null;
  }

  /**
   * สร้างลิงก์เปิดหน้าบริการ (เป็น LIFF URL หากมีการกำหนด LIFF ID ในระบบ)
   */
  buildServiceUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const liff = this.liffId;
    if (liff) {
      return `https://liff.line.me/${liff}?target=${encodeURIComponent(cleanPath)}`;
    }
    return `${this.frontendUrl}${cleanPath}`;
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
      // 1. ตรวจสอบ Event ซ้ำ (Idempotency & Deduplication)
      const existing = await this.db.findWebhookEvent(webhookEventId);
      if (existing && existing.processingStatus !== 'FAILED') {
        return 'DUPLICATE';
      }

      let status: 'PROCESSED' | 'IGNORED' = 'IGNORED';

      // 2. จัดการตามประเภท Event (พร้อม Event Ordering ผ่าน eventTime)
      if (ev.type === 'follow' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND', eventTime);
        status = 'PROCESSED';

        // ส่งข้อความต้อนรับแนะนำบริการ
        if (ev.replyToken) {
          await this.replyFollowWelcome(ev.replyToken);
        }
      } else if (ev.type === 'unfollow' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'BLOCKED', eventTime);
        status = 'PROCESSED';
      } else if (ev.type === 'message' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND', eventTime);
        status = 'PROCESSED';

        if (ev.replyToken && ev.message?.type === 'text') {
          await this.handleUserTextMessage(ev.replyToken, ev.message.text || '', lineUserId);
        }
      } else if (ev.type === 'postback' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND', eventTime);
        status = 'PROCESSED';

        if (ev.replyToken && ev.postback?.data) {
          await this.handlePostback(ev.replyToken, ev.postback.data, lineUserId);
        }
      } else if (ev.type === 'accountLink' && lineUserId) {
        await this.db.updateLineFriendshipStatus(lineUserId, 'FRIEND', eventTime);
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

  /**
   * ตอบกลับข้อความต้อนรับเมื่อผู้ใช้ Follow LINE Official Account
   */
  private async replyFollowWelcome(replyToken: string) {
    const welcomeText =
      'ยินดีต้อนรับสู่ระบบจับจอง (JapJong)\n' +
      'ระบบบริหารจัดการขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อมบำรุง\n\n' +
      'ท่านสามารถเข้าใช้งานบริการได้ผ่านเมนูด้านล่าง หรือพิมพ์คำสั่ง:\n' +
      '• menu : ดูเมนูบริการทั้งหมด\n' +
      '• booking : ขอใช้สถานที่ราชการ\n' +
      '• borrow : ขอยืม-คืนครุภัณฑ์\n' +
      '• repair : แจ้งซ่อมบำรุง\n' +
      '• track : ติดตามสถานะคำขอ\n' +
      '• help : วิธีใช้งานและช่วยเหลือ';

    const messages: LineMessageObject[] = [
      {
        type: 'text',
        text: welcomeText,
      },
    ];

    try {
      await this.messaging.sendReplyMessage(replyToken, messages);
    } catch (err) {
      this.logger.warn('Failed to reply follow welcome message', err);
    }
  }

  /**
   * จัดการข้อความคำสั่งที่ผู้ใช้พิมพ์ส่งเข้ามา
   */
  private async handleUserTextMessage(replyToken: string, text: string, _lineUserId: string) {
    const normalized = text.trim().toLowerCase();

    // Allowlist keywords
    if (['menu', 'เมนู', 'บริการ', 'service', 'services'].includes(normalized)) {
      await this.replyMenu(replyToken);
    } else if (['booking', 'จอง', 'จองสถานที่', 'ขอใช้สถานที่'].includes(normalized)) {
      await this.replyServiceLink(
        replyToken,
        '🏛️ บริการขอใช้สถานที่ราชการ',
        'ยื่นคำขอจองห้องประชุม ลานกิจกรรม และสถานที่ราชการได้อย่างสะดวก',
        '/booking',
        'ไปยังหน้าขอใช้สถานที่',
      );
    } else if (['borrow', 'ยืม', 'ยืมอุปกรณ์', 'ยืมครุภัณฑ์', 'ขอยืม'].includes(normalized)) {
      await this.replyServiceLink(
        replyToken,
        '📦 บริการขอยืม–คืนครุภัณฑ์',
        'ยื่นคำขอยืมอุปกรณ์ ครุภัณฑ์ โสตทัศนูปกรณ์ หรือเต็นท์ราชการ',
        '/borrow',
        'ไปยังหน้าขอยืมครุภัณฑ์',
      );
    } else if (['repair', 'maintenance', 'ซ่อม', 'แจ้งซ่อม', 'แจ้งซ่อมบำรุง'].includes(normalized)) {
      await this.replyServiceLink(
        replyToken,
        '🔧 บริการแจ้งซ่อมบำรุง',
        'แจ้งปัญหาอุปกรณ์ชำรุด อาคารสถานที่เสียหาย หรืออุปกรณ์ขัดข้อง',
        '/repair',
        'ไปยังหน้าแจ้งซ่อมบำรุง',
      );
    } else if (['track', 'status', 'ติดตาม', 'สถานะ', 'คำขอของฉัน', 'ประวัติ'].includes(normalized)) {
      await this.replyServiceLink(
        replyToken,
        '📋 ติดตามสถานะคำขอ',
        'ตรวจสอบขั้นตอนการพิจารณา การอนุมัติ และประวัติคำขอของท่าน',
        '/history',
        'ตรวจสอบสถานะคำขอ',
      );
    } else if (['login', 'เข้าสู่ระบบ', 'ลงชื่อเข้าใช้'].includes(normalized)) {
      await this.replyServiceLink(
        replyToken,
        '🔐 เข้าสู่ระบบจับจอง',
        'เข้าสู่ระบบเพื่อยื่นคำขอและติดตามสถานะผ่าน LINE อัตโนมัติ',
        '/login',
        'เข้าสู่ระบบจับจอง',
      );
    } else if (['contact', 'ติดต่อ', 'ติดต่อเรา', 'โทร'].includes(normalized)) {
      await this.replyText(
        replyToken,
        '📞 ช่องทางการติดต่อ\n\n' +
          '• สำนักงาน อบต. (ฝ่ายบริหารทั่วไป / งานอาคารสถานที่)\n' +
          '• เปิดทำการ: วันจันทร์ - ศุกร์ เวลา 08:30 - 16:30 น.\n' +
          '• ติดต่อผ่านระบบเว็บไซต์: ' +
          this.frontendUrl,
      );
    } else if (['help', 'ช่วยเหลือ', 'วิธีใช้', 'คู่มือ'].includes(normalized)) {
      await this.replyText(
        replyToken,
        '💡 คำแนะนำการใช้งานระบบจับจอง (JapJong)\n\n' +
          'ท่านสามารถพิมพ์คำสั่งต่อไปนี้เพื่อรับลิงก์บริการได้ทันที:\n' +
          '• menu - เปิดดูเมนูบริการทั้งหมด\n' +
          '• booking - ยื่นคำขอใช้สถานที่ราชการ\n' +
          '• borrow - ยื่นคำขอยืมอุปกรณ์/ครุภัณฑ์\n' +
          '• repair - แจ้งซ่อมบำรุงอาคาร/อุปกรณ์\n' +
          '• track - ติดตามสถานะคำขอของท่าน\n' +
          '• contact - ข้อมูลการติดต่อหน่วยงาน\n\n' +
          'หรือคลิกเข้าใช้งานผ่านระบบ LIFF: ' +
          this.buildServiceUrl('/'),
      );
    } else {
      // Default fallback message for unrecognized input
      await this.replyText(
        replyToken,
        'ขออภัยครับ ระบบไม่เข้าใจคำสั่งที่ท่านส่งมา\n\n' +
          'ท่านสามารถพิมพ์ "menu" เพื่อดูเมนูบริการ หรือพิมพ์ "help" เพื่อดูคำสั่งที่สามารถใช้งานได้ครับ',
      );
    }
  }

  /**
   * จัดการ Postback Events
   */
  private async handlePostback(replyToken: string, postbackData: string, _lineUserId: string) {
    const params = new URLSearchParams(postbackData);
    const action = params.get('action');

    // Strict allowlist validation
    switch (action) {
      case 'menu':
        await this.replyMenu(replyToken);
        break;
      case 'booking':
        await this.replyServiceLink(
          replyToken,
          '🏛️ ขอใช้สถานที่ราชการ',
          'คลิกปุ่มด้านล่างเพื่อเข้าสู่ระบบยื่นคำขอจองสถานที่',
          '/booking',
          'เปิดหน้าจองสถานที่',
        );
        break;
      case 'borrow':
        await this.replyServiceLink(
          replyToken,
          '📦 ขอยืม–คืนครุภัณฑ์',
          'คลิกปุ่มด้านล่างเพื่อเข้าสู่ระบบยื่นคำขอยืมอุปกรณ์',
          '/borrow',
          'เปิดหน้ายืมครุภัณฑ์',
        );
        break;
      case 'repair':
        await this.replyServiceLink(
          replyToken,
          '🔧 แจ้งซ่อมบำรุง',
          'คลิกปุ่มด้านล่างเพื่อแจ้งปัญหาอาคารสถานที่หรืออุปกรณ์ชำรุด',
          '/repair',
          'เปิดหน้าแจ้งซ่อม',
        );
        break;
      case 'track':
      case 'my_requests':
        await this.replyServiceLink(
          replyToken,
          '📋 ติดตามสถานะคำขอ',
          'คลิกปุ่มด้านล่างเพื่อตรวจสอบความคืบหน้าของคำขอทั้งหมด',
          '/history',
          'ดูรายการคำขอของฉัน',
        );
        break;
      case 'profile':
        await this.replyServiceLink(
          replyToken,
          '👤 ข้อมูลบัญชีผู้ใช้งาน',
          'ตรวจสอบและจัดการข้อมูลโปรไฟล์ในระบบจับจอง',
          '/account',
          'เปิดหน้าโปรไฟล์',
        );
        break;
      case 'contact':
        await this.replyText(
          replyToken,
          '📞 ติดต่อสอบถาม: สำนักงาน อบต. เปิดทำการ วันจันทร์ - ศุกร์ เวลา 08:30 - 16:30 น.',
        );
        break;
      default:
        await this.replyText(replyToken, 'ท่านสามารถพิมพ์ "menu" เพื่อดูเมนูบริการของระบบจับจองได้ตลอดเวลาครับ');
        break;
    }
  }

  private async replyMenu(replyToken: string) {
    const bookingUrl = this.buildServiceUrl('/booking');
    const borrowUrl = this.buildServiceUrl('/borrow');
    const repairUrl = this.buildServiceUrl('/repair');
    const historyUrl = this.buildServiceUrl('/history');

    const text =
      '🌟 เมนูบริการระบบจับจอง (JapJong)\n\n' +
      `1. ขอใช้สถานที่ราชการ:\n${bookingUrl}\n\n` +
      `2. ขอยืม–คืนครุภัณฑ์:\n${borrowUrl}\n\n` +
      `3. แจ้งซ่อมบำรุง:\n${repairUrl}\n\n` +
      `4. ติดตามสถานะคำขอ:\n${historyUrl}`;

    await this.replyText(replyToken, text);
  }

  private async replyServiceLink(
    replyToken: string,
    title: string,
    description: string,
    targetPath: string,
    _buttonLabel: string,
  ) {
    const url = this.buildServiceUrl(targetPath);
    const content = `${title}\n\n${description}\n\n👉 เข้าใช้งานได้ที่:\n${url}`;
    await this.replyText(replyToken, content);
  }

  private async replyText(replyToken: string, text: string) {
    const messages: LineMessageObject[] = [{ type: 'text', text }];
    try {
      await this.messaging.sendReplyMessage(replyToken, messages);
    } catch (err) {
      this.logger.warn('Failed to dispatch reply message', err);
    }
  }
}
