import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Account, VerificationDocumentType } from '@japjong/shared';
import { CurrentUser, Public, Roles } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';
import { DbService } from '../db/db.service';

@ApiTags('Documents')
@ApiBearerAuth('bearer')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly db: DbService,
  ) {}

  /**
   * รายการเอกสารที่สร้างขึ้นทั้งหมด
   */
  @Get()
  @Roles('USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN')
  async listDocuments(
    @Query('requestId') requestId?: string,
    @Query('search') search?: string,
  ) {
    return this.db.listGeneratedDocuments({ requestId, search });
  }

  /**
   * สร้างเอกสารใหม่จากแม่แบบ (Template)
   */
  @Post('generate')
  @Roles('USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN')
  async generateDocument(
    @Body() body: { templateId: string; requestId: string; documentNumber?: string },
    @CurrentUser() user: Account,
  ) {
    return this.db.createGeneratedDocument(body, user);
  }

  /**
   * ดูรายละเอียดเอกสาร
   */
  @Get(':id')
  @Roles('USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN')
  async getDocument(@Param('id') id: string) {
    return this.db.getGeneratedDocumentById(id);
  }

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

