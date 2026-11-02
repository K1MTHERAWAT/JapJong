import { describe, expect, it } from 'vitest';
import {
  canAccessRoute,
  canSignRequest,
  computeTimeline,
  describeRequest,
  hasPermission,
  overlaps,
  periodDurationText,
  withTimeline,
} from './logic';
import { Account, BookingRequest, BorrowRequest, Equipment, RepairRequest, Venue } from './types';

describe('Logic & Permissions Unit Tests', () => {
  const dummyStaff: Account = {
    id: 'u-staff',
    username: 'staff01',
    password: '',
    name: 'เจ้าหน้าที่ สมชาย',
    nickname: 'ชาย',
    initial: 'ช',
    role: 'STAFF',
    position: 'เจ้าหน้าที่',
    department: 'ฝ่ายบริหาร',
    phone: '081-111-1111',
    permissions: {
      review: true,
      handover: true,
      walkIn: true,
      manageResources: false,
      sign: false,
      manageUsers: false,
    },
    signature: null,
    pin: null,
    createdAt: new Date().toISOString(),
  };

  const dummyL2: Account = {
    id: 'u-palad',
    username: 'palad',
    password: '',
    name: 'ปลัด สมเกียรติ',
    nickname: 'เกียรติ',
    initial: 'ก',
    role: 'APPROVER_L2',
    position: 'ปลัด อบต.',
    department: 'สำนักปลัด',
    phone: '081-222-2222',
    permissions: {
      review: false,
      handover: false,
      walkIn: false,
      manageResources: false,
      sign: true,
      manageUsers: false,
    },
    signature: null,
    pin: null,
    createdAt: new Date().toISOString(),
  };

  const dummyL1: Account = {
    id: 'u-nayok',
    username: 'nayok',
    password: '',
    name: 'นายก ประเสริฐ',
    nickname: 'เสริฐ',
    initial: 'ป',
    role: 'APPROVER_L1',
    position: 'นายก อบต.',
    department: 'สำนักงานนายก',
    phone: '081-333-3333',
    permissions: {
      review: false,
      handover: false,
      walkIn: false,
      manageResources: false,
      sign: true,
      manageUsers: false,
    },
    signature: null,
    pin: null,
    createdAt: new Date().toISOString(),
  };

  const dummyAdmin: Account = {
    id: 'u-admin',
    username: 'admin',
    password: '',
    name: 'แอดมิน สูงสุด',
    nickname: 'มิน',
    initial: 'แ',
    role: 'ADMIN',
    position: 'ผู้ดูแลระบบ',
    department: 'กองช่าง / ศูนย์สารสนเทศ',
    phone: '081-999-9999',
    permissions: {
      review: true,
      handover: true,
      walkIn: true,
      manageResources: true,
      sign: true,
      manageUsers: true,
    },
    signature: null,
    pin: null,
    createdAt: new Date().toISOString(),
  };

  const dummyCitizen: Account = {
    id: 'u-citizen',
    username: 'citizen01',
    password: '',
    name: 'ประชาชน สมศักดิ์',
    nickname: 'ศักดิ์',
    initial: 'ส',
    role: 'USER',
    position: 'ประชาชน',
    department: 'หมู่ที่ 1 ตำบลน้ำชำ',
    phone: '081-000-0000',
    permissions: {
      review: false,
      handover: false,
      walkIn: false,
      manageResources: false,
      sign: false,
      manageUsers: false,
    },
    signature: null,
    pin: null,
    createdAt: new Date().toISOString(),
  };

  const dummyVenues: Venue[] = [
    {
      id: 'v-01',
      name: 'หอประชุมใหญ่',
      type: 'meeting',
      building: 'อาคาร 1',
      floor: 'ชั้น 1',
      capacity: 200,
      status: 'available',
      enabled: true,
      facilities: ['แอร์', 'โปรเจกเตอร์'],
      openTime: '08:30',
      closeTime: '16:30',
      openDays: [1, 2, 3, 4, 5],
      advanceDays: 3,
      formName: 'แบบขอใช้สถานที่',
      approvalLevels: 3,
    },
  ];

  const dummyEquipment: Equipment[] = [
    {
      id: 'e-01',
      name: 'ไมโครโฟนไร้สาย',
      category: 'audio',
      stock: 10,
      enabled: true,
    },
    {
      id: 'e-02',
      name: 'เต็นท์โค้งขนาดใหญ่',
      category: 'tent',
      stock: 5,
      enabled: true,
    },
  ];

  describe('overlaps()', () => {
    it('detects overlapping date ranges correctly', () => {
      const a = { start: '2026-10-25T09:00:00Z', end: '2026-10-25T12:00:00Z' };
      const b = { start: '2026-10-25T11:00:00Z', end: '2026-10-25T14:00:00Z' };
      expect(overlaps(a, b)).toBe(true);
    });

    it('returns false for adjacent non-overlapping ranges', () => {
      const a = { start: '2026-10-25T09:00:00Z', end: '2026-10-25T12:00:00Z' };
      const b = { start: '2026-10-25T12:00:00Z', end: '2026-10-25T15:00:00Z' };
      expect(overlaps(a, b)).toBe(false);
    });

    it('returns false for completely disjoint ranges', () => {
      const a = { start: '2026-10-25T09:00:00Z', end: '2026-10-25T12:00:00Z' };
      const b = { start: '2026-10-26T09:00:00Z', end: '2026-10-26T12:00:00Z' };
      expect(overlaps(a, b)).toBe(false);
    });
  });

  describe('periodDurationText()', () => {
    it('formats single day hours', () => {
      const p = { start: '2026-10-25T09:00:00Z', end: '2026-10-25T13:00:00Z' };
      const txt = periodDurationText(p);
      expect(txt).toContain('ชม.');
    });

    it('formats multi-day duration', () => {
      const p = { start: '2026-10-20T08:00:00Z', end: '2026-10-22T08:00:00Z' };
      const txt = periodDurationText(p);
      expect(txt).toContain('วัน');
    });
  });

  describe('hasPermission()', () => {
    it('allows permitted action', () => {
      expect(hasPermission(dummyStaff, 'review')).toBe(true);
      expect(hasPermission(dummyStaff, 'handover')).toBe(true);
    });

    it('denies unpermitted action', () => {
      expect(hasPermission(dummyStaff, 'sign')).toBe(false);
      expect(hasPermission(dummyStaff, 'manageUsers')).toBe(false);
    });

    it('returns false for null or undefined account', () => {
      expect(hasPermission(null, 'review')).toBe(false);
      expect(hasPermission(undefined, 'review')).toBe(false);
    });
  });

  describe('canSignRequest() with Separation of Duties (SoD)', () => {
    const pendingStaffRequest: Partial<BookingRequest> = {
      id: 'r-001',
      type: 'booking',
      status: 'pending_staff',
      requesterId: 'u-citizen',
      signatures: [],
    };

    it('allows authorized staff to sign pending_staff request', () => {
      const check = canSignRequest(dummyStaff, pendingStaffRequest as BookingRequest);
      expect(check.allowed).toBe(true);
      expect(check.expectedLevel).toBe('staff');
    });

    it('denies user without review permission from signing pending_staff', () => {
      const staffNoPerm = { ...dummyStaff, permissions: { ...dummyStaff.permissions, review: false } };
      const check = canSignRequest(staffNoPerm, pendingStaffRequest as BookingRequest);
      expect(check.allowed).toBe(false);
    });

    it('allows L2 approver to sign pending_l2', () => {
      const req: Partial<BookingRequest> = {
        id: 'r-002',
        type: 'booking',
        status: 'pending_l2',
        requesterId: 'u-citizen',
        signatures: [{ signerId: 'u-staff', decision: 'approve' }],
      };
      const check = canSignRequest(dummyL2, req as BookingRequest);
      expect(check.allowed).toBe(true);
      expect(check.expectedLevel).toBe('l2');
    });

    it('allows L1 approver to sign pending_l1', () => {
      const req: Partial<BookingRequest> = {
        id: 'r-003',
        type: 'booking',
        status: 'pending_l1',
        requesterId: 'u-citizen',
        signatures: [
          { signerId: 'u-staff', decision: 'approve' },
          { signerId: 'u-palad', decision: 'approve' },
        ],
      };
      const check = canSignRequest(dummyL1, req as BookingRequest);
      expect(check.allowed).toBe(true);
      expect(check.expectedLevel).toBe('l1');
    });

    it('enforces SoD: prevents requester from signing their own request', () => {
      const check = canSignRequest(dummyStaff, {
        ...pendingStaffRequest,
        requesterId: dummyStaff.id,
      } as BookingRequest);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Separation of Duties');
    });

    it('enforces SoD: prevents signer from approving again across levels in the same request', () => {
      const reqWithPreviousStaffApproval: Partial<BookingRequest> = {
        id: 'r-004',
        type: 'booking',
        status: 'pending_l2',
        requesterId: 'u-citizen',
        signatures: [{ signerId: dummyL2.id, decision: 'approve' }],
      };
      const check = canSignRequest(dummyL2, reqWithPreviousStaffApproval as BookingRequest);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Separation of Duties');
    });

    it('denies signing for repair requests', () => {
      const repairReq: Partial<RepairRequest> = {
        id: 'r-rep',
        type: 'repair',
        status: 'repair_submitted',
        requesterId: 'u-citizen',
      };
      const check = canSignRequest(dummyStaff, repairReq as RepairRequest);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('แจ้งซ่อมไม่ต้องลงนาม');
    });

    it('denies signing when request is not in a signable status (e.g. approved)', () => {
      const approvedReq: Partial<BookingRequest> = {
        id: 'r-app',
        type: 'booking',
        status: 'approved',
        requesterId: 'u-citizen',
      };
      const check = canSignRequest(dummyStaff, approvedReq as BookingRequest);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ไม่ได้อยู่ในสถานะรอลงนาม');
    });

    it('denies signing when account is null or undefined', () => {
      const check = canSignRequest(null, pendingStaffRequest as BookingRequest);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('กรุณาเข้าสู่ระบบ');
    });
  });

  describe('canAccessRoute() RBAC Matrix', () => {
    it('allows public routes (/login, /register) for anyone', () => {
      expect(canAccessRoute(null, '/login').allowed).toBe(true);
      expect(canAccessRoute(null, '/register').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/login').allowed).toBe(true);
    });

    it('denies unauthenticated user for protected routes', () => {
      const res = canAccessRoute(null, '/booking');
      expect(res.allowed).toBe(false);
      expect(res.title).toBe('ต้องเข้าสู่ระบบ');
    });

    it('checks /admin/permissions access', () => {
      expect(canAccessRoute(dummyAdmin, '/admin/permissions').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/admin/permissions').allowed).toBe(false);
      expect(canAccessRoute(dummyStaff, '/admin/permissions').allowed).toBe(false);
    });

    it('checks /admin/resources access', () => {
      expect(canAccessRoute(dummyAdmin, '/admin/resources').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/admin/resources').allowed).toBe(false);
      const staffWithRes = { ...dummyStaff, permissions: { ...dummyStaff.permissions, manageResources: true } };
      expect(canAccessRoute(staffWithRes, '/admin/resources').allowed).toBe(true);
    });

    it('checks /admin home dashboard access', () => {
      expect(canAccessRoute(dummyAdmin, '/admin').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/admin').allowed).toBe(false);
    });

    it('checks /staff/review access', () => {
      expect(canAccessRoute(dummyStaff, '/staff/review').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/staff/review').allowed).toBe(false);
    });

    it('checks /staff/handover access', () => {
      expect(canAccessRoute(dummyStaff, '/staff/handover').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/staff/handover').allowed).toBe(false);
    });

    it('checks /staff/walk-in access', () => {
      expect(canAccessRoute(dummyStaff, '/staff/walk-in').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/staff/walk-in').allowed).toBe(false);
    });

    it('checks /staff/verify access', () => {
      expect(canAccessRoute(dummyStaff, '/staff/verify').allowed).toBe(true);
      expect(canAccessRoute(dummyAdmin, '/staff/verify').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/staff/verify').allowed).toBe(false);
    });

    it('checks /staff general portal access', () => {
      expect(canAccessRoute(dummyStaff, '/staff').allowed).toBe(true);
      expect(canAccessRoute(dummyAdmin, '/staff').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/staff').allowed).toBe(false);
    });

    it('checks /approver/settings access', () => {
      expect(canAccessRoute(dummyL2, '/approver/settings').allowed).toBe(true);
      expect(canAccessRoute(dummyL1, '/approver/settings').allowed).toBe(true);
      expect(canAccessRoute(dummyStaff, '/approver/settings').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/approver/settings').allowed).toBe(false);
    });

    it('allows permit viewing (/approver/permit/[id]) for authenticated users', () => {
      expect(canAccessRoute(dummyCitizen, '/approver/permit/r-01').allowed).toBe(true);
      expect(canAccessRoute(dummyStaff, '/approver/permit/r-01').allowed).toBe(true);
    });

    it('checks /approver queue access', () => {
      expect(canAccessRoute(dummyL2, '/approver').allowed).toBe(true);
      expect(canAccessRoute(dummyL1, '/approver').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/approver').allowed).toBe(false);
    });

    it('allows general authenticated routes (/booking, /borrow, /history, /account)', () => {
      expect(canAccessRoute(dummyCitizen, '/booking').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/borrow').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/borrow/my').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/history').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/account').allowed).toBe(true);
      expect(canAccessRoute(dummyCitizen, '/').allowed).toBe(true);
    });
  });

  describe('describeRequest() and computeTimeline()', () => {
    const bookingReq: BookingRequest = {
      id: 'b-01',
      code: 'BK-2569-0001',
      type: 'booking',
      status: 'pending_staff',
      approvalRound: 1,
      requesterId: 'u-citizen',
      requesterName: 'สมชาย ใจดี',
      organization: 'กองทุนหมู่บ้าน',
      requesterSignature: 'data:image/png;base64,...',
      writtenAt: 'อบต.น้ำชำ',
      purposeItems: ['ประชุม'],
      purpose: 'จัดประชุมสมาชิก',
      activity: 'ประชุมประจำปี',
      attendees: 50,
      venueIds: ['v-01'],
      periods: [{ start: '2026-10-25T09:00:00+07:00', end: '2026-10-25T12:00:00+07:00' }],
      extraItems: [{ equipmentId: 'e-01', qty: 2 }],
      signatures: [],
      createdAt: '2026-10-20T09:00:00+07:00',
      updatedAt: '2026-10-20T09:00:00+07:00',
    };

    const borrowReq: BorrowRequest = {
      id: 'br-01',
      code: 'BR-2569-0001',
      type: 'borrow',
      status: 'borrowing',
      approvalRound: 1,
      requesterId: 'u-citizen',
      requesterName: 'สมชาย ใจดี',
      organization: 'กองทุนหมู่บ้าน',
      requesterSignature: 'data:image/png;base64,...',
      writtenAt: 'อบต.น้ำชำ',
      purposeItems: ['งานบุญ'],
      purpose: 'จัดงานประเพณี',
      pickupDate: '2026-11-01',
      returnDate: '2026-11-03',
      items: [{ equipmentId: 'e-01', qty: 2 }],
      signatures: [
        { level: 'staff', round: 1, signerId: 'u-staff', signerName: 'สมชาย', decision: 'approve', signature: 'sig', at: '2026-10-21T09:00:00+07:00' },
        { level: 'l2', round: 1, signerId: 'u-palad', signerName: 'ปลัด', decision: 'approve', signature: 'sig', at: '2026-10-22T09:00:00+07:00' },
        { level: 'l1', round: 1, signerId: 'u-nayok', signerName: 'นายก', decision: 'approve', signature: 'sig', at: '2026-10-23T09:00:00+07:00' },
      ],
      createdAt: '2026-10-20T09:00:00+07:00',
      updatedAt: '2026-10-23T09:00:00+07:00',
    };

    const repairReq: RepairRequest = {
      id: 'rp-01',
      code: 'RP-2569-0001',
      type: 'repair',
      status: 'repair_submitted',
      requesterId: 'u-citizen',
      requesterName: 'สมชาย ใจดี',
      phone: '081-000-0000',
      location: 'ห้องประชุม 2',
      detail: 'เครื่องปรับอากาศไม่เย็น มีน้ำหยด',
      createdAt: '2026-10-20T09:00:00+07:00',
      updatedAt: '2026-10-20T09:00:00+07:00',
    };

    it('describes booking request with venues and extras', () => {
      const desc = describeRequest(bookingReq, dummyVenues, dummyEquipment);
      expect(desc.title).toContain('หอประชุมใหญ่');
      expect(desc.subtitle).toContain('ไมโครโฟนไร้สาย 2');
    });

    it('describes borrow request with equipment items', () => {
      const desc = describeRequest(borrowReq, dummyVenues, dummyEquipment);
      expect(desc.title).toContain('ไมโครโฟนไร้สาย ×2');
      expect(desc.subtitle).toBe('จัดงานประเพณี');
    });

    it('describes repair request with detail and location', () => {
      const desc = describeRequest(repairReq, dummyVenues, dummyEquipment);
      expect(desc.title).toContain('เครื่องปรับอากาศไม่เย็น');
      expect(desc.subtitle).toBe('ห้องประชุม 2');
    });

    it('computes timeline for booking with pending steps', () => {
      const timeline = computeTimeline(bookingReq);
      expect(timeline.length).toBeGreaterThanOrEqual(4);
      expect(timeline[0].key).toBe('submit');
      expect(timeline[0].state).toBe('done');
    });

    it('computes timeline for cancelled request', () => {
      const cancelledReq: BookingRequest = { ...bookingReq, status: 'cancelled' };
      const timeline = computeTimeline(cancelledReq);
      const lastStep = timeline[timeline.length - 1];
      expect(lastStep.key).toBe('cancel');
      expect(lastStep.state).toBe('rejected');
    });

    it('computes timeline for borrow request with pickup and return steps', () => {
      const timeline = computeTimeline(borrowReq);
      const keys = timeline.map((t) => t.key);
      expect(keys).toContain('pickup');
      expect(keys).toContain('return');
    });

    it('computes timeline for repair request with repair steps', () => {
      const timeline = computeTimeline(repairReq);
      const keys = timeline.map((t) => t.key);
      expect(keys).toEqual(['submit', 'accept', 'fix', 'check']);
    });

    it('withTimeline combines request with description and timeline', () => {
      const full = withTimeline(bookingReq, dummyVenues, dummyEquipment);
      expect(full.timeline).toBeDefined();
      expect(full.title).toBeDefined();
    });
  });
});
