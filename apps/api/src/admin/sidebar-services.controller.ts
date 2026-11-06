import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  Account,
  CreateSidebarServiceDto,
  Role,
  SidebarServiceItem,
  UpdateSidebarServiceDto,
} from '@japjong/shared';
import { CurrentUser, Permissions, Public, Roles, extractToken } from '../auth/auth.guard';
import { DbService } from '../db/db.service';

@ApiTags('Admin Services & Navigation')
@Controller()
export class SidebarServicesController {
  constructor(private readonly db: DbService) {}

  /**
   * ดึงรายการเมนู Navigation สำหรับแสดงผลใน Sidebar ของผู้ใช้ปัจจุบัน
   * (Public/Auth-aware: หากยังไม่ล็อกอินจะคืนเฉพาะเมนูสำหรับบุคคลทั่วไป)
   */
  @Public()
  @Get('navigation')
  async getNavigation(@Req() req: Request): Promise<SidebarServiceItem[]> {
    const token = extractToken(req.headers['authorization']);
    let user: Account | null = null;
    if (token) {
      const session = await this.db.getSession(token);
      if (session) {
        user = this.db.accounts.find((a) => a.id === session.accountId && a.active !== false) ?? null;
      }
    }
    return this.db.getSidebarServicesForUser(user);
  }

  /**
   * แอดมิน: แสดงรายการบริการและเมนูทั้งหมดในระบบ พร้อมสิทธิ์และสถานะ
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Get('admin/services')
  listAllServices(): SidebarServiceItem[] {
    return this.db.listSidebarServices();
  }

  /**
   * แอดมิน: พรีวิว Sidebar ตาม Role เพื่อตรวจสอบการแสดงผลก่อนบันทึก
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Get('admin/services/preview')
  previewServicesForRole(@Query('role') role?: Role): SidebarServiceItem[] {
    const targetRole = role || 'USER';
    const mockAccount: Partial<Account> = {
      id: `preview-${targetRole.toLowerCase()}`,
      role: targetRole,
    };
    return this.db.getSidebarServicesForUser(mockAccount as Account);
  }

  /**
   * แอดมิน: ตรวจสอบความสัมพันธ์ก่อนลบบริการ (คำขอ, สถานที่, อุปกรณ์, ความปลอดภัยระบบ)
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Get('admin/services/:id/check-delete')
  async checkServiceRelations(@Param('id') id: string) {
    return this.db.checkServiceRelations(id);
  }

  /**
   * แอดมิน: ดึงข้อมูลรายละเอียดของบริการ
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Get('admin/services/:id')
  getService(@Param('id') id: string): SidebarServiceItem {
    const item = this.db.getSidebarServiceById(id);
    if (!item) throw new NotFoundException('ไม่พบบริการที่ต้องการ');
    return item;
  }

  /**
   * แอดมิน: เพิ่มบริการหรือเมนูใหม่
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Post('admin/services')
  async createService(
    @CurrentUser() actor: Account,
    @Body() body: CreateSidebarServiceDto,
  ): Promise<SidebarServiceItem> {
    if (!body.label?.trim()) throw new BadRequestException('กรุณาระบุชื่อบริการ');
    if (!body.href?.trim()) throw new BadRequestException('กรุณาระบุ URL หรือ Route');
    if (!body.roles || !Array.isArray(body.roles) || body.roles.length === 0) {
      throw new BadRequestException('กรุณากำหนดบทบาท (Role) ที่สามารถเข้าถึงบริการนี้ได้อย่างน้อย 1 บทบาท');
    }
    return this.db.createSidebarService(body, actor);
  }

  /**
   * แอดมิน: แก้ไขข้อมูลบริการ สิทธิ์ และสถานะ
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Put('admin/services/:id')
  async updateService(
    @CurrentUser() actor: Account,
    @Param('id') id: string,
    @Body() body: UpdateSidebarServiceDto,
  ): Promise<SidebarServiceItem> {
    return this.db.updateSidebarService(id, body, actor);
  }

  /**
   * แอดมิน: สลับสถานะเปิด–ปิดการใช้งานบริการอย่างรวดเร็ว
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Patch('admin/services/:id/toggle')
  async toggleService(
    @CurrentUser() actor: Account,
    @Param('id') id: string,
  ): Promise<SidebarServiceItem> {
    return this.db.toggleSidebarService(id, actor);
  }

  /**
   * แอดมิน: จัดเรียงลำดับเมนู (Drag & Drop) และจัดหมวดหมู่
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Patch('admin/services/reorder')
  async reorderServices(
    @CurrentUser() actor: Account,
    @Body() body: { items: { id: string; sortOrder: number; category?: string }[] },
  ): Promise<{ success: boolean; count: number }> {
    if (!body.items || !Array.isArray(body.items)) {
      throw new BadRequestException('ข้อมูลรายการจัดเรียงไม่ถูกต้อง');
    }
    await this.db.reorderSidebarServices(body.items, actor);
    return { success: true, count: body.items.length };
  }

  /**
   * แอดมิน: ลบบริการที่ไม่ต้องการ (ตรวจสอบความสัมพันธ์และสิทธิ์ความปลอดภัย)
   */
  @ApiBearerAuth('bearer')
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Delete('admin/services/:id')
  async deleteService(
    @CurrentUser() actor: Account,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.db.deleteSidebarService(id, actor);
    return { success: true, message: 'ลบบริการเรียบร้อยแล้ว' };
  }
}

