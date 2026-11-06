import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Account, DocumentTemplateCategory } from '@japjong/shared';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { DbService } from '../db/db.service';

@ApiTags('Document Templates')
@ApiBearerAuth('bearer')
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Roles('ADMIN', 'STAFF', 'APPROVER_L2', 'APPROVER_L1')
  listTemplates(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.db.listDocumentTemplates({ category, status, search });
  }

  @Get(':id')
  @Roles('ADMIN', 'STAFF', 'APPROVER_L2', 'APPROVER_L1')
  getTemplate(@Param('id') id: string) {
    return this.db.getDocumentTemplateById(id);
  }

  @Post()
  @Roles('ADMIN')
  createTemplate(
    @Body() body: { name: string; category?: DocumentTemplateCategory; description?: string; structure?: any; settings?: any },
    @CurrentUser() user: Account,
  ) {
    return this.db.createDocumentTemplate(body, user);
  }

  @Patch(':id')
  @Roles('ADMIN')
  updateTemplate(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: Account,
  ) {
    return this.db.updateDocumentTemplate(id, body, user);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: Account) {
    return this.db.deleteDocumentTemplate(id, user);
  }

  @Post(':id/duplicate')
  @Roles('ADMIN')
  duplicateTemplate(@Param('id') id: string, @CurrentUser() user: Account) {
    return this.db.duplicateDocumentTemplate(id, user);
  }

  @Post(':id/publish')
  @Roles('ADMIN')
  publishTemplate(
    @Param('id') id: string,
    @Body('note') note: string | undefined,
    @CurrentUser() user: Account,
  ) {
    return this.db.publishDocumentTemplate(id, note, user);
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  archiveTemplate(@Param('id') id: string, @CurrentUser() user: Account) {
    return this.db.archiveDocumentTemplate(id, user);
  }

  @Get(':id/versions')
  @Roles('ADMIN', 'STAFF')
  listVersions(@Param('id') id: string) {
    return this.db.listTemplateVersions(id);
  }

  @Get(':id/versions/:version')
  @Roles('ADMIN', 'STAFF')
  getVersion(@Param('id') id: string, @Param('version') version: string) {
    return this.db.getTemplateVersion(id, parseInt(version, 10));
  }

  @Post(':id/versions/:version/rollback')
  @Roles('ADMIN')
  rollbackVersion(
    @Param('id') id: string,
    @Param('version') version: string,
    @CurrentUser() user: Account,
  ) {
    return this.db.rollbackTemplateVersion(id, parseInt(version, 10), user);
  }
}
