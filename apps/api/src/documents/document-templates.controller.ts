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

/**
 * Controller บริหารจัดการเทมเพลตเอกสารราชการอิเล็กทรอนิกส์ (Document Templates)
 * รองรับการสร้าง, แก้ไข, ทำสำเนา, เผยแพร่, จัดเก็บถาวร, ติดตามประวัติเวอร์ชัน และการย้อนกลับเวอร์ชัน (Rollback)
 */
@ApiTags('Document Templates')
@ApiBearerAuth('bearer')
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(private readonly db: DbService) {}

  /**
   * ดึงรายการเทมเพลตเอกสารราชการทั้งหมด (กรองตามหมวดหมู่, สถานะ, หรือคำค้นหา)
   * GET /document-templates
   */
  @Get()
  @Roles('ADMIN', 'STAFF', 'APPROVER_L2', 'APPROVER_L1')
  listTemplates(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.db.listDocumentTemplates({ category, status, search });
  }

  /**
   * ดึงข้อมูลเทมเพลตเอกสารรายฉบับตาม ID
   * GET /document-templates/:id
   */
  @Get(':id')
  @Roles('ADMIN', 'STAFF', 'APPROVER_L2', 'APPROVER_L1')
  getTemplate(@Param('id') id: string) {
    return this.db.getDocumentTemplateById(id);
  }

  /**
   * สร้างเทมเพลตเอกสารราชการใหม่ (เฉพาะ ADMIN)
   * POST /document-templates
   */
  @Post()
  @Roles('ADMIN')
  createTemplate(
    @Body() body: { name: string; category?: DocumentTemplateCategory; description?: string; structure?: any; settings?: any },
    @CurrentUser() user: Account,
  ) {
    return this.db.createDocumentTemplate(body, user);
  }

  /**
   * แก้ไขโครงสร้างหรือการตั้งค่าเทมเพลตเอกสาร (เฉพาะ ADMIN)
   * PATCH /document-templates/:id
   */
  @Patch(':id')
  @Roles('ADMIN')
  updateTemplate(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: Account,
  ) {
    return this.db.updateDocumentTemplate(id, body, user);
  }

  /**
   * ลบเทมเพลตเอกสารออกจากระบบ (เฉพาะ ADMIN)
   * DELETE /document-templates/:id
   */
  @Delete(':id')
  @Roles('ADMIN')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: Account) {
    return this.db.deleteDocumentTemplate(id, user);
  }

  /**
   * ทำสำเนา (Duplicate) เทมเพลตเอกสาร (เฉพาะ ADMIN)
   * POST /document-templates/:id/duplicate
   */
  @Post(':id/duplicate')
  @Roles('ADMIN')
  duplicateTemplate(@Param('id') id: string, @CurrentUser() user: Account) {
    return this.db.duplicateDocumentTemplate(id, user);
  }

  /**
   * เผยแพร่ (Publish) เทมเพลตเอกสารเพื่อเปิดให้ใช้งานจริง (เฉพาะ ADMIN)
   * POST /document-templates/:id/publish
   */
  @Post(':id/publish')
  @Roles('ADMIN')
  publishTemplate(
    @Param('id') id: string,
    @Body('note') note: string | undefined,
    @CurrentUser() user: Account,
  ) {
    return this.db.publishDocumentTemplate(id, note, user);
  }

  /**
   * จัดเก็บเทมเพลตเข้าคลังเอกสารประวัติ (Archive) เมื่อยกเลิกใช้งาน (เฉพาะ ADMIN)
   * POST /document-templates/:id/archive
   */
  @Post(':id/archive')
  @Roles('ADMIN')
  archiveTemplate(@Param('id') id: string, @CurrentUser() user: Account) {
    return this.db.archiveDocumentTemplate(id, user);
  }

  /**
   * ดึงประวัติเวอร์ชันทั้งหมดของเทมเพลตเอกสาร
   * GET /document-templates/:id/versions
   */
  @Get(':id/versions')
  @Roles('ADMIN', 'STAFF')
  listVersions(@Param('id') id: string) {
    return this.db.listTemplateVersions(id);
  }

  /**
   * ดึงรายละเอียดของเทมเพลตเอกสารในเวอร์ชันที่ระบุ
   * GET /document-templates/:id/versions/:version
   */
  @Get(':id/versions/:version')
  @Roles('ADMIN', 'STAFF')
  getVersion(@Param('id') id: string, @Param('version') version: string) {
    return this.db.getTemplateVersion(id, parseInt(version, 10));
  }

  /**
   * ย้อนกลับเทมเพลตไปยังเวอร์ชันก่อนหน้า (Rollback Version) (เฉพาะ ADMIN)
   * POST /document-templates/:id/versions/:version/rollback
   */
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
