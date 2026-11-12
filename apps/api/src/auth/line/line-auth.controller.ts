import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { Account } from '@japjong/shared';
import { CurrentUser, Public } from '../auth.guard';
import { DbService } from '../../db/db.service';
import { LineAuthService } from './line-auth.service';
import {
  LineCallbackQueryDto,
  LineLiffAuthDto,
  LineRegisterDto,
  LineRegistrationStatusQueryDto,
} from './line-auth.dto';

/**
 * Controller จัดการการเข้าสู่ระบบและเชื่อมต่อบัญชีผ่าน LINE Login & LIFF (LINE Front-end Framework)
 */
@ApiTags('Authentication')
@Controller('auth/line')
export class LineAuthController {
  constructor(
    private readonly lineAuthService: LineAuthService,
    private readonly db: DbService,
  ) {}

  /**
   * เริ่มต้นกระบวนการ LINE OAuth Login (Redirect ผู้ใช้ไปยังหน้ายินยอมของ LINE)
   * GET /auth/line
   */
  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Public()
  @Get()
  initiateLineLogin(
    @Query('redirect') redirectQuery: string | undefined,
    @Query('linkUserId') linkUserId: string | undefined,
    @Res() res: Response,
  ) {
    // สร้าง OAuth URL พร้อมค่า State เพื่อป้องกัน CSRF
    const { url, state } = this.lineAuthService.generateAuthUrl(linkUserId);

    // หากระบุ redirect=false ให้ส่งกลับเป็น JSON แทนการ Redirect (สำหรับ Mobile/SPA)
    if (redirectQuery === 'false') {
      return res.status(200).json({ url, state });
    }

    // ทำการ Redirect เบราว์เซอร์ไปยัง URL เข้าสู่ระบบของ LINE
    return res.redirect(url);
  }

  /**
   * สร้าง LINE OAuth URL สำหรับเชื่อมต่อบัญชี LINE เข้ากับบัญชีผู้ใช้ปัจจุบันที่ล็อกอินอยู่
   * GET /auth/line/link-url
   */
  @Get('link-url')
  getLinkUrl(@CurrentUser() user: Account) {
    return this.lineAuthService.generateAuthUrl(user.id);
  }

  /**
   * ยกเลิกการเชื่อมต่อบัญชี LINE ออกจากบัญชีผู้ใช้ปัจจุบัน
   * POST /auth/line/unlink
   */
  @Post('unlink')
  async unlinkLine(@CurrentUser() user: Account) {
    await this.db.unlinkLineAccount(user.id);
    return { ok: true };
  }

  /**
   * Endpoint รับผลลัพธ์ Callback จาก LINE OAuth2 Server หลังผู้ใช้เข้าสู่ระบบ
   * GET /auth/line/callback
   */
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Public()
  @Get('callback')
  async lineCallback(
    @Query() query: LineCallbackQueryDto,
    @Res() res: Response,
  ) {
    // ประมวลผลรหัส Authorization Code หรือข้อผิดพลาดที่ได้รับกลับมา
    const result = await this.lineAuthService.handleCallback(
      query.code,
      query.state,
      query.error,
      query.error_description,
    );

    // ทำการ Redirect ผู้ใช้กลับไปยังหน้าที่เหมาะสมของ Web Frontend พร้อม Token หรือ Ticket
    return res.redirect(result.redirectUrl);
  }

  /**
   * ตรวจสอบสถานะตั๋วการลงทะเบียนชั่วคราว (Registration Ticket)
   * GET /auth/line/registration-status
   */
  @Public()
  @Get('registration-status')
  getRegistrationStatus(@Query() query: LineRegistrationStatusQueryDto) {
    return this.lineAuthService.getRegistrationStatus(query.ticket);
  }

  /**
   * ลงทะเบียนผู้ใช้ใหม่ครั้งแรกผ่าน LINE พร้อมรับข้อตกลง PDPA
   * POST /auth/line/register
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('register')
  async register(@Body() body: LineRegisterDto) {
    return this.lineAuthService.registerFirstTimeUser(body);
  }

  /**
   * ยืนยันตัวตนผู้ใช้ผ่าน LINE Front-end Framework (LIFF ID Token)
   * POST /auth/line/liff
   */
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Public()
  @Post('liff')
  async authenticateLiff(@Body() body: LineLiffAuthDto) {
    return this.lineAuthService.authenticateLiffUser(body.idToken);
  }

  /**
   * ดึงค่าการตั้งค่า LIFF สาธารณะ (LIFF ID และการตั้งค่าพื้นฐาน) สำหรับ Client
   * GET /auth/line/liff/config
   */
  @Public()
  @Get('liff/config')
  getLiffConfig() {
    return this.lineAuthService.getLiffConfig();
  }

  /**
   * ดึงข้อมูลโปรไฟล์ผู้ใช้งานและข้อมูล LINE ที่เชื่อมต่อผ่านเซสชัน LIFF
   * GET /auth/line/liff/profile
   */
  @Get('liff/profile')
  async getLiffProfile(@CurrentUser() user: Account) {
    const status = await this.lineAuthService.getStatus(user.id);
    return {
      account: this.db.toPublic(user),
      lineAccount: status.lineAccount,
    };
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อบัญชี LINE ของผู้ใช้งานปัจจุบัน
   * GET /auth/line/status
   */
  @Get('status')
  async getStatus(@CurrentUser() user: Account) {
    return this.lineAuthService.getStatus(user.id);
  }

  /**
   * ออกจากระบบเซสชัน LINE
   * POST /auth/line/logout
   */
  @Post('logout')
  async logout(@Req() req: Request & { token?: string }) {
    if (req.token) {
      await this.db.revokeSession(req.token);
    }
    return { ok: true };
  }
}
