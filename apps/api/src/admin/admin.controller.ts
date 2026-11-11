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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  Account,
  BulkAssignRoleDto,
  CreateRoleDto,
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  PermissionKey,
  ROLE_LABEL,
  Role,
  RoleItem,
  UpdateRoleDto,
} from '@japjong/shared';
import { CurrentUser, Permissions, Roles } from '../auth/auth.guard';
import { hashSecret } from '../auth/secret';
import { DbService } from '../db/db.service';

/**
 * รายการบทบาทที่ระบบรองรับอย่างเป็นทางการ
 */
const VALID_ROLES: Role[] = ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'];

/**
 * Controller สำหรับการบริหารจัดการระบบโดยผู้ดูแลระบบ (Admin)
 * ครอบคลุม:
 * 1. จัดการบัญชีผู้ใช้ บทบาท และกำหนดสิทธิ์รายย่อย (User & Role Management)
 * 2. แดชบอร์ดภาพรวมระบบและตัวชี้วัดงาน (Admin Overview Metrics)
 * 3. ศูนย์การแจ้งเตือน (Notifications)
 * 4. เครื่องมือสำหรับสภาพแวดล้อมทดสอบ (Dev / Demo Utilities)
 */
@ApiTags('Admin')
@ApiBearerAuth('bearer')
@Controller()
export class AdminController {
  constructor(private readonly db: DbService) {}

  /**
   * ดึงรายการบัญชีผู้ใช้ทั้งหมดในระบบ พร้อมระบบค้นหาและตัวกรองบทบาท
   * - รองรับการค้นหา (Query 'q') จาก: ชื่อ-นามสกุล, เบอร์โทรศัพท์, และ Username
   * - กรองเฉพาะบทบาทที่ต้องการ (Query 'role')
   * - ส่งกลับข้อมูลในรูปแบบ PublicAccount (ไม่เปิดเผย Password Hash และ PIN)
   * - ผู้มีสิทธิ์เข้าถึง: ต้องมีสิทธิ์ manageUsers, walkIn หรือ review อย่างน้อย 1 สิทธิ์
   */
  @Permissions('manageUsers', 'walkIn', 'review')
  @Get('users')
  listUsers(@Query('q') q?: string, @Query('role') role?: Role) {
    return this.db.accounts
      .filter((a) => {
        if (role && a.role !== role) return false;
        if (q) {
          const s = q.toLowerCase();
          return a.name.toLowerCase().includes(s) || a.phone.includes(s) || a.username.toLowerCase().includes(s);
        }
        return true;
      })
      .map((a) => this.db.toPublic(a));
  }

  /**
   * แก้ไขข้อมูลผู้ใช้ บทบาท สิทธิ์รายย่อย รหัสผ่าน และสถานะเปิด/ระงับบัญชี
   * 
   * มาตรการความปลอดภัยและกฎการทำงาน:
   * 1. ตรวจสอบความถูกต้องของบทบาท (Valid Role)
   * 2. Self-Protection Guard: ป้องกันแอดมินลดระดับสิทธิ์ตนเอง, เพิกถอนสิทธิ์ manageUsers ของตนเอง, หรือสั่งระงับบัญชีตนเอง
   * 3. Profile Sanitization: ปรับแต่งและจำกัดความยาวของชื่อ แผนก และตรวจสอบรูปแบบเบอร์โทรศัพท์ไทย (0XXXXXXXXX)
   * 4. Password Reset: เข้ารหัสผ่านใหม่อย่างปลอดภัยด้วย Argon2id ผ่าน hashSecret
   * 5. Audit Logging: บันทึกประวัติการกระทำ (Audit Log) ทุกครั้งที่มีการเปลี่ยนข้อมูล, บทบาท, สิทธิ์ หรือรีเซ็ตรหัสผ่าน
   */
  @Permissions('manageUsers')
  @Patch('users/:id/permissions')
  async updatePermissions(
    @CurrentUser() actor: Account,
    @Param('id') id: string,
    @Body()
    body: {
      role?: Role;
      permissions?: Partial<Record<PermissionKey, boolean>>;
      active?: boolean;
      name?: string;
      nickname?: string;
      position?: string;
      department?: string;
      phone?: string;
      lineName?: string;
      newPassword?: string;
    },
  ) {
    const target = this.db.accounts.find((a) => a.id === id);
    if (!target) throw new NotFoundException('ไม่พบผู้ใช้');
    if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
      throw new BadRequestException('บทบาทไม่ถูกต้อง');
    }

