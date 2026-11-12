import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTemplatesController } from './document-templates.controller';
import { PublicVerifyController } from './public-verify.controller';
import { StaffVerifyController } from './staff-verify.controller';

/**
 * DocumentsModule: โมดูลบริหารจัดการระบบเอกสารราชการอิเล็กทรอนิกส์ (e-Document Engine)
 * ครอบคลุม: การออกใบอนุญาต, เทมเพลตเอกสารราชการ, การตรวจสอบเอกสารดิจิทัลสาธารณะ และการตรวจโดยเจ้าหน้าที่ผ่าน QR Code
 */
@Module({
  controllers: [
    DocumentsController,
    DocumentTemplatesController,
    PublicVerifyController,
    StaffVerifyController,
  ],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
