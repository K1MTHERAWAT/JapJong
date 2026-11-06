import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { Account, DEFAULT_PERMISSIONS } from '@japjong/shared';

describe('AdminController Unit Tests', () => {
  let controller: AdminController;
  let mockDb: any;
  let actorAdmin: Account;
  let targetUser: Account;

  beforeEach(() => {
    process.env.DEMO_MODE = 'true';

    actorAdmin = {
      id: 'u-admin-01',
      username: 'admin01',
      password: 'hash',
      name: 'ผู้ดูแลระบบ สูงสุด',
      nickname: 'แอดมิน',
      initial: 'ผ',
      role: 'ADMIN',
      position: 'ผู้ดูแลระบบ',
      department: 'ศูนย์สารสนเทศ',
      phone: '0819999999',
      permissions: { ...DEFAULT_PERMISSIONS.ADMIN },
      signature: 'data:image/png;base64,...',
      pin: 'hash',
      active: true,
      createdAt: new Date().toISOString(),
    };

    targetUser = {
      id: 'u-target-01',
      username: 'somchai_user',
      password: 'hash',
      name: 'สมชาย ผู้ใช้งาน',
      nickname: 'ชาย',
      initial: 'ส',
      role: 'USER',
      position: 'ประชาชน',
      department: 'หมู่ 1 น้ำชำ',
      phone: '0812345678',
      permissions: { ...DEFAULT_PERMISSIONS.USER },
      signature: null,
      pin: null,
      active: true,
      createdAt: new Date().toISOString(),
    };

    mockDb = {
      accounts: [actorAdmin, targetUser],
      venues: [{ id: 'v-01' }],
      equipment: [{ id: 'e-01' }, { id: 'e-02' }],
      requests: [
        { id: 'r-01', status: 'pending_staff' },
        { id: 'r-02', status: 'borrowing' },
      ],
      activities: [{ id: 'act-01', title: 'test activity' }],
      notifications: [
        { id: 'n-01', userId: 'u-admin-01', read: false },
        { id: 'n-02', userId: 'u-target-01', read: false },
      ],
      toPublic: vi.fn((a) => {
        const { password, ...pub } = a;
        return pub;
      }),
      persistAccount: vi.fn().mockResolvedValue(true),
      log: vi.fn().mockResolvedValue(true),
      markAllNotificationsRead: vi.fn().mockImplementation((userId) => {
        mockDb.notifications.forEach((n: any) => {
          if (n.userId === userId) n.read = true;
        });
      }),
      clearTransactions: vi.fn().mockResolvedValue(true),
      reset: vi.fn().mockResolvedValue(true),
      listRoles: vi.fn().mockReturnValue([
        { id: 'role-admin', key: 'ADMIN', name: 'ผู้ดูแลระบบ', enabled: true, userCount: 1 },
        { id: 'role-user', key: 'USER', name: 'ผู้ใช้งานทั่วไป', enabled: true, userCount: 1 },
      ]),
      createRole: vi.fn().mockImplementation((dto, actor) =>
        Promise.resolve({ id: 'role-new', key: dto.key || 'NEW', ...dto }),
      ),
      updateRole: vi.fn().mockImplementation((id, dto, actor) =>
        Promise.resolve({ id, ...dto }),
      ),
      toggleRole: vi.fn().mockImplementation((id, actor) =>
        Promise.resolve({ id, enabled: false }),
      ),
      deleteRole: vi.fn().mockImplementation((id, actor) =>
        Promise.resolve(),
      ),
      bulkAssignRole: vi.fn().mockImplementation((userIds, role, actor) =>
        Promise.resolve({ updatedCount: userIds.length, errors: [] }),
      ),
    };

    controller = new AdminController(mockDb);
  });

  describe('GET users (listUsers)', () => {
    it('returns public account representations for all accounts', () => {
      const users = controller.listUsers();
      expect(users.length).toBe(2);
      expect(mockDb.toPublic).toHaveBeenCalledTimes(2);
    });

    it('filters users by search query (q)', () => {
      const users = controller.listUsers('สมชาย');
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('สมชาย ผู้ใช้งาน');
    });

    it('filters users by role', () => {
      const admins = controller.listUsers(undefined, 'ADMIN');
      expect(admins.length).toBe(1);
      expect(admins[0].role).toBe('ADMIN');
    });
  });

  describe('PATCH users/:id/permissions (updatePermissions)', () => {
    it('updates user role and sets default permissions for the new role', async () => {
      const updated = await controller.updatePermissions(actorAdmin, 'u-target-01', {
        role: 'STAFF',
      });
      expect(targetUser.role).toBe('STAFF');
      expect(targetUser.permissions.review).toBe(true);
      expect(mockDb.persistAccount).toHaveBeenCalled();
      expect(mockDb.log).toHaveBeenCalled();
    });

    it('updates fine-grained permissions for user', async () => {
      await controller.updatePermissions(actorAdmin, 'u-target-01', {
        permissions: { manageResources: true },
      });
      expect(targetUser.permissions.manageResources).toBe(true);
    });

    it('updates user profile details and phone', async () => {
      await controller.updatePermissions(actorAdmin, 'u-target-01', {
        name: 'สมชาย แก้ไขใหม่',
        phone: '0898887766',
        position: 'หัวหน้าชุมชน',
      });
      expect(targetUser.name).toBe('สมชาย แก้ไขใหม่');
      expect(targetUser.phone).toBe('0898887766');
      expect(targetUser.position).toBe('หัวหน้าชุมชน');
    });

    it('resets user password with valid length', async () => {
      await controller.updatePermissions(actorAdmin, 'u-target-01', {
        newPassword: 'newAdminPassword123',
      });
      expect(targetUser.password).toBeDefined();
      expect(mockDb.log).toHaveBeenCalled();
    });

    it('throws BadRequestException if new password is too short', async () => {
      await expect(
        controller.updatePermissions(actorAdmin, 'u-target-01', {
          newPassword: '12',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deactivates or activates a user account', async () => {
      await controller.updatePermissions(actorAdmin, 'u-target-01', {
        active: false,
      });
      expect(targetUser.active).toBe(false);

      await controller.updatePermissions(actorAdmin, 'u-target-01', {
        active: true,
      });
      expect(targetUser.active).toBe(true);
    });

    it('throws ForbiddenException if admin attempts to demote their own admin role', async () => {
      await expect(
        controller.updatePermissions(actorAdmin, actorAdmin.id, {
          role: 'USER',
        }),
      ).rejects.toThrow(/ไม่สามารถลดระดับบทบาทผู้ดูแลระบบของตนเองได้/);
    });

    it('throws ForbiddenException if admin attempts to revoke their own manageUsers permission', async () => {
      await expect(
        controller.updatePermissions(actorAdmin, actorAdmin.id, {
          permissions: { manageUsers: false },
        }),
      ).rejects.toThrow(/ไม่สามารถเพิกถอนสิทธิ์จัดการผู้ใช้งานของตนเองได้/);
    });

    it('throws ForbiddenException if admin attempts to deactivate their own account', async () => {
      await expect(
        controller.updatePermissions(actorAdmin, actorAdmin.id, {
          active: false,
        }),
      ).rejects.toThrow(/ไม่สามารถปิดการใช้งานบัญชีของตนเองได้/);
    });

    it('throws NotFoundException when user does not exist', async () => {
      await expect(
        controller.updatePermissions(actorAdmin, 'non-existing', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Admin Overview & Notifications', () => {
    it('returns correct system overview metrics', () => {
      const ov = controller.overview();
      expect(ov.usersCount).toBe(2);
      expect(ov.resourcesCount).toBe(3); // 1 venue + 2 equipment
      expect(ov.pendingCount).toBe(1);
      expect(ov.dueReturnCount).toBe(1);
    });

    it('returns notifications for current user only', () => {
      const notifs = controller.notifications(actorAdmin);
      expect(notifs.length).toBe(1);
      expect(notifs[0].id).toBe('n-01');
    });

    it('marks all notifications read for current user', () => {
      const res = controller.readAll(actorAdmin);
      expect(res.ok).toBe(true);
      expect(mockDb.markAllNotificationsRead).toHaveBeenCalledWith('u-admin-01');
    });
  });

  describe('Dev Management Endpoints', () => {
    it('clears requests in demo mode', async () => {
      const res = await controller.clearRequests();
      expect(res.ok).toBe(true);
      expect(mockDb.clearTransactions).toHaveBeenCalled();
    });

    it('resets database in demo mode', async () => {
      const res = await controller.reset();
      expect(res.ok).toBe(true);
      expect(mockDb.reset).toHaveBeenCalled();
    });
  });

  describe('Role Management Endpoints', () => {
    it('listRoles returns roles from db', () => {
      const roles = controller.listRoles();
      expect(roles.length).toBe(2);
      expect(mockDb.listRoles).toHaveBeenCalled();
    });

    it('createRole calls db.createRole with dto and actor', async () => {
      const dto = { name: 'บทบาททดสอบ', key: 'TEST_ROLE', description: 'คำอธิบาย' };
      const res = await controller.createRole(dto, actorAdmin);
      expect(res.name).toBe('บทบาททดสอบ');
      expect(mockDb.createRole).toHaveBeenCalledWith(dto, actorAdmin);
    });

    it('updateRole calls db.updateRole with id, dto and actor', async () => {
      const dto = { name: 'ชื่อใหม่' };
      const res = await controller.updateRole('role-user', dto, actorAdmin);
      expect(res.name).toBe('ชื่อใหม่');
      expect(mockDb.updateRole).toHaveBeenCalledWith('role-user', dto, actorAdmin);
    });

    it('toggleRole calls db.toggleRole with id and actor', async () => {
      const res = await controller.toggleRole('role-user', actorAdmin);
      expect(res.enabled).toBe(false);
      expect(mockDb.toggleRole).toHaveBeenCalledWith('role-user', actorAdmin);
    });

    it('deleteRole calls db.deleteRole with id and actor', async () => {
      const res = await controller.deleteRole('role-user', actorAdmin);
      expect(res.ok).toBe(true);
      expect(mockDb.deleteRole).toHaveBeenCalledWith('role-user', actorAdmin);
    });

    it('bulkAssignRole calls db.bulkAssignRole with userIds, role and actor', async () => {
      const dto = { userIds: ['u-target-01'], role: 'STAFF' as const };
      const res = await controller.bulkAssignRole(dto, actorAdmin);
      expect(res.updatedCount).toBe(1);
      expect(mockDb.bulkAssignRole).toHaveBeenCalledWith(['u-target-01'], 'STAFF', actorAdmin);
    });
  });
});

