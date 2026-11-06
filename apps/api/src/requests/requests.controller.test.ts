import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { Account, BookingRequest, BorrowRequest, RepairRequest, Venue, Equipment } from '@japjong/shared';
import { hashSecret } from '../auth/secret';

describe('RequestsController Unit Tests', () => {
  let controller: RequestsController;
  let mockDb: any;
  let mockDocService: any;

  let citizen: Account;
  let staff: Account;
  let paladL2: Account;
  let nayokL1: Account;
  let admin: Account;

  let testVenue: Venue;
  let testEquipment: Equipment;

  beforeEach(async () => {
    const pinHash = await hashSecret('123456');

    citizen = {
      id: 'u-citizen',
      username: 'somchai',
      password: 'hash',
      name: 'สมชาย ประชาชน',
      nickname: 'ชาย',
      initial: 'ส',
      role: 'USER',
      position: 'ประชาชน',
      department: 'ชุมชน 1',
      phone: '0812345678',
      permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: false, manageUsers: false },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pin: pinHash,
      createdAt: new Date().toISOString(),
    };

    staff = {
      id: 'u-staff',
      username: 'suda',
      password: 'hash',
      name: 'สุดา มีสุข',
      nickname: 'ดา',
      initial: 'ส',
      role: 'STAFF',
      position: 'เจ้าหน้าที่ธุรการ',
      department: 'สำนักปลัด',
      phone: '0811111111',
      permissions: { review: true, handover: true, walkIn: true, manageResources: false, sign: false, manageUsers: false },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pin: pinHash,
      createdAt: new Date().toISOString(),
    };

    paladL2 = {
      id: 'u-palad',
      username: 'wichai',
      password: 'hash',
      name: 'วิชัย ปลัด',
      nickname: 'ชัย',
      initial: 'ว',
      role: 'APPROVER_L2',
      position: 'ปลัด อบต.',
      department: 'สำนักปลัด',
      phone: '0812222222',
      permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: true, manageUsers: false },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pin: pinHash,
      createdAt: new Date().toISOString(),
    };

    nayokL1 = {
      id: 'u-nayok',
      username: 'prasert',
      password: 'hash',
      name: 'ประเสริฐ นายก',
      nickname: 'เสริฐ',
      initial: 'ป',
      role: 'APPROVER_L1',
      position: 'นายก อบต.',
      department: 'สำนักงานนายก',
      phone: '0813333333',
      permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: true, manageUsers: false },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pin: pinHash,
      createdAt: new Date().toISOString(),
    };

    admin = {
      id: 'u-admin',
      username: 'admin',
      password: 'hash',
      name: 'แอดมิน สูงสุด',
      nickname: 'มิน',
      initial: 'แ',
      role: 'ADMIN',
      position: 'ผู้ดูแลระบบ',
      department: 'ศูนย์สารสนเทศ',
      phone: '0819999999',
      permissions: { review: true, handover: true, walkIn: true, manageResources: true, sign: true, manageUsers: true },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pin: pinHash,
      createdAt: new Date().toISOString(),
    };

    testVenue = {
      id: 'v-01',
      name: 'หอประชุมใหญ่ อบต.',
      type: 'meeting',
      building: 'อาคาร 1',
      floor: 'ชั้น 1',
      capacity: 200,
      status: 'available',
      enabled: true,
      facilities: ['แอร์'],
      openTime: '08:00',
      closeTime: '17:00',
      openDays: [1, 2, 3, 4, 5],
      advanceDays: 1,
      formName: 'แบบขอใช้สถานที่',
      approvalLevels: 3,
    };

    testEquipment = {
      id: 'e-01',
      name: 'ไมโครโฟนไร้สาย',
      category: 'audio',
      stock: 5,
      enabled: true,
    };

    mockDb = {
      accounts: [citizen, staff, paladL2, nayokL1, admin],
      venues: [testVenue],
      equipment: [testEquipment],
      requests: [] as any[],
      handovers: [] as any[],
      notifications: [] as any[],
      nextId: vi.fn((prefix) => Promise.resolve(`${prefix}-test-01`)),
      nextCode: vi.fn((prefix) => Promise.resolve(`${prefix}-2569-0001`)),
      persistRequest: vi.fn().mockImplementation((r) => {
        const idx = mockDb.requests.findIndex((req: any) => req.id === r.id);
        if (idx >= 0) mockDb.requests[idx] = r;
        else mockDb.requests.push(r);
        return Promise.resolve();
      }),
      persistHandover: vi.fn().mockImplementation((h) => {
        mockDb.handovers.push(h);
        return Promise.resolve();
      }),
      log: vi.fn().mockResolvedValue(true),
      notify: vi.fn(),
      notifyRole: vi.fn(),
      pushNotification: vi.fn().mockResolvedValue(true),
      recordPinAttempt: vi.fn().mockResolvedValue(true),
      getSignVerifiedSession: vi.fn().mockResolvedValue({ id: 'sign-session-01', expiresAt: new Date(Date.now() + 1800000) }),
    };

    controller = new RequestsController(mockDb);
  });

  describe('Booking Creation (POST /requests/booking)', () => {
    const validBookingBody = () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 4);
      const day = futureDate.getDay();
      // Ensure weekday 1-5
      if (day === 0) futureDate.setDate(futureDate.getDate() + 1);
      if (day === 6) futureDate.setDate(futureDate.getDate() + 2);
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;

      return {
        venueIds: ['v-01'],
        periods: [
          {
            start: `${dateStr}T09:00:00+07:00`,
            end: `${dateStr}T12:00:00+07:00`,
          },
        ],
        activity: 'ประชุมประจำปี',
        purpose: 'เพื่อรายงานผลการดำเนินงาน',
        attendees: 50,
        extraItems: [{ equipmentId: 'e-01', qty: 2 }],
        requesterSignature: citizen.signature!,
      };
    };

    it('creates a booking request successfully with pending_staff status', async () => {
      const body = validBookingBody();
      const created = await controller.createBooking(citizen, body);

      expect(created.code).toBe('BK-2569-0001');
      expect(created.status).toBe('pending_staff');
      expect(created.requesterId).toBe(citizen.id);
      expect(mockDb.persistRequest).toHaveBeenCalled();
      expect(mockDb.notifyRole).toHaveBeenCalled();
    });

    it('throws BadRequestException if venue does not exist or is disabled', async () => {
      const body = validBookingBody();
      body.venueIds = ['non-existing'];
      await expect(controller.createBooking(citizen, body)).rejects.toThrow(/ปิดปรับปรุงหรือไม่พร้อมใช้งาน/);
    });

    it('throws BadRequestException if attendees exceed venue capacity', async () => {
      const body = validBookingBody();
      body.attendees = 500; // Capacity is 200
      await expect(controller.createBooking(citizen, body)).rejects.toThrow(/เกินความจุ/);
    });

    it('throws BadRequestException if extra items exceed available stock', async () => {
      const body = validBookingBody();
      body.extraItems = [{ equipmentId: 'e-01', qty: 99 }]; // Stock is 5
      await expect(controller.createBooking(citizen, body)).rejects.toThrow(/ต้องอยู่ระหว่าง 1 ถึง/);
    });

    it('throws ConflictException if period overlaps with existing approved booking', async () => {
      const body = validBookingBody();
      // Create existing active booking
      mockDb.requests.push({
        id: 'existing-b1',
        code: 'BK-2569-0099',
        type: 'booking',
        status: 'approved',
        venueIds: ['v-01'],
        periods: body.periods,
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
      });

      await expect(controller.createBooking(citizen, body)).rejects.toThrow(ConflictException);
    });
  });

  describe('Borrow Creation (POST /requests/borrow)', () => {
    it('creates a borrow request successfully', async () => {
      const borrowBody = {
        items: [{ equipmentId: 'e-01', qty: 2 }],
        purpose: 'จัดงานบุญประเพณี',
        pickupDate: '2026-11-20',
        returnDate: '2026-11-22',
        requesterSignature: citizen.signature!,
      };

      const created = await controller.createBorrow(citizen, borrowBody);
      expect(created.code).toBe('BR-2569-0001');
      expect(created.status).toBe('pending_staff');
      expect(created.type).toBe('borrow');
    });

    it('throws BadRequestException if borrowed quantity exceeds stock', async () => {
      const borrowBody = {
        items: [{ equipmentId: 'e-01', qty: 100 }],
        purpose: 'จัดงาน',
        pickupDate: '2026-11-20',
        returnDate: '2026-11-22',
        requesterSignature: citizen.signature!,
      };
      await expect(controller.createBorrow(citizen, borrowBody)).rejects.toThrow(/ต้องอยู่ระหว่าง 1 ถึง/);
    });

    it('throws ConflictException if borrowed quantity exceeds overlapping available stock', async () => {
      mockDb.requests.push({
        id: 'active-br-01',
        code: 'BR-2569-0050',
        type: 'borrow',
        status: 'approved',
        pickupDate: '2026-11-20',
        returnDate: '2026-11-25',
        items: [{ equipmentId: 'e-01', qty: 4 }], // 4 out of 5 reserved
        signatures: [],
      });

      const borrowBody = {
        items: [{ equipmentId: 'e-01', qty: 2 }], // 4 + 2 > 5
        purpose: 'จัดงาน',
        pickupDate: '2026-11-21',
        returnDate: '2026-11-23',
        requesterSignature: citizen.signature!,
      };
      await expect(controller.createBorrow(citizen, borrowBody)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if return date is before pickup date', async () => {
      const borrowBody = {
        items: [{ equipmentId: 'e-01', qty: 1 }],
        purpose: 'จัดงาน',
        pickupDate: '2026-11-22',
        returnDate: '2026-11-20',
        requesterSignature: citizen.signature!,
      };
      await expect(controller.createBorrow(citizen, borrowBody)).rejects.toThrow(/วันที่รับและคืนไม่ถูกต้อง/);
    });
  });

  describe('Repair Creation (POST /requests/repair)', () => {
    it('creates a repair request with repair_submitted status', async () => {
      const repairBody = {
        location: 'ห้องประชุม 1 ชั้น 2',
        detail: 'หลอดไฟกระพริบและเครื่องเสียงมีเสียงฮัม',
      };
      const created = await controller.createRepair(citizen, repairBody);
      expect(created.code).toBe('RP-2569-0001');
      expect(created.status).toBe('repair_submitted');
      expect(created.type).toBe('repair');
    });

    it('throws BadRequestException if location or detail is missing', async () => {
      await expect(controller.createRepair(citizen, { location: '', detail: '' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('Two-Factor Approval & Signing Workflow (POST /requests/:id/sign)', () => {
    let bookingReq: BookingRequest;

    beforeEach(() => {
      bookingReq = {
        id: 'r-booking-01',
        code: 'BK-2569-0001',
        type: 'booking',
        status: 'pending_staff',
        approvalRound: 1,
        requesterId: citizen.id,
        requesterName: citizen.name,
        organization: citizen.department,
        requesterSignature: citizen.signature!,
        writtenAt: 'อบต.น้ำชำ',
        purposeItems: ['ประชุม'],
        purpose: 'ประชุมประจำปี',
        activity: 'ประชุม',
        attendees: 30,
        venueIds: ['v-01'],
        periods: [{ start: '2026-11-25T09:00:00+07:00', end: '2026-11-25T12:00:00+07:00' }],
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockDb.requests = [bookingReq];
    });

    it('Level 1: Staff signs and advances request to pending_l2', async () => {
      const res = await controller.sign(
        staff,
        bookingReq.id,
        {
          decision: 'approve',
          pin: '123456',
          signature: staff.signature!,
        },
        { token: 'staff-session-token' },
      );

      expect(res.status).toBe('pending_l2');
      expect(res.signatures.length).toBe(1);
      expect(res.signatures[0].level).toBe('staff');
      expect(res.signatures[0].decision).toBe('approve');
    });

    it('Level 2: Palad L2 signs and advances request to pending_l1', async () => {
      bookingReq.status = 'pending_l2';
      bookingReq.signatures.push({
        level: 'staff',
        round: 1,
        signerId: staff.id,
        signerName: staff.name,
        title: staff.position,
        decision: 'approve',
        signature: staff.signature!,
        at: new Date().toISOString(),
      });

      const res = await controller.sign(
        paladL2,
        bookingReq.id,
        {
          decision: 'approve',
          pin: '123456',
          signature: paladL2.signature!,
        },
        { token: 'palad-session-token' },
      );

      expect(res.status).toBe('pending_l1');
      expect(res.signatures.length).toBe(2);
      expect(res.signatures[1].level).toBe('l2');
    });

    it('Level 3: Nayok L1 signs, approves request, and completes approval', async () => {
      bookingReq.status = 'pending_l1';
      bookingReq.signatures.push(
        {
          level: 'staff',
          round: 1,
          signerId: staff.id,
          signerName: staff.name,
          title: staff.position,
          decision: 'approve',
          signature: staff.signature!,
          at: new Date().toISOString(),
        },
        {
          level: 'l2',
          round: 1,
          signerId: paladL2.id,
          signerName: paladL2.name,
          title: paladL2.position,
          decision: 'approve',
          signature: paladL2.signature!,
          at: new Date().toISOString(),
        },
      );

      const res = await controller.sign(
        nayokL1,
        bookingReq.id,
        {
          decision: 'approve',
          pin: '123456',
          signature: nayokL1.signature!,
        },
        { token: 'nayok-session-token' },
      );

      expect(res.status).toBe('approved');
      expect(res.signatures.length).toBe(3);
    });

    it('enforces SoD: prevents requester from signing their own request', async () => {
      bookingReq.requesterId = staff.id; // Staff created this booking
      await expect(
        controller.sign(
          staff,
          bookingReq.id,
          { decision: 'approve', pin: '123456', signature: staff.signature! },
          { token: 'staff-session' },
        ),
      ).rejects.toThrow(/Separation of Duties/);
    });

    it('rejects signing if Email OTP session is missing or expired', async () => {
      mockDb.getSignVerifiedSession.mockResolvedValue(null); // No verified session
      await expect(
        controller.sign(
          staff,
          bookingReq.id,
          { decision: 'approve', pin: '123456', signature: staff.signature! },
          { token: 'staff-session' },
        ),
      ).rejects.toThrow(/กรุณายืนยันตัวตนด้วยรหัส OTP/);
    });

    it('rejects signing if PIN is wrong', async () => {
      await expect(
        controller.sign(
          staff,
          bookingReq.id,
          { decision: 'approve', pin: '000000', signature: staff.signature! },
          { token: 'staff-session' },
        ),
      ).rejects.toThrow(/รหัส PIN ไม่ถูกต้อง/);
    });

    it('handles reject decision and sets request status to rejected', async () => {
      const res = await controller.sign(
        staff,
        bookingReq.id,
        {
          decision: 'reject',
          note: 'สถานที่ติดภารกิจด่วนของราชการ',
          pin: '123456',
          signature: staff.signature!,
        },
        { token: 'staff-session' },
      );

      expect(res.status).toBe('rejected');
      expect(res.rejectReason).toBe('สถานที่ติดภารกิจด่วนของราชการ');
    });
  });

  describe('Handover & Repair Status Operations', () => {
    it('handles handover before pickup and transitions to borrowing', async () => {
      const borrowReq: BorrowRequest = {
        id: 'r-br-01',
        code: 'BR-2569-0001',
        type: 'borrow',
        status: 'approved',
        approvalRound: 1,
        requesterId: citizen.id,
        requesterName: citizen.name,
        organization: citizen.department,
        requesterSignature: citizen.signature!,
        writtenAt: 'อบต.',
        purposeItems: ['ยืม'],
        purpose: 'ใช้งาน',
        pickupDate: '2026-11-20',
        returnDate: '2026-11-22',
        items: [{ equipmentId: 'e-01', qty: 2 }],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockDb.requests.push(borrowReq);

      const res = await controller.handover(staff, borrowReq.id, {
        phase: 'before',
        items: [{ label: 'ไมโครโฟนไร้สาย', ok: true }],
        citizenSignature: citizen.signature!,
        staffSignature: staff.signature!,
      });

      expect(res.status).toBe('borrowing');
      expect(mockDb.persistHandover).toHaveBeenCalled();
    });

    it('handles handover after return and transitions to returned', async () => {
      const borrowReq: BorrowRequest = {
        id: 'r-br-02',
        code: 'BR-2569-0002',
        type: 'borrow',
        status: 'return_inspect',
        approvalRound: 1,
        requesterId: citizen.id,
        requesterName: citizen.name,
        organization: citizen.department,
        requesterSignature: citizen.signature!,
        writtenAt: 'อบต.',
        purposeItems: ['ยืม'],
        purpose: 'ใช้งาน',
        pickupDate: '2026-11-20',
        returnDate: '2026-11-22',
        items: [{ equipmentId: 'e-01', qty: 2 }],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockDb.requests.push(borrowReq);

      const res = await controller.handover(staff, borrowReq.id, {
        phase: 'after',
        items: [{ label: 'ไมโครโฟนไร้สาย', ok: true }],
        citizenSignature: citizen.signature!,
        staffSignature: staff.signature!,
      });

      expect(res.status).toBe('returned');
    });

    it('handles repair status workflow (accept -> finish -> confirm)', async () => {
      const repairReq: RepairRequest = {
        id: 'r-rp-01',
        code: 'RP-2569-0001',
        type: 'repair',
        status: 'repair_submitted',
        requesterId: citizen.id,
        requesterName: citizen.name,
        phone: citizen.phone,
        location: 'ห้อง 1',
        detail: 'แอร์เสีย',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockDb.requests.push(repairReq);

      // Staff accepts
      const accepted = await controller.updateRepair(staff, repairReq.id, {
        action: 'accept',
        pin: '123456',
        signature: staff.signature!,
      });
      expect(accepted.status).toBe('repair_in_progress');

      // Staff finishes without signature, but with resolution and afterPhotos
      const finished = await controller.updateRepair(staff, repairReq.id, {
        action: 'finish',
        pin: '123456',
        resolution: 'เปลี่ยนคอมเพรสเซอร์เรียบร้อย',
        afterPhotos: ['data:image/png;base64,mockphoto'],
      });
      expect(finished.status).toBe('repair_awaiting_acceptance');
      expect(finished.resolution).toBe('เปลี่ยนคอมเพรสเซอร์เรียบร้อย');
      expect((finished as any).afterPhotos).toEqual(['data:image/png;base64,mockphoto']);

      // Citizen confirms
      const confirmed = await controller.updateRepair(citizen, repairReq.id, {
        action: 'confirm',
        signature: citizen.signature!,
      });
      expect(confirmed.status).toBe('repair_done');
    });
  });

  describe('Query & Search (GET /requests)', () => {
    it('filters requests by mine query for citizen', () => {
      const now = new Date().toISOString();
      mockDb.requests.push(
        { id: 'r-01', requesterId: citizen.id, type: 'booking', status: 'approved', venueIds: ['v-01'], periods: [], signatures: [], extraItems: [], updatedAt: now },
        { id: 'r-02', requesterId: 'other-user', type: 'booking', status: 'approved', venueIds: ['v-01'], periods: [], signatures: [], extraItems: [], updatedAt: now },
      );

      const list = controller.list(citizen, '1');
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('r-01');
    });

    it('filters requests by queue for staff review queue', () => {
      const now = new Date().toISOString();
      mockDb.requests.push(
        { id: 'r-staff', requesterId: citizen.id, type: 'booking', status: 'pending_staff', venueIds: ['v-01'], periods: [], signatures: [], extraItems: [], updatedAt: now },
        { id: 'r-l2', requesterId: citizen.id, type: 'booking', status: 'pending_l2', venueIds: ['v-01'], periods: [], signatures: [], extraItems: [], updatedAt: now },
      );

      const staffQueue = controller.list(staff, undefined, undefined, 'staff');
      expect(staffQueue.length).toBe(1);
      expect(staffQueue[0].id).toBe('r-staff');
    });

    it('retrieves single request by id with timeline', () => {
      const now = new Date().toISOString();
      mockDb.requests.push({
        id: 'r-get-one',
        code: 'BK-2569-0001',
        type: 'booking',
        status: 'pending_staff',
        requesterId: citizen.id,
        venueIds: ['v-01'],
        extraItems: [],
        periods: [],
        signatures: [],
        createdAt: now,
        updatedAt: now,
      });

      const req = controller.getOne(citizen, 'r-get-one');
      expect(req.id).toBe('r-get-one');
      expect(req.timeline).toBeDefined();
    });
  });

  describe('Equipment Receive, Return and Inspection Lifecycle', () => {
    it('confirms receipt of equipment and transitions status to borrowing', async () => {
      const now = new Date().toISOString();
      const borrowReq = {
        id: 'r-br-receive',
        code: 'BR-2569-0090',
        type: 'borrow' as const,
        status: 'approved' as const,
        requesterId: citizen.id,
        requesterName: citizen.name,
        items: [{ equipmentId: 'e-01', qty: 2 }],
        pickupDate: '2026-11-20',
        returnDate: '2026-11-25',
        purpose: 'จัดงานอบรม',
        attachments: [],
        signatures: [],
        createdAt: now,
        updatedAt: now,
      };
      mockDb.requests.push(borrowReq);

      const updated = await controller.receiveEquipment(citizen, 'r-br-receive', {
        photos: ['data:image/jpeg;base64,mock1'],
        note: 'อุปกรณ์ครบถ้วน ใช้งานได้ปกติ',
      });

      expect(updated.status).toBe('borrowing');
      expect((updated as any).receivedAt).toBeDefined();
      expect((updated as any).receivePhotos).toHaveLength(1);
      expect((updated as any).receiveNote).toBe('อุปกรณ์ครบถ้วน ใช้งานได้ปกติ');
      expect(mockDb.notifyRole).toHaveBeenCalledWith(
        'STAFF',
        expect.stringContaining('ผู้ยืมยืนยันรับมอบอุปกรณ์แล้ว'),
        expect.any(String),
        '/borrow/my',
      );
    });

    it('submits return of equipment and transitions status to return_inspect', async () => {
      const now = new Date().toISOString();
      const borrowReq = {
        id: 'r-br-return',
        code: 'BR-2569-0091',
        type: 'borrow' as const,
        status: 'borrowing' as const,
        requesterId: citizen.id,
        requesterName: citizen.name,
        items: [{ equipmentId: 'e-01', qty: 2 }],
        pickupDate: '2026-11-20',
        returnDate: '2026-11-25',
        purpose: 'จัดงานอบรม',
        attachments: [],
        signatures: [],
        createdAt: now,
        updatedAt: now,
      };
      mockDb.requests.push(borrowReq);

      const updated = await controller.submitReturn(citizen, 'r-br-return', {
        photos: ['data:image/jpeg;base64,mock-return'],
        note: 'นำอุปกรณ์มาส่งคืนครบถ้วน สภาพดี',
      });

      expect(updated.status).toBe('return_inspect');
      expect((updated as any).returnSubmittedAt).toBeDefined();
      expect((updated as any).returnPhotos).toHaveLength(1);
      expect(mockDb.notifyRole).toHaveBeenCalledWith(
        'STAFF',
        expect.stringContaining('ผู้ยืมส่งคืนอุปกรณ์แล้ว รอตรวจสภาพ'),
        expect.any(String),
        '/borrow/my',
      );
    });

    it('staff inspects returned equipment and transitions status to returned', async () => {
      const now = new Date().toISOString();
      const borrowReq = {
        id: 'r-br-inspect',
        code: 'BR-2569-0092',
        type: 'borrow' as const,
        status: 'return_inspect' as const,
        requesterId: citizen.id,
        requesterName: citizen.name,
        items: [{ equipmentId: 'e-01', qty: 2 }],
        pickupDate: '2026-11-20',
        returnDate: '2026-11-25',
        purpose: 'จัดงานอบรม',
        attachments: [],
        signatures: [],
        createdAt: now,
        updatedAt: now,
      };
      mockDb.requests.push(borrowReq);

      const updated = await controller.inspectReturn(staff, 'r-br-inspect', {
        result: 'normal',
        note: 'ตรวจรับคืนเรียบร้อย ไม่พบความเสียหาย',
        photos: ['data:image/jpeg;base64,mock-staff-inspect'],
      });

      expect(updated.status).toBe('returned');
      expect((updated as any).inspectedAt).toBeDefined();
      expect((updated as any).inspectorName).toBe(staff.name);
      expect((updated as any).inspectResult).toBe('normal');
      expect(mockDb.notify).toHaveBeenCalledWith(
        citizen.id,
        expect.stringContaining('ตรวจสอบการส่งคืนอุปกรณ์เรียบร้อยแล้ว'),
        expect.stringContaining('สภาพปกติ'),
        '/borrow/my',
      );
    });
  });
});
