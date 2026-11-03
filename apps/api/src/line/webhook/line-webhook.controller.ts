import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Public } from '../../auth/auth.guard';
import { LineWebhookService } from './line-webhook.service';
import { LineWebhookRequestBody } from './line-webhook.types';

@Controller('line')
export class LineWebhookController {
  constructor(private readonly webhookService: LineWebhookService) {}

  /**
   * POST /line/webhook (และ /api/line/webhook)
   * รับเหตุการณ์ follow, unfollow, message, accountLink จาก LINE Platform
   */
  @Public()
  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(
    @Headers('x-line-signature') signature: string | undefined,
    @Body() body: LineWebhookRequestBody,
    @Req() req: { rawBody?: Buffer | string },
  ) {
    const rawBody = req?.rawBody ?? JSON.stringify(body ?? {});
    return this.webhookService.handleWebhook(rawBody, signature, body);
  }
}

