import { Controller, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

/**
 * Controller สำหรับให้บริการตรวจสอบเอกสารดิจิทัลสาธารณะผ่าน QR Code (Public Verification Endpoint)
 * ประชาชนหรือบุคคลภายนอกสามารถสแกน QR Code ตรวจสอบความถูกต้องแท้จริงของเอกสารได้ทันทีโดยไม่ต้องเข้าสู่ระบบ
 */
@Controller('public')
export class PublicVerifyController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * ตรวจสอบความถูกต้องแท้จริงของเอกสารราชการผ่าน Verification Token (Public)
   * GET /public/verify/:token
   */
  @Get('verify/:token')
  @Public()
  async verifyDocument(@Param('token') token: string, @Req() req: Request) {
    // ดึง IP address ของผู้ตรวจสอบ (รองรับกรณีอยู่หลัง Reverse Proxy)
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    // ดึง User Agent ของเบราว์เซอร์ผู้สแกน
    const userAgent = req.headers['user-agent'];
    // ตรวจสอบเอกสารและบันทึกประวัติการสแกนแบบสาธารณะ
    return this.documentsService.verifyPublic(token, ip, userAgent);
  }
}
