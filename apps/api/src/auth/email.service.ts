import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

// โครงสร้างผลลัพธ์การส่งรหัส OTP
export interface SendOtpResult {
  success: boolean;  // สำเร็จหรือไม่ (true/false)
  id?: string;       // รหัสอ้างอิงอีเมลจาก Resend (ถ้าส่งสำเร็จ)
  error?: string;    // ข้อความแจ้งเตือนข้อผิดพลาด (ถ้าส่งไม่สำเร็จ)
}

// ตัวเลือกเสริมสำหรับการส่งรหัส OTP ยืนยันการลงนาม
export interface SendSignOtpOptions {
  isDemo?: boolean;  // กำหนดว่าต้องการบังคับส่งในโหมดเดโม (Mock Dispatch) หรือไม่
}

/**
 * ฟังก์ชันตรวจสอบว่าเป็นอีเมลจำลองของสภาพแวดล้อมทดสอบ/เดโม หรือไม่
 * @param email อีเมลที่ต้องการตรวจสอบ
 * @returns true หากเป็นอีเมลจำลองของระบบ, false หากเป็นอีเมลจริงภายนอก
 */
export function isDemoEmail(email?: string | null): boolean {
  // หากไม่มีอีเมลส่งเข้ามา ให้ถือว่าเป็นจำลองทันที
  if (!email) return false;
  // ตัดช่องว่างหน้าหลังและแปลงเป็นตัวพิมพ์เล็กเพื่อความแม่นยำในการเปรียบเทียบ
  const lower = email.trim().toLowerCase();
  // ตรวจสอบนามสกุลโดเมนตัวอย่างทั้งหมดที่ใช้สำหรับระบบเดโม
  return (
    lower.endsWith('@namcham.go.th') ||  // โดเมน อบต.น้ำชำ จำลองใน Demo
    lower.endsWith('@example.com') ||    // โดเมนตัวอย่าง RFC
    lower.endsWith('@example.org') ||    // โดเมนตัวอย่าง RFC
    lower.endsWith('@test.com') ||       // โดเมนสำหรับทดสอบ
    lower.endsWith('@demo.local') ||     // โดเมนโลคอลเดโม
    lower.endsWith('.local')             // นามสกุลเครือข่ายโลคอลภายใน
  );
}

@Injectable()
export class EmailService {
  // สร้าง Logger สำหรับบันทึกข้อความลง Console/Log ของ NestJS
  private readonly logger = new Logger(EmailService.name);
  // ตัวแปรเก็บ Resend SDK Client instance (ค่าเริ่มต้นเป็น null)
  private resend: Resend | null = null;

  constructor() {
    // กำหนดค่าเริ่มต้นและเชื่อมต่อ Resend Client ทันทีที่ Service ถูกสร้าง
    this.ensureClient();
  }

  /**
   * ฟังก์ชันสร้างและเตรียมความพร้อมของ Resend Client แบบ Singleton
   * หากสร้างไว้แล้วจะคืนค่าเดิมทันที หรือโหลดจาก RESEND_API_KEY ใน Environment
   */
  private ensureClient(): Resend | null {
    // ถ้าเคย Initialize Client ไว้แล้ว ให้คืนค่าตัวเดิมทันที (ไม่ต้องสร้างใหม่)
    if (this.resend) return this.resend;

    // อ่านค่า API Key จาก Environment Variable
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (apiKey) {
      try {
        // สร้าง Resend Client Instance ด้วย API Key
        this.resend = new Resend(apiKey);
        this.logger.log('Resend client initialized successfully.');
      } catch (err) {
        // หากเกิดข้อผิดพลาดในการสร้าง Client ให้บันทึก Error ลง Log
        this.logger.error('Failed to initialize Resend client:', err);
      }
    } else {
      // หากไม่มี API Key ให้แจ้งเตือนว่าระบบจะทำงานในโหมดจำลอง (Console Log)
      this.logger.warn(
        'RESEND_API_KEY is not set. OTP emails will be logged to console in demo/development mode.',
      );
    }

    return this.resend;
  }

  /**
   * ส่งอีเมลรหัส OTP สำหรับยืนยันตัวตนการลงนามเอกสารราชการ
   * @param toEmail อีเมลผู้รับปลายทาง
   * @param otpCode รหัสตัวเลข OTP 6 หลัก
   * @param recipientName ชื่อผู้รับ / ผู้มีอำนาจลงนาม
   * @param options ตัวเลือกเสริม เช่น บังคับโหมดเดโม
   */
  async sendSignOtpEmail(
    toEmail: string,
    otpCode: string,
    recipientName?: string,
    options?: SendSignOtpOptions,
  ): Promise<SendOtpResult> {
    // กำหนดหัวข้ออีเมล (Subject)
    const subject = `รหัส OTP สำหรับยืนยันการลงนามเอกสาร: ${otpCode} (อบต.)`;

    // ตรวจสอบว่าต้องทำงานในโหมดเดโมหรือไม่ (ดูจาก options หรือโดเมนอีเมลจำลอง)
    const isDemo = Boolean(options?.isDemo || isDemoEmail(toEmail));

    // โหมดเดโม: ข้ามการเรียก Resend จริง เพื่อป้องกัน Error 403 จากอีเมลจำลองที่ยังไม่ได้รับอนุญาต
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
      // คืนค่าสำเร็จพร้อมระบุ id เป็น demo-mock-dispatch
      return { success: true, id: 'demo-mock-dispatch' };
    }

    // สภาพแวดล้อม Unit Test (Vitest): ข้ามการยิง Network ออกภายนอกเพื่อความรวดเร็วและไม่ใช้โควต้า
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return { success: true, id: 'mock-local-dispatch' };
    }

    // กำหนดชื่อและอีเมลผู้ส่ง (ดึงจาก RESEND_FROM หรือใช้ค่ามาตรฐาน onboarding@resend.dev)
    const fromAddress =
      process.env.RESEND_FROM?.trim() || 'Jongwen อบต.[บิซ่า] <onboarding@resend.dev>';

    // เทมเพลตเนื้อหาอีเมล HTML แบบทางการ สวยงาม อ่านง่ายบนมือถือและคอมพิวเตอร์
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

    // ดึง instance ของ Resend Client
    const client = this.ensureClient();
    if (client) {
      try {
        // ยิงคำขอส่งอีเมลผ่าน Resend API ไปยังเซิร์ฟเวอร์จริง
        const { data, error } = await client.emails.send({
          from: fromAddress,
          to: [toEmail],
          subject,
          html: htmlContent,
        });

        // หากทาง Resend API ตอบกลับ Error กลับมา
        if (error) {
          this.logger.error(`Resend API Error sending to ${toEmail}:`, error);
          return { success: false, error: error.message };
        }

        // หากส่งสำเร็จ บันทึก log หมายเลขอ้างอิง และคืนค่าสำเร็จ
        this.logger.log(`Resend email delivered successfully to ${toEmail} (ID: ${data?.id})`);
        return { success: true, id: data?.id };
      } catch (err: unknown) {
        // จัดการกรณีเกิด Network Exception ในระหว่างเรียก API
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to dispatch email via Resend to ${toEmail}:`, err);
        return { success: false, error: msg };
      }
    }

    // กรณีไม่มีการตั้งค่า RESEND_API_KEY ให้แสดง OTP ลงใน Console Log แทน
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



