import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTemplatesController } from './document-templates.controller';
import { PublicVerifyController } from './public-verify.controller';
import { StaffVerifyController } from './staff-verify.controller';

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

