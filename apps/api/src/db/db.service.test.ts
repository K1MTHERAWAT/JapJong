import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DbService } from './db.service';
import { Account, BookingRequest, HandoverRecord } from '@jongwen/shared';

describe('DbService (Unit & In-Memory Storage Engine)', () => {
  let db: DbService;

  beforeEach(async () => {
    // Disable external DB for unit tests to test the storage engine logic reliably
    process.env.DEMO_MODE = 'true';
    db = new DbService();
    // Simulate fallback mode without connecting to live Supabase during unit tests
    await db.seedInMemoryFallback();
  });

  afterEach(() => {
    db.onModuleDestroy();
  });

  describe('Seeding & In-Memory State', () => {
    it('seeds mock accounts, venues, and equipment in fallback mode', () => {
      expect(db.accounts.length).toBeGreaterThan(0);
      expect(db.venues.length).toBeGreaterThan(0);
      expect(db.equipment.length).toBeGreaterThan(0);

      // Verify passwords and PINs are hashed
      const admin = db.accounts.find((a) => a.role === 'ADMIN');
      expect(admin).toBeDefined();
      expect(admin?.password.startsWith('$argon2')).toBe(true);
      if (admin?.pin) {
        expect(admin.pin.startsWith('$argon2')).toBe(true);
      }
    });

    it('converts account to public format omitting sensitive fields', () => {
      const admin = db.accounts.find((a) => a.role === 'ADMIN');
      expect(admin).toBeDefined();
      const pub = db.toPublic(admin!);
      expect((pub as any).password).toBeUndefined();
      expect((pub as any).pin).toBeUndefined();
      expect(pub.id).toBe(admin?.id);
      expect(pub.hasPin).toBe(true);
    });
  });

  describe('Sequence Generation (nextCode)', () => {
    it('generates sequential code for booking (BK)', async () => {
      const code1 = await db.nextCode('BK');
      const code2 = await db.nextCode('BK');
      expect(code1).toMatch(/^BK-\d{4}-\d{4}$/);
      expect(code2).toMatch(/^BK-\d{4}-\d{4}$/);
      expect(code1).not.toBe(code2);
    });

    it('generates sequential code for borrow (BR)', async () => {
      const code1 = await db.nextCode('BR');
      expect(code1).toMatch(/^BR-\d{4}-\d{4}$/);
    });

    it('generates sequential code for repair (RP)', async () => {
      const code1 = await db.nextCode('RP');
      expect(code1).toMatch(/^RP-\d{4}-\d{4}$/);
    });
  });

  describe('Requests & Handovers Persistence', () => {
    it('persists and updates requests in memory', async () => {
      const testReq: BookingRequest = {
        id: 'r-test-booking-1',
        code: 'BK-2569-9001',
        type: 'booking',
        status: 'pending_staff',
        approvalRound: 1,
        requesterId: 'u-citizen',
        requesterName: 'ประชาชน ทดสอบ',
        organization: 'ชุมชน 1',
        requesterSignature: 'sig',
        writtenAt: 'อบต.',
        purposeItems: ['ประชุม'],
        purpose: 'ประชุมงาน',
        activity: 'ประชุม',
        attendees: 20,
        venueIds: ['v-01'],
        periods: [{ start: '2026-11-20T09:00:00+07:00', end: '2026-11-20T12:00:00+07:00' }],
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.requests.unshift(testReq);
      await db.persistRequest(testReq);
      expect(db.requests.some((r) => r.id === testReq.id)).toBe(true);

      // Update status
      testReq.status = 'approved';
      await db.persistRequest(testReq);
      const found = db.requests.find((r) => r.id === testReq.id);
      expect(found?.status).toBe('approved');
    });

    it('persists handover records', async () => {
      const handover: HandoverRecord = {
        requestId: 'r-test-1',
        phase: 'before',
        items: [{ label: 'โปรเจคเตอร์', ok: true }],
        note: 'สภาพสมบูรณ์',
        at: new Date().toISOString(),
        staffId: 'u-staff',
        staffName: 'เจ้าหน้าที่',
        citizenSignature: 'sig1',
        staffSignature: 'sig2',
      };

      db.handovers.push(handover);
      await db.persistHandover(handover);
      expect(db.handovers.length).toBe(1);
      expect(db.handovers[0].requestId).toBe('r-test-1');
    });
  });

  describe('Account Management', () => {
    it('persists new account and updates existing account', async () => {
      const newAcc: Account = {
        id: 'u-custom-01',
        username: 'customuser',
        password: 'hashed-password',
        name: 'สมศรี มีทรัพย์',
        nickname: 'ศรี',
        initial: 'ส',
        role: 'STAFF',
        position: 'นักวิชาการ',
        department: 'กองการศึกษา',
        phone: '0812223344',
        permissions: { review: true, handover: false, walkIn: false, manageResources: false, sign: false, manageUsers: false },
        createdAt: new Date().toISOString(),
      };

      db.accounts.push(newAcc);
      await db.persistAccount(newAcc);
      expect(db.accounts.some((a) => a.id === newAcc.id)).toBe(true);

      // Update position
      newAcc.position = 'ผู้อำนวยการกอง';
      await db.persistAccount(newAcc);
      const updated = db.accounts.find((a) => a.id === newAcc.id);
      expect(updated?.position).toBe('ผู้อำนวยการกอง');
    });

    it('updates account active status (suspend/activate)', async () => {
      const acc: Account = {
        id: 'u-toggle-active',
        username: 'toggleme',
        password: 'hashed-password',
        name: 'ทดสอบ ระงับ',
        nickname: 'ระงับ',
        initial: 'ท',
        role: 'USER',
        position: 'ประชาชน',
        department: 'ประชาชน',
        phone: '0899999999',
        active: true,
        permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: false, manageUsers: false },
        createdAt: new Date().toISOString(),
      };

      db.accounts.push(acc);
      await db.persistAccount(acc);
      expect(db.accounts.find((a) => a.id === acc.id)?.active).toBe(true);

      // Deactivate
      acc.active = false;
      await db.persistAccount(acc);
      expect(db.accounts.find((a) => a.id === acc.id)?.active).toBe(false);
    });
  });

  describe('Email OTP for Signing Workflow', () => {
    it('creates and retrieves the latest OTP record', async () => {
      const accountId = 'u-staff-01';
      const email = 'staff@namcham.go.th';
      const codeHash = 'hash-of-123456';
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const created = await db.createSignOtp(accountId, email, codeHash, expiresAt);
      expect(created.id).toBeDefined();
      expect(created.accountId).toBe(accountId);
      expect(created.email).toBe(email);
      expect(created.attempts).toBe(0);

      const latest = await db.getLatestSignOtp(accountId);
      expect(latest?.id).toBe(created.id);
      expect(latest?.codeHash).toBe(codeHash);
    });

    it('records sign OTP attempts and consumes OTP', async () => {
      const accountId = 'u-staff-02';
      const created = await db.createSignOtp(accountId, 'staff@test.com', 'hash', new Date(Date.now() + 300000));

      await db.recordSignOtpAttempt(created.id, 2);
      let latest = await db.getLatestSignOtp(accountId);
      expect(latest?.attempts).toBe(2);

      await db.consumeSignOtp(created.id);
      latest = await db.getLatestSignOtp(accountId);
      expect(latest?.consumedAt).not.toBeNull();
    });
  });

  describe('Verified Signing Sessions Workflow', () => {
    it('creates, retrieves, and checks validity of signing session', async () => {
      const accountId = 'u-approver-l1';
      const token = 'session-token-abc-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const session = await db.createSignVerifiedSession(accountId, token, expiresAt);
      expect(session.id).toBeDefined();
      expect(session.sessionToken).toBe(token);

      const active = await db.getSignVerifiedSession(accountId, token);
      expect(active).not.toBeNull();
      expect(active?.accountId).toBe(accountId);
    });

    it('revokes signing session by session token', async () => {
      const accountId = 'u-approver-l2';
      const token = 'token-to-revoke';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.createSignVerifiedSession(accountId, token, expiresAt);
      await db.revokeSignVerifiedSession(token);

      const active = await db.getSignVerifiedSession(accountId, token);
      expect(active).toBeNull();
    });

    it('revokes signing session by account ID (e.g. on logout)', async () => {
      const accountId = 'u-approver-l2';
      const token = 'token-to-revoke-by-account';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.createSignVerifiedSession(accountId, token, expiresAt);
      await db.revokeSignVerifiedSessionByAccount(accountId);

      const active = await db.getSignVerifiedSession(accountId, token);
      expect(active).toBeNull();
    });
  });

  describe('Notifications & Activity Logging', () => {
    it('pushes notification to specific user', async () => {
      const initialNotifs = db.notifications.length;
      await db.notify('u-citizen-01', 'หัวข้อแจ้งเตือน', 'เนื้อหารายละเอียด', '/requests/1');
      expect(db.notifications.length).toBe(initialNotifs + 1);
      expect(db.notifications[0].userId).toBe('u-citizen-01');
      expect(db.notifications[0].title).toBe('หัวข้อแจ้งเตือน');
    });

    it('broadcasts notification to specific role', async () => {
      const beforeStaffNotifs = db.notifications.filter((n) => n.title === 'งานใหม่').length;
      db.notifyRole('STAFF', 'งานใหม่', 'มีคำขอรอการตรวจสอบ', '/staff/queue');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const staffMembers = db.accounts.filter((a) => a.role === 'STAFF');
      const afterStaffNotifs = db.notifications.filter((n) => n.title === 'งานใหม่').length;
      expect(afterStaffNotifs - beforeStaffNotifs).toBe(staffMembers.length);
    });

    it('records activity log', async () => {
      const initialActivities = db.activities.length;
      await db.log('auth', 'เข้าสู่ระบบสำเร็จ', 'ผู้ใช้เข้าสู่ระบบผ่าน Web', {
        id: 'u-01',
        name: 'ทดสอบ',
        role: 'STAFF',
      });
      expect(db.activities.length).toBe(initialActivities + 1);
      expect(db.activities[0].title).toBe('เข้าสู่ระบบสำเร็จ');
      expect(db.activities[0].kind).toBe('auth');
    });
  });
});