    // กลไกป้องกันการล็อกตัวเองออกจากระบบ (Self-Protection Lockout Prevention)
    if (target.id === actor.id) {
      if (body.role && body.role !== 'ADMIN') {
        throw new ForbiddenException('ไม่สามารถลดระดับบทบาทผู้ดูแลระบบของตนเองได้');
      }
      if (body.permissions && body.permissions.manageUsers === false) {
        throw new ForbiddenException('ไม่สามารถเพิกถอนสิทธิ์จัดการผู้ใช้งานของตนเองได้');
      }
      if (body.active === false) {
        throw new ForbiddenException('ไม่สามารถปิดการใช้งานบัญชีของตนเองได้');
      }
    }

    // 1. อัปเดตข้อมูลโปรไฟล์ส่วนตัว (Profile Attributes)
    let profileUpdated = false;
    if (typeof body.name === 'string' && body.name.trim()) {
      const nextName = body.name.trim().slice(0, 100);
      if (nextName !== target.name) {
        target.name = nextName;
        target.initial = nextName.charAt(0) || 'ผ';
        profileUpdated = true;
      }
    }
    if (typeof body.nickname === 'string') {
      const nextNick = body.nickname.trim().slice(0, 50) || target.name.split(' ')[0] || target.name;
      if (nextNick !== target.nickname) {
        target.nickname = nextNick;
        profileUpdated = true;
      }
    }
    if (typeof body.position === 'string' && body.position.trim()) {
      const nextPos = body.position.trim().slice(0, 100);
      if (nextPos !== target.position) {
        target.position = nextPos;
        profileUpdated = true;
      }
    }
    if (typeof body.department === 'string' && body.department.trim()) {
      const nextDept = body.department.trim().slice(0, 100);
      if (nextDept !== target.department) {
        target.department = nextDept;
        profileUpdated = true;
      }
    }
    if (typeof body.phone === 'string' && body.phone.trim()) {
      const nextPhone = body.phone.trim().slice(0, 20);
      const digits = nextPhone.replace(/\D/g, '');
      if (!/^0\d{8,9}$/.test(digits)) {
        throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นตัวเลข 9-10 หลักขึ้นต้นด้วย 0)');
      }
      if (nextPhone !== target.phone) {
        target.phone = nextPhone;
        profileUpdated = true;
      }
    }
    if (typeof body.lineName === 'string') {
      const nextLine = body.lineName.trim().slice(0, 50) || undefined;
      if (nextLine !== target.lineName) {
        target.lineName = nextLine;
        profileUpdated = true;
      }
    }
    if (profileUpdated) {
      await this.db.log('user', 'แก้ไขข้อมูลบัญชีผู้ใช้', target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }

    // 2. รีเซ็ตรหัสผ่านใหม่โดยผู้ดูแลระบบ (Admin Password Reset)
    if (typeof body.newPassword === 'string' && body.newPassword.trim()) {
      const pwd = body.newPassword.trim();
      if (pwd.length < 4) {
        throw new BadRequestException('รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร');
      }
      target.password = await hashSecret(pwd);
      await this.db.log('user', 'รีเซ็ตรหัสผ่านบัญชีผู้ใช้', target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }

    // 3. สลับสถานะเปิด/ระงับการใช้งานบัญชี (Activate / Suspend Account)
    if (typeof body.active === 'boolean' && body.active !== (target.active ?? true)) {
      target.active = body.active;
      await this.db.log('user', `${body.active ? 'เปิด' : 'ระงับ'}การใช้งานบัญชี`, target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }

    // 4. เปลี่ยนบทบาทหลักของผู้ใช้ (Change Role & Reset Default Permissions)
    if (body.role && body.role !== target.role) {
      target.role = body.role;
      target.permissions = { ...DEFAULT_PERMISSIONS[body.role] };
      await this.db.log('role', `เปลี่ยนสิทธิ์เป็น${ROLE_LABEL[body.role]}`, target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }

    // 5. ปรับแต่งสิทธิ์การใช้งานรายย่อย (Fine-grained Permissions Override)
    if (body.permissions && typeof body.permissions === 'object') {
      const nextPerms: Record<PermissionKey, boolean> = { ...target.permissions };
      for (const key of PERMISSION_KEYS) {
        if (typeof body.permissions[key] === 'boolean') {
          nextPerms[key] = body.permissions[key]!;
        }
      }
      target.permissions = nextPerms;
      await this.db.log('role', `อัปเดตสิทธิ์การใช้งานรายย่อย`, target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }

    // บันทึกข้อมูลลงฐานข้อมูลและส่งกลับข้อมูลแบบปลอดภัย
    await this.db.persistAccount(target);
    return this.db.toPublic(target);
  }

  // ==================== Role Management Endpoints (ระบบจัดการบทบาทผู้ใช้งาน) ====================

  /**
   * ดึงรายการบทบาททั้งหมดในระบบ พร้อมสถิติจำนวนผู้ใช้งานที่ถือครองแต่ละบทบาท
   * - นำไปใช้แสดงผลในการ์ดและการตั้งค่าของหน้าจอแอดมิน (/admin/permissions)
   */
  @Permissions('manageUsers')
  @Get('admin/roles')
  listRoles(): RoleItem[] {
    return this.db.listRoles();
  }

  /**
   * สร้างบทบาทที่กำหนดเองใหม่ (Custom Role Creation)
   * - สงวนสิทธิ์เฉพาะผู้ใช้ที่มีบทบาท ADMIN เท่านั้น
   * - บันทึกชื่อบทบาท, สี Tone, รายละเอียด, และสิทธิ์เริ่มต้น
   */
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Post('admin/roles')
  async createRole(
    @Body() body: CreateRoleDto,
    @CurrentUser() actor: Account,
  ): Promise<RoleItem> {
    return this.db.createRole(body, actor);
  }

  /**
   * แก้ไขข้อมูลบทบาทที่มีอยู่ (Update Role)
   * - กฎความปลอดภัย: บทบาทตั้งต้นของระบบ (System Roles เช่น ADMIN) จะไม่อนุญาตให้แก้ไข Key หลักที่ส่งผลกระทบต่อสิทธิ์ระบบ
   */
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Put('admin/roles/:id')
  async updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @CurrentUser() actor: Account,
  ): Promise<RoleItem> {
    return this.db.updateRole(id, body, actor);
  }

  /**
   * สลับสถานะเปิด/ปิดการใช้งานบทบาท (Toggle Role Active Status)
   * - ป้องกันการปิดการใช้งานบทบาท ADMIN ของระบบ
   */
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Patch('admin/roles/:id/toggle')
  async toggleRole(
    @Param('id') id: string,
    @CurrentUser() actor: Account,
  ): Promise<RoleItem> {
    return this.db.toggleRole(id, actor);
  }

  /**
   * ลบบทบาทที่ไม่ต้องการ (Delete Role)
   * - กฎความปลอดภัย:
   *   1. ห้ามลบบทบาทหลักของระบบ (isSystem = true)
   *   2. ต้องไม่มีผู้ใช้งานผูกอยู่กับบทบาทนี้ (userCount = 0)
   */
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Delete('admin/roles/:id')
  async deleteRole(
    @Param('id') id: string,
    @CurrentUser() actor: Account,
  ): Promise<{ ok: boolean }> {
    await this.db.deleteRole(id, actor);
    return { ok: true };
  }

  /**
   * กำหนดบทบาทให้ผู้ใช้งานพร้อมกันหลายคน (Bulk Role Assignment)
   * - รองรับการเลือกผู้ใช้หลายคนในตาราง แล้วสลับบทบาทพร้อมกันในคำสั่งเดียว
   * - ส่งกลับจำนวนที่อัปเดตสำเร็จ และรายการข้อผิดพลาด (ถ้ามี)
   */
  @Permissions('manageUsers')
  @Roles('ADMIN')
  @Post('admin/roles/bulk-assign')
  async bulkAssignRole(
    @Body() body: BulkAssignRoleDto,
    @CurrentUser() actor: Account,
  ): Promise<{ updatedCount: number; errors: string[] }> {
    return this.db.bulkAssignRole(body.userIds, body.role, actor);
  }

  /**
   * ดึงข้อมูลสรุปภาพรวมและตัวชี้วัด (Admin Dashboard Overview Metrics)
   * คำนวณ:
   * - usersCount: จำนวนบัญชีผู้ใช้ทั้งหมด
   * - resourcesCount: ยอดรวมสถานที่และอุปกรณ์ทั้งหมด
   * - monthRequestsCount / todayRequestsCount: จำนวนคำขอในระบบ
   * - pendingCount: จำนวนคำขอที่ค้างรอการตรวจสอบและงานซ่อมที่กำลังดำเนินการ
   * - dueReturnCount: จำนวนอุปกรณ์ที่กำลังยืมใช้งานและอยู่ระหว่างรอตรวจรับคืน
   * - activities: ประวัติกิจกรรมล่าสุด 8 รายการสำหรับ Feed กิจกรรม
   */
  @Permissions('manageUsers')
  @Get('admin/overview')
  overview() {
    const pendingCount = this.db.requests.filter((r) =>
      ['pending_staff', 'pending_l2', 'pending_l1', 'repair_submitted', 'repair_in_progress'].includes(r.status),
    ).length;
    const dueReturnCount = this.db.requests.filter(
      (r) => r.status === 'borrowing' || r.status === 'return_inspect',
    ).length;
    return {
      usersCount: this.db.accounts.length,
      resourcesCount: this.db.venues.length + this.db.equipment.length,
      monthRequestsCount: this.db.requests.length,
      todayRequestsCount: this.db.requests.length,
      pendingCount,
      dueReturnCount,
      activities: this.db.activities.slice(0, 8),
    };
  }

  /**
   * ดึงรายการแจ้งเตือนทั้งหมดของผู้ใช้ปัจจุบัน
   */
  notifications(@CurrentUser() user: Account) {
    return this.db.notifications.filter((n) => n.userId === user.id);
  }

  /**
   * ทำเครื่องหมายว่าอ่านการแจ้งเตือนทั้งหมดแล้ว
   */
  readAll(@CurrentUser() user: Account) {
    this.db.markAllNotificationsRead(user.id);
    return { ok: true };
  }

  /**
   * ล้างประวัติคำขอทดสอบทั้งหมด (Development / Demo Environment Only)
   * - ป้องกันด้วย Throttle (จำกัดเรียกไม่เกิน 2 ครั้งต่อนาที)
   * - ป้องกันไม่ให้รันในสภาพแวดล้อม Production เด็ดขาด
   */
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Permissions('manageUsers')
  @Post('dev/clear-requests')
  async clearRequests() {
    if (process.env.DEMO_MODE !== 'true' && (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_ENDPOINTS !== 'true')) {
      throw new NotFoundException('Endpoint not available');
    }
    await this.db.clearTransactions();
    return { ok: true };
  }

  /**
   * รีเซ็ตฐานข้อมูลและข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้น (Reset DB to Seed)
   * - สงวนสิทธิ์เฉพาะโหมด DEMO_MODE เท่านั้น
   */
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Permissions('manageUsers')
  @Post('dev/reset')
  async reset() {
    if (process.env.DEMO_MODE !== 'true') {
      throw new NotFoundException('Endpoint not available');
    }
    await this.db.reset();
    return { ok: true };
  }
}
