import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PublicVerifyController } from './public-verify.controller';
import { StaffVerifyController } from './staff-verify.controller';

@Module({
  controllers: [
    DocumentsController,
    PublicVerifyController,
    StaffVerifyController,
  ],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

