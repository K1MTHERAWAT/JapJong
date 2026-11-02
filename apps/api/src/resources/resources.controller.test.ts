import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { Account, BookingRequest, Equipment, Venue } from '@jongwen/shared';

describe('ResourcesController Unit Tests', () => {
  let controller: ResourcesController;
  let mockDb: any;
  let testAdmin: Account;
  let testVenue: Venue;
  let testEquipment: Equipment;

  beforeEach(() => {
    testAdmin = {
      id: 'u-admin',
      username: 'admin',
      password: 'hash',
      name: 'ผู้ดูแลระบบ',
      nickname: 'แอดมิน',
      initial: 'ผ',
      role: 'ADMIN',
      position: 'ผู้ดูแลระบบ',
      department: 'ศูนย์สารสนเทศ',
      phone: '0819999999',
      permissions: {
        review: true,
        handover: true,
        walkIn: true,
        manageResources: true,
        sign: true,
        manageUsers: true,
      },
      signature: 'data:image/png;base64,...',
      pin: 'hash',
      createdAt: new Date().toISOString(),
    };

    testVenue = {
      id: 'v-01',
      name: 'หอประชุมใหญ่ อบต.',
      type: 'meeting',
      building: 'อาคารเฉลิมพระเกียรติ',
      floor: 'ชั้น 2',
      capacity: 300,
      status: 'available',
      enabled: true,
      facilities: ['เครื่องปรับอากาศ', 'ระบบเสียงห้องประชุม'],
      openTime: '08:00',
      closeTime: '17:00',
      openDays: [1, 2, 3, 4, 5],
      advanceDays: 3,
      formName: 'แบบขอใช้สถานที่',
      approvalLevels: 3,
    };

    testEquipment = {
      id: 'e-01',
      name: 'ไมโครโฟนไร้สาย (ชุด 2 ตัว)',
      category: 'audio',
      stock: 10,
      enabled: true,
    };

    mockDb = {
      venues: [testVenue],
      equipment: [testEquipment],
      requests: [] as BookingRequest[],
      nextId: vi.fn((prefix) => Promise.resolve(`${prefix}-test-01`)),
      persistVenue: vi.fn().mockResolvedValue(true),
      persistEquipment: vi.fn().mockResolvedValue(true),
      log: vi.fn().mockResolvedValue(true),
    };

    controller = new ResourcesController(mockDb);
  });

  describe('Venues Management', () => {
    it('lists all venues', () => {
      const venues = controller.listVenues();
      expect(venues.length).toBe(1);
      expect(venues[0].name).toBe('หอประชุมใหญ่ อบต.');
    });

    it('creates a new venue with valid input and default constraints', async () => {
      const created = await controller.createVenue(testAdmin, {
        name: 'ลานกีฬาอเนกประสงค์',
        type: 'field',
        capacity: 500,
        advanceDays: 7,
      });

      expect(created.id).toBe('v-test-01');
      expect(created.name).toBe('ลานกีฬาอเนกประสงค์');
      expect(created.type).toBe('field');
      expect(mockDb.persistVenue).toHaveBeenCalledWith(created);
      expect(mockDb.log).toHaveBeenCalled();
    });

    it('throws BadRequestException if venue name is empty', async () => {
      await expect(controller.createVenue(testAdmin, { name: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('updates an existing venue', async () => {
      const updated = await controller.updateVenue(testAdmin, 'v-01', {
        name: 'หอประชุมใหญ่ (ปรับปรุงใหม่)',
        capacity: 350,
        enabled: false,
      });

      expect(updated.name).toBe('หอประชุมใหญ่ (ปรับปรุงใหม่)');
      expect(updated.capacity).toBe(350);
      expect(updated.enabled).toBe(false);
      expect(updated.status).toBe('maintenance');
      expect(mockDb.persistVenue).toHaveBeenCalled();
    });

    it('throws NotFoundException when updating non-existing venue', async () => {
      await expect(controller.updateVenue(testAdmin, 'non-existing', { name: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('validates capacity bounds on venue update', async () => {
      await expect(controller.updateVenue(testAdmin, 'v-01', { capacity: -5 })).rejects.toThrow(BadRequestException);
      await expect(controller.updateVenue(testAdmin, 'v-01', { capacity: 50000 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('Equipment Management', () => {
    it('lists all equipment', () => {
      const list = controller.listEquipment();
      expect(list.length).toBe(1);
      expect(list[0].category).toBe('audio');
    });

    it('creates a new equipment item', async () => {
      const created = await controller.createEquipment(testAdmin, {
        name: 'เต็นท์พับขนาดใหญ่',
        category: 'tent',
        stock: 5,
      });

      expect(created.id).toBe('e-test-01');
      expect(created.stock).toBe(5);
      expect(created.category).toBe('tent');
      expect(mockDb.persistEquipment).toHaveBeenCalledWith(created);
    });

    it('validates equipment stock bounds on create', async () => {
      await expect(controller.createEquipment(testAdmin, { name: 'เต็นท์', stock: -1 })).rejects.toThrow(BadRequestException);
    });

    it('updates existing equipment', async () => {
      const updated = await controller.updateEquipment('e-01', {
        stock: 15,
        enabled: false,
      });

      expect(updated.stock).toBe(15);
      expect(updated.enabled).toBe(false);
      expect(mockDb.persistEquipment).toHaveBeenCalled();
    });

    it('throws NotFoundException when updating non-existing equipment', async () => {
      await expect(controller.updateEquipment('non-existing', { stock: 10 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('Availability Calendar & Conflict Detection', () => {
    it('returns availability for a given month with correct days count', () => {
      const avail = controller.availability('v-01', '2026-11');
      expect(avail.length).toBe(30); // November has 30 days
      expect(avail[0].date).toBe('2026-11-01');
      expect(avail[0].level).toBe('many');
    });

    it('calculates booked hours and sets availability level', () => {
      mockDb.requests.push({
        id: 'req-01',
        code: 'BK-2569-0001',
        type: 'booking',
        status: 'approved',
        venueIds: ['v-01'],
        periods: [
          {
            start: '2026-11-15T08:00:00+07:00',
            end: '2026-11-15T16:00:00+07:00', // 8 hours -> full
          },
        ],
        extraItems: [],
        signatures: [],
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      } as unknown as BookingRequest);

      const avail = controller.availability('v-01', '2026-11');
      const day15 = avail.find((a) => a.date === '2026-11-15');
      expect(day15?.bookedHours).toBeGreaterThanOrEqual(7);
      expect(day15?.level).toBe('full');
    });

    it('detects period conflicts against active bookings', () => {
      mockDb.requests.push({
        id: 'req-01',
        code: 'BK-2569-0001',
        type: 'booking',
        status: 'pending_staff',
        venueIds: ['v-01'],
        periods: [
          {
            start: '2026-11-20T09:00:00+07:00',
            end: '2026-11-20T12:00:00+07:00',
          },
        ],
      } as unknown as BookingRequest);

      const result = controller.checkConflicts({
        venueIds: ['v-01'],
        periods: [
          {
            start: '2026-11-20T11:00:00+07:00',
            end: '2026-11-20T14:00:00+07:00',
          },
        ],
      });

      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].code).toBe('BK-2569-0001');
      expect(result.conflicts[0].venueId).toBe('v-01');
    });

    it('ignores excluded request ID during conflict check (e.g. self-editing)', () => {
      mockDb.requests.push({
        id: 'req-self',
        code: 'BK-2569-0002',
        type: 'booking',
        status: 'pending_staff',
        venueIds: ['v-01'],
        periods: [
          {
            start: '2026-11-20T09:00:00+07:00',
            end: '2026-11-20T12:00:00+07:00',
          },
        ],
      } as unknown as BookingRequest);

      const result = controller.checkConflicts({
        venueIds: ['v-01'],
        periods: [
          {
            start: '2026-11-20T09:00:00+07:00',
            end: '2026-11-20T12:00:00+07:00',
          },
        ],
        excludeRequestId: 'req-self',
      });

      expect(result.conflicts.length).toBe(0);
    });
  });
});

