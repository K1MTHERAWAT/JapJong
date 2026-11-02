import { Controller, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

@Controller('public')
export class PublicVerifyController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * ตรวจสอบเอกสารผ่าน QR Code Token โดยไม่ต้องเข้าสู่ระบบ
   */
  @Get('verify/:token')
  @Public()
  async verifyDocument(@Param('token') token: string, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.documentsService.verifyPublic(token, ip, userAgent);
  }
}

