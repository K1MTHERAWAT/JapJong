import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/auth.guard';
import { LineWebhookService } from './line-webhook.service';
import { LineWebhookRequestBody } from './line-webhook.types';

/**
 * Controller รับคำขอ Webhook จากระบบ LINE Messaging API
 * รองรับการตรวจสอบ Signature ดิจิทัล (HMAC-SHA256) และประมวลผลอีเวนต์ต่างๆ
 */
@ApiTags('Notifications')
@SkipThrottle()
@Controller('line')
export class LineWebhookController {
  constructor(private readonly webhookService: LineWebhookService) {}

  /**
   * รับคำขอ Webhook จาก LINE Platform (Public)
   * POST /line/webhook (หรือ /api/line/webhook)
   * @param signature ค่า Header x-line-signature จาก LINE
   * @param body ข้อมูลเหตุการณ์จาก LINE
   * @param req Request อ็อบเจกต์ที่มี rawBody สำหรับตรวจสอบลายเซ็น
   */
  @Public()
  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(
    @Headers('x-line-signature') signature: string | undefined,
    @Body() body: LineWebhookRequestBody,
    @Req() req: { rawBody?: Buffer | string },
  ) {
    // ใช้ rawBody เพื่อความถูกต้องในการคำนวณ HMAC Signature
    const rawBody = req?.rawBody ?? JSON.stringify(body ?? {});
    return this.webhookService.handleWebhook(rawBody, signature, body);
  }
}
