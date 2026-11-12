import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Account } from '@japjong/shared';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

/**
 * Controller สำหรับเจ้าหน้าที่ (STAFF, ADMIN) ในการตรวจสอบเอกสารดิจิทัล
 * และเรียกดูประวัติบันทึกการตรวจสอบสแกนเอกสารราชการทั้งหมด
 */
@Controller('staff/documents')
@Roles('STAFF', 'ADMIN')
export class StaffVerifyController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * ดึงประวัติการตรวจสอบเอกสารราชการของเจ้าหน้าที่
   * GET /staff/documents/verify-history
   */
  @Get('verify-history')
  getVerifyHistory(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.documentsService.getVerifyHistory(isNaN(lim) ? 50 : lim);
  }

  /**
   * ตรวจสอบเอกสารราชการด้วย QR Code หรือรหัสเอกสารโดยเจ้าหน้าที่ (บันทึก Audit Trail ของผู้ตรวจ)
   * POST /staff/documents/verify
   */
  @Post('verify')
  async verifyDocument(
    @Body('query') query: string,
    @CurrentUser() user: Account,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.documentsService.verifyStaff(query, user, ip, userAgent);
  }
}
