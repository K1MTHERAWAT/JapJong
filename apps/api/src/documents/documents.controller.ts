import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Account, VerificationDocumentType } from '@jongwen/shared';
import { CurrentUser, Public, Roles } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * สร้างหรือดึงข้อมูลยืนยันเอกสารและ QR Code
   */
  @Post(':id/verification')
  @Roles('USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN')
  async createVerification(
    @Param('id') id: string,
    @Body()
    body?: {
      documentType?: VerificationDocumentType;
      title?: string;
      forceNew?: boolean;
    },
  ) {
    return this.documentsService.createOrGetVerification(id, body);
  }

  /**
   * ดึงข้อมูลการยืนยันเอกสารพร้อม QR Code
   */
  @Get(':id/verification')
  @Public()
  async getVerification(@Param('id') id: string) {
    return this.documentsService.getVerificationByDocumentId(id);
  }

  /**
   * ยกเลิกการยืนยันเอกสาร
   */
  @Post(':id/revoke')
  @Roles('STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN')
  async revokeVerification(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: Account,
  ) {
    return this.documentsService.revokeVerification(id, reason, user);
  }
}

