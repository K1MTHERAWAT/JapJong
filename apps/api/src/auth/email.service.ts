import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendOtpResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface SendSignOtpOptions {
  isDemo?: boolean;
}

/**
 * ตรวจสอบว่าเป็นอีเมลจำลองสำหรับโหมดทดสอบ/เดโมหรือไม่
 */
export function isDemoEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith('@namcham.go.th') ||
    lower.endsWith('@example.com') ||
    lower.endsWith('@example.org') ||
    lower.endsWith('@test.com') ||
    lower.endsWith('@demo.local') ||
    lower.endsWith('.local')
  );
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor() {
    this.ensureClient();
  }

  private ensureClient(): Resend | null {
    if (this.resend) return this.resend;
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
    return this.resend;
  }

  async sendSignOtpEmail(
    toEmail: string,
    otpCode: string,
    recipientName?: string,
    options?: SendSignOtpOptions,
  ): Promise<SendOtpResult> {
    const subject = `รหัส OTP สำหรับยืนยันการลงนามเอกสาร: ${otpCode} (อบต.)`;
    const isDemo = Boolean(options?.isDemo || isDemoEmail(toEmail));

    // โหมดเดโม: ข้าม Resend จริงเพื่อป้องกัน Error จากอีเมลตัวอย่างที่ไม่ได้รับอนุญาต
    if (isDemo) {
      this.logger.log(
        `\n========================================\n` +
        `📨 [DEMO RESEND EMAIL DISPATCH (โหมดเดโม)]\n` +
        `To: ${toEmail} (${recipientName || 'User'})\n` +
        `Subject: ${subject}\n` +
        `OTP CODE: >>> ${otpCode} <<<\n` +
        `Expires in: 5 minutes\n` +
        `หมายเหตุ: จำลองการส่งสำเร็จสำหรับโหมดเดโมตามเดิม\n` +
        `========================================\n`,
      );
      return { success: true, id: 'demo-mock-dispatch' };
    }

    // In test environment, skip external network call to Resend
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return { success: true, id: 'mock-local-dispatch' };
    }

    const fromAddress =
      process.env.RESEND_FROM?.trim() || 'Jongwen อบต.[บิซ่า] <onboarding@resend.dev>';

    const htmlContent = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>รหัส OTP ยืนยันการลงนามเอกสารราชการ</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; }
    .title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; }
    .subtitle { font-size: 13px; color: #64748b; margin: 0; }
    .greeting { font-size: 14px; margin-bottom: 16px; color: #334155; }
    .otp-box { background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #15803d; font-family: monospace; margin: 0; }
    .otp-timer { font-size: 12px; color: #166534; margin-top: 8px; font-weight: 500; }
    .info { font-size: 13px; line-height: 1.6; color: #475569; background: #f8fafc; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }
    .warning { font-size: 12px; color: #dc2626; margin-top: 16px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="title">องค์การบริหารส่วนตำบล (อบต.)</h1>
      <p class="subtitle">ระบบบริการออนไลน์และลงนามเอกสารอิเล็กทรอนิกส์ (จับจอง - JapJong)</p>
    </div>

    <div class="greeting">
      เรียนคุณ <strong>${recipientName || 'ผู้ลงนาม'}</strong>,
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #334155;">
      มีคำขอรหัส OTP สำหรับยืนยันตัวตนเพื่อลงนามในเอกสารราชการขององค์การบริหารส่วนตำบล โปรดใช้รหัส OTP ด้านล่างนี้เพื่อดำเนินการ:
    </p>

    <div class="otp-box">
      <div class="otp-code">${otpCode}</div>
      <div class="otp-timer">⏱️ รหัสนี้มีอายุการใช้งาน 5 นาที (ใช้ได้ครั้งเดียว)</div>
    </div>

    <div class="info">
      <div>🔒 <strong>การรักษาความปลอดภัย:</strong></div>
      <ul style="margin: 6px 0 0 0; padding-left: 20px;">
        <li>ระบบจำกัดการกรอกผิดพลาดได้ไม่เกิน 5 ครั้ง</li>
        <li>เมื่อยืนยันสำเร็จ คุณจะสามารถลงนามเอกสารในคิวได้ต่อเนื่องโดยไม่ต้องขอ OTP ซ้ำตลอดเซสชัน (30 นาที)</li>
        <li>ห้ามส่งต่อหรือเปิดเผยรหัสนี้แก่ผู้อื่นโดยเด็ดขาด</li>
      </ul>
    </div>

    <div class="warning">
      ⚠️ หากคุณไม่ได้เป็นผู้ทำรายการลงนามเอกสาร กรุณาติดต่อผู้ดูแลระบบ อบต. ทันที
    </div>

    <div class="footer">
      องค์การบริหารส่วนตำบล (อบต.)<br>
      ข้อความนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้
    </div>
  </div>
</body>
</html>
    `.trim();

    const client = this.ensureClient();
    if (client) {
      try {
        const { data, error } = await client.emails.send({
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

    // Demo/Development Fallback (when RESEND_API_KEY is not configured)
    this.logger.log(
      `\n========================================\n` +
      `📨 [DEMO / DEV RESEND EMAIL DISPATCH (NO API KEY)]\n` +
      `To: ${toEmail} (${recipientName || 'User'})\n` +
      `Subject: ${subject}\n` +
      `OTP CODE: >>> ${otpCode} <<<\n` +
      `Expires in: 5 minutes\n` +
      `========================================\n`,
    );

    return { success: true, id: 'mock-local-dispatch' };
  }
}


