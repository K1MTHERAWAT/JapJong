import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  Account,
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  PermissionKey,
  ROLE_LABEL,
  Role,
} from '@jongwen/shared';
import { CurrentUser, Permissions } from '../auth/auth.guard';
import { hashSecret } from '../auth/secret';
import { DbService } from '../db/db.service';

const VALID_ROLES: Role[] = ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'];

@Controller()
export class AdminController {
  constructor(private readonly db: DbService) {}

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
        throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง');
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

    if (typeof body.active === 'boolean' && body.active !== (target.active ?? true)) {
      target.active = body.active;
      await this.db.log('user', `${body.active ? 'เปิด' : 'ระงับ'}การใช้งานบัญชี`, target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }
    if (body.role && body.role !== target.role) {
      target.role = body.role;
      target.permissions = { ...DEFAULT_PERMISSIONS[body.role] };
      await this.db.log('role', `เปลี่ยนสิทธิ์เป็น${ROLE_LABEL[body.role]}`, target.name, {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      });
    }
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
    await this.db.persistAccount(target);
    return this.db.toPublic(target);
  }

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

  notifications(@CurrentUser() user: Account) {
    return this.db.notifications.filter((n) => n.userId === user.id);
  }

  readAll(@CurrentUser() user: Account) {
    this.db.markAllNotificationsRead(user.id);
    return { ok: true };
  }

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
