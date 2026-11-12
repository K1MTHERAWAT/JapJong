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

/**
 * Controller บริหารจัดการเอกสารราชการอิเล็กทรอนิกส์ (Generated Documents)
 * ให้บริการสร้างเอกสารจากแม่แบบ, ดึงรายละเอียด, สร้าง QR Code ตรวจสอบความถูกต้อง, และการเพิกถอนเอกสาร
 */
@ApiTags('Documents')
@ApiBearerAuth('bearer')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly db: DbService,
  ) {}

  /**
   * ดึงรายการเอกสารราชการที่สร้างขึ้นทั้งหมด (กรองตาม requestId หรือคำค้นหา)
   * GET /documents
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
   * สร้างเอกสารราชการฉบับใหม่จากแม่แบบ (Template Engine)
   * POST /documents/generate
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
   * ดึงรายละเอียดเอกสารราชการรายฉบับ
   * GET /documents/:id
   */
  @Get(':id')
  @Roles('USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN')
  async getDocument(@Param('id') id: string) {
    return this.db.getGeneratedDocumentById(id);
  }

  /**
   * สร้างหรือดึงข้อมูลการยืนยันเอกสารและรูปภาพ QR Code (Digital Verification & QR Engine)
   * POST /documents/:id/verification
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
   * ดึงข้อมูลการยืนยันเอกสารพร้อมภาพ QR Code (Public สำหรับให้ผู้เกี่ยวข้องตรวจสอบ)
   * GET /documents/:id/verification
   */
  @Get(':id/verification')
  @Public()
  async getVerification(@Param('id') id: string) {
    return this.documentsService.getVerificationByDocumentId(id);
  }

  /**
   * ยกเลิกหรือเพิกถอนความถูกต้องของเอกสารราชการ (Revoke Verification)
   * POST /documents/:id/revoke
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
