import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Account } from '@jongwen/shared';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

@Controller('staff/documents')
@Roles('STAFF', 'ADMIN')
export class StaffVerifyController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * เรียกดูประวัติการตรวจสอบของเจ้าหน้าที่
   */
  @Get('verify-history')
  getVerifyHistory(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.documentsService.getVerifyHistory(isNaN(lim) ? 50 : lim);
  }

  /**
   * ตรวจสอบเอกสารด้วย QR Code หรือรหัสเอกสารสำหรับเจ้าหน้าที่
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

