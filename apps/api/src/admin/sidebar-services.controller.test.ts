import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DbService } from '../db/db.service';
import { SidebarServicesController } from './sidebar-services.controller';
import { Account, Role, SidebarServiceItem } from '@japjong/shared';
import { RequestsController } from '../requests/requests.controller';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { DocumentsService } from '../documents/documents.service';

describe('SidebarServicesController & Service Permission Management', () => {
  let db: DbService;
  let controller: SidebarServicesController;
  let requestsController: RequestsController;
  let adminActor: Account;
  let staffActor: Account;
  let citizenActor: Account;

  beforeEach(async () => {
    process.env.DEMO_MODE = 'true';
    db = new DbService();
    await db.seedInMemoryFallback();

    controller = new SidebarServicesController(db);
    const mockEventsService = {
      emitRequestCreated: () => {},
      emitRequestUpdated: () => {},
    } as unknown as NotificationEventsService;
    const mockDocsService = {
      createVerificationRecord: async () => {},
    } as unknown as DocumentsService;
    requestsController = new RequestsController(db, mockEventsService, mockDocsService);

    adminActor = db.accounts.find((a) => a.role === 'ADMIN')!;
    staffActor = db.accounts.find((a) => a.role === 'STAFF')!;
    citizenActor = db.accounts.find((a) => a.role === 'USER')!;
  });

  afterEach(() => {
    db.onModuleDestroy();
  });

  describe('1. Navigation Endpoint (getNavigation)', () => {
    it('returns public visible services for unauthenticated guest', async () => {
      const mockReq = { headers: {} } as any;
      const nav = await controller.getNavigation(mockReq);

      expect(nav.length).toBeGreaterThan(0);
      // All returned items must have USER in roles and be enabled
      for (const item of nav) {
        expect(item.enabled).toBe(true);
        expect(item.roles).toContain('USER');
      }
      // Should not contain admin-only items
      expect(nav.some((item) => item.href === '/admin')).toBe(false);
    });

    it('returns role-specific services for authenticated staff', async () => {
      // Mock session for staff
      const token = 'token-staff-test';
      (db as any).memorySessions.set(token, {
        accountId: staffActor.id,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockReq = { headers: { authorization: `Bearer ${token}` } } as any;
      const nav = await controller.getNavigation(mockReq);

      expect(nav.length).toBeGreaterThan(0);
      expect(nav.some((item) => item.href === '/staff/review')).toBe(true);
      expect(nav.some((item) => item.href === '/admin')).toBe(false);
    });

    it('returns admin services for authenticated admin', async () => {
      const token = 'token-admin-test';
      (db as any).memorySessions.set(token, {
        accountId: adminActor.id,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockReq = { headers: { authorization: `Bearer ${token}` } } as any;
      const nav = await controller.getNavigation(mockReq);

      expect(nav.some((item) => item.href === '/admin')).toBe(true);
      expect(nav.some((item) => item.href === '/admin/services')).toBe(true);
      expect(nav.some((item) => item.href === '/admin/permissions')).toBe(true);
    });
  });

  describe('2. Service CRUD Operations', () => {
    it('lists all services including inactive ones for admin', () => {
      const all = controller.listAllServices();
      expect(all.length).toBeGreaterThanOrEqual(18);
      expect(all.some((s) => s.href === '/booking')).toBe(true);
      expect(all.some((s) => s.href === '/admin/services')).toBe(true);
    });

    it('creates a new custom service with roles and permissions', async () => {
      const newService = await controller.createService(adminActor, {
        label: 'บริการขอใช้ไฟฟ้าชั่วคราว',
        description: 'ยื่นคำขอติดตั้งหม้อแปลงและใช้ไฟฟ้าชั่วคราวสำหรับงานจัดเลี้ยง',
        icon: 'Zap',
        href: '/services/temp-power',
        category: 'บริการพิเศษ',
        roles: ['USER', 'STAFF', 'ADMIN'],
        permissions: { view: true, create: true, edit: false, delete: false, approve: false, manage: false },
      });

      expect(newService.id).toBeDefined();
      expect(newService.label).toBe('บริการขอใช้ไฟฟ้าชั่วคราว');
      expect(newService.category).toBe('บริการพิเศษ');
      expect(newService.enabled).toBe(true);

      const found = controller.getService(newService.id);
      expect(found).toBeDefined();
      expect(found.href).toBe('/services/temp-power');
    });

    it('rejects duplicate URLs', async () => {
      await expect(
        controller.createService(adminActor, {
          label: 'บริการขอใช้สถานที่ซ้ำ',
          icon: 'Building2',
          href: '/booking',
          category: 'บริการหลัก',
          roles: ['USER'],
        }),
      ).rejects.toThrow('มีอยู่ในระบบแล้ว');
    });

    it('updates service details, roles, and action permissions', async () => {
      const custom = await controller.createService(adminActor, {
        label: 'บริการเก็บขยะชิ้นใหญ่',
        icon: 'Trash2',
        href: '/services/large-waste',
        category: 'บริการประชาชน',
        roles: ['USER'],
      });

      const updated = await controller.updateService(adminActor, custom.id, {
        label: 'บริการเก็บขยะชิ้นใหญ่และสิ่งปฏิกูล',
        roles: ['USER', 'STAFF', 'ADMIN'],
        permissions: { view: true, create: true, edit: true, delete: false, approve: true, manage: false },
      });

      expect(updated.label).toBe('บริการเก็บขยะชิ้นใหญ่และสิ่งปฏิกูล');
      expect(updated.roles).toEqual(['USER', 'STAFF', 'ADMIN']);
      expect(updated.permissions.approve).toBe(true);
    });

    it('toggles service active/inactive status', async () => {
      const custom = await controller.createService(adminActor, {
        label: 'บริการทดสอบ Toggle',
        icon: 'Star',
        href: '/services/test-toggle',
        category: 'บริการพิเศษ',
        roles: ['USER'],
      });
      expect(custom.enabled).toBe(true);

      const toggledOff = await controller.toggleService(adminActor, custom.id);
      expect(toggledOff.enabled).toBe(false);

      const toggledOn = await controller.toggleService(adminActor, custom.id);
      expect(toggledOn.enabled).toBe(true);
    });

    it('reorders services batch and updates categories', async () => {
      const all = controller.listAllServices();
      const firstTwo = all.slice(0, 2);

      await controller.reorderServices(adminActor, {
        items: [
          { id: firstTwo[0].id, sortOrder: 99 },
          { id: firstTwo[1].id, sortOrder: 100, category: 'หมวดหมู่ปรับใหม่' },
        ],
      });

      const item1 = controller.getService(firstTwo[0].id);
      const item2 = controller.getService(firstTwo[1].id);
      expect(item1.sortOrder).toBe(99);
      expect(item2.sortOrder).toBe(100);
      expect(item2.category).toBe('หมวดหมู่ปรับใหม่');
    });
  });

  describe('3. Admin Security & Safety Lock Business Logic', () => {
    it('prevents removing ADMIN role from admin system menus', async () => {
      const adminMenu = controller.listAllServices().find((s) => s.href === '/admin')!;
      await expect(
        controller.updateService(adminActor, adminMenu.id, {
          roles: ['USER', 'STAFF'] as Role[], // Trying to remove ADMIN
        }),
      ).rejects.toThrow('ไม่สามารถยกเลิกสิทธิ์ของผู้ดูแลระบบ');
    });

    it('prevents disabling core admin management menus', async () => {
      const adminServicesMenu = controller.listAllServices().find((s) => s.href === '/admin/services')!;
      await expect(
        controller.toggleService(adminActor, adminServicesMenu.id),
      ).rejects.toThrow('ไม่สามารถปิดการใช้งานเมนูผู้ดูแลระบบหลักได้');

      await expect(
        controller.updateService(adminActor, adminServicesMenu.id, { enabled: false }),
      ).rejects.toThrow('ไม่สามารถปิดการใช้งานเมนูหลักของผู้ดูแลระบบได้');
    });

    it('prevents deleting system menus or services with relation records', async () => {
      const bookingService = controller.listAllServices().find((s) => s.href === '/booking')!;
      const check = await controller.checkServiceRelations(bookingService.id);
      expect(check.canDelete).toBe(false);
      expect(check.reasons.length).toBeGreaterThan(0);

      await expect(controller.deleteService(adminActor, bookingService.id)).rejects.toThrow('ไม่สามารถลบบริการ');
    });

    it('allows deleting a custom service when no relations exist', async () => {
      const custom = await controller.createService(adminActor, {
        label: 'บริการยกเลิกได้',
        icon: 'HelpCircle',
        href: '/services/can-delete',
        category: 'บริการเสริม',
        roles: ['USER'],
      });

      const check = await controller.checkServiceRelations(custom.id);
      expect(check.canDelete).toBe(true);

      const delResult = await controller.deleteService(adminActor, custom.id);
      expect(delResult.success).toBe(true);

      expect(() => controller.getService(custom.id)).toThrow('ไม่พบบริการ');
    });
  });

  describe('4. Individual User Overrides & Role Preview', () => {
    it('supports individual user allowed override even if role is not in roles list', async () => {
      const custom = await controller.createService(adminActor, {
        label: 'บริการเฉพาะเจ้าหน้าที่พิเศษ',
        icon: 'Lock',
        href: '/services/special-officer',
        category: 'งานพิเศษ',
        roles: ['STAFF'],
        allowedUserIds: [citizenActor.id], // Somchai is USER, but explicitly allowed
      });

      const token = 'token-citizen-special';
      (db as any).memorySessions.set(token, {
        accountId: citizenActor.id,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockReq = { headers: { authorization: `Bearer ${token}` } } as any;
      const nav = await controller.getNavigation(mockReq);
      expect(nav.some((item) => item.id === custom.id)).toBe(true);
    });

    it('supports individual user denied override', async () => {
      const custom = await controller.createService(adminActor, {
        label: 'บริการประชาชนทั่วไป',
        icon: 'Users',
        href: '/services/public-test',
        category: 'บริการประชาชน',
        roles: ['USER'],
        deniedUserIds: [citizenActor.id], // Somchai is blocked from this service
      });

      const token = 'token-citizen-blocked';
      (db as any).memorySessions.set(token, {
        accountId: citizenActor.id,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockReq = { headers: { authorization: `Bearer ${token}` } } as any;
      const nav = await controller.getNavigation(mockReq);
      expect(nav.some((item) => item.id === custom.id)).toBe(false);
    });

    it('previews navigation accurately per role', () => {
      const userNav = controller.previewServicesForRole('USER');
      expect(userNav.some((item) => item.href === '/booking')).toBe(true);
      expect(userNav.some((item) => item.href === '/admin')).toBe(false);

      const staffNav = controller.previewServicesForRole('STAFF');
      expect(staffNav.some((item) => item.href === '/staff/review')).toBe(true);

      const adminNav = controller.previewServicesForRole('ADMIN');
      expect(adminNav.some((item) => item.href === '/admin')).toBe(true);
    });
  });

  describe('5. Backend Route Permission Guarding & Audit Logging', () => {
    it('blocks request creation when the service is disabled at backend', async () => {
      const bookingService = controller.listAllServices().find((s) => s.href === '/booking')!;
      await controller.updateService(adminActor, bookingService.id, { enabled: false });

      await expect(
        requestsController.createBooking(citizenActor, {
          venueIds: [db.venues[0].id],
          periods: [{ start: '2026-11-20T09:00:00+07:00', end: '2026-11-20T12:00:00+07:00' }],
          attendees: 10,
          purpose: 'ประชุมทดสอบ',
          activity: 'ประชุม',
          requesterSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }),
      ).rejects.toThrow('บริการขอใช้สถานที่ถูกปิดใช้งานชั่วคราวโดยผู้ดูแลระบบ');

      // Re-enable
      await controller.updateService(adminActor, bookingService.id, { enabled: true });
    });

    it('records audit logs with actor details and timestamp on service modifications', async () => {
      const beforeCount = db.activities.length;
      await controller.createService(adminActor, {
        label: 'บริการมีบันทึก Audit',
        icon: 'Shield',
        href: '/services/audit-test',
        category: 'ความปลอดภัย',
        roles: ['ADMIN'],
      });

      expect(db.activities.length).toBeGreaterThan(beforeCount);
      const latestLog = db.activities[0];
      expect(latestLog.actorName).toBe(adminActor.name);
      expect(latestLog.detail).toContain('บริการมีบันทึก Audit');
      expect(latestLog.at).toBeDefined();
    });
  });
});

