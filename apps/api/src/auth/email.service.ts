import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendOtpResult {
  success: boolean;
  id?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  // ปิด Resend จริงชั่วคราว ใช้ Mock OTP แทน
  // private resend: Resend | null = null;

  constructor() {
    /* ปิดการเชื่อมต่อ Resend จริงชั่วคราว
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      try {
        this.resend = new Resend(apiKey);
        this.logger.log('Resend client initialized successfully.');
      } catch (err) {
        this.logger.error('Failed to initialize Resend client:', err);
      }
    } else {
      this.logger.warn(
        'RESEND_API_KEY is not set. OTP emails will be logged to console in demo/development mode.',
      );
    }
    */
    this.logger.log('EmailService: ใช้ระบบจำลอง Mock OTP สำหรับการทดสอบ (ปิด Resend จริงชั่วคราว)');
  }

  async sendSignOtpEmail(
    toEmail: string,
    otpCode: string,
    recipientName?: string,
  ): Promise<SendOtpResult> {
    const subject = `รหัส OTP สำหรับยืนยันการลงนามเอกสาร: ${otpCode} (อบต.น้ำชำ)`;

    /* ปิดการยิง API Resend จริงชั่วคราว
    const fromAddress =
      process.env.RESEND_FROM?.trim() || 'Jongwen อบต.น้ำชำ <onboarding@resend.dev>';

    if (this.resend) {
      try {
        const { data, error } = await this.resend.emails.send({
          from: fromAddress,
          to: [toEmail],
          subject,
          html: htmlContent,
        });

        if (error) {
          this.logger.error(`Resend API Error sending to ${toEmail}:`, error);
          return { success: false, error: error.message };
        }

        this.logger.log(`Resend email delivered successfully to ${toEmail} (ID: ${data?.id})`);
        return { success: true, id: data?.id };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to dispatch email via Resend to ${toEmail}:`, err);
        return { success: false, error: msg };
      }
    }
    */

    // Mock OTP Local Dispatch for Development / Testing
    this.logger.log(
      `\n========================================\n` +
      `📨 [MOCK RESEND OTP DISPATCH]\n` +
      `To: ${toEmail} (${recipientName || 'User'})\n` +
      `Subject: ${subject}\n` +
      `OTP CODE: >>> ${otpCode} <<<\n` +
      `Expires in: 5 minutes\n` +
      `========================================\n`,
    );

    return { success: true, id: 'mock-local-dispatch' };
  }
}

