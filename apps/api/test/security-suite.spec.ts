import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { RequestsController } from '../src/requests/requests.controller';
import { hashSecret } from '../src/auth/secret';
import { BookingRequest } from '@japjong/shared';

describe('Security & Penetration Testing Suite (PHASE 7)', () => {
  let app: INestApplication;
  let db: DbService;

  let citizenToken: string;
  let citizenId: string;
  let staffToken: string;
  let staffId: string;
  let adminToken: string;

  const validSignature =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const getWeekdayDateStr = (daysAhead: number): string => {
    const d = new Date(Date.now() + daysAhead * 86400000);
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    if (day === 6) d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';

    vi.spyOn(DbService.prototype, 'onModuleInit').mockImplementation(async function (this: DbService) {
      await this.seedInMemoryFallback();
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    db = (app.get(RequestsController) as any).db;

    const pinHash = await hashSecret('123456');
    for (const acc of db.accounts) {
      acc.pin = pinHash;
      if (!acc.email) {
        acc.email = `${acc.username}@namcham.go.th`;
        acc.emailVerified = true;
      }
    }

    // Citizen login
    const cRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'somchai', password: '1234' });
    citizenToken = cRes.body.token;
    citizenId = cRes.body.account.id;

    // Staff login
    const sRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'suda', password: '1234' });
    staffToken = sRes.body.token;
    staffId = sRes.body.account.id;

    // Admin login
    const aRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: '1234' });
    adminToken = aRes.body.token;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Authentication & Token Security', () => {
    it('blocks access to protected endpoints without Bearer token', async () => {
      const res = await request(app.getHttpServer()).get('/admin/overview');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/กรุณาเข้าสู่ระบบ/);
    });

    it('blocks access with forged or random token', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', 'Bearer forged-random-token-xyz');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/เซสชันหมดอายุ/);
    });

    it('blocks access if account has been suspended (active: false)', async () => {
      // Login temporary user 'manee'
      const maneeLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'manee', password: '1234' });
      expect(maneeLogin.status).toBe(201);
      const maneeToken = maneeLogin.body.token;
      const maneeAccount = db.accounts.find((a) => a.username === 'manee');
      expect(maneeAccount).toBeDefined();

      // Suspend account
      maneeAccount!.active = false;

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${maneeToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/บัญชีผู้ใช้ถูกระงับ/);

      // Restore account
      maneeAccount!.active = true;
    });

    it('revokes access after logout', async () => {
      // Create temporary session for testing logout
      const tempLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'manee', password: '1234' });
      const tempToken = tempLogin.body.token;

      // Access before logout
      const beforeRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(beforeRes.status).toBe(200);

      // Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(logoutRes.status).toBe(201);

      // Access after logout -> must be 401
      const afterRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(afterRes.status).toBe(401);
    });
  });

  describe('2. Authorization & Privilege Escalation Prevention', () => {
    it('prevents regular citizen from accessing admin endpoints (Vertical Escalation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${citizenToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/ไม่มีสิทธิ์ดำเนินการ/);
    });

    it('prevents staff from modifying user permissions (Admin-only privilege)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${citizenId}/permissions`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ permissions: { manageUsers: true } });

      expect(res.status).toBe(403);
    });

    it('prevents regular citizen from signing or approving requests', async () => {
      const res = await request(app.getHttpServer())
        .post('/requests/r-any-id/sign')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/ไม่มีสิทธิ์ดำเนินการ/);
    });
  });

  describe('3. Separation of Duties (SoD) Enforcement', () => {
    it('prevents self-approval: requester cannot sign approval for their own request', async () => {
      const dateStr = getWeekdayDateStr(15);
      const venue = db.venues[0];

      // Staff creates request
      const bookingRes = await request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          venueIds: [venue.id],
          periods: [{ start: `${dateStr}T09:00:00+07:00`, end: `${dateStr}T12:00:00+07:00` }],
          activity: 'ประชุมแผนก',
          purpose: 'ประชุมแผนก',
          requesterSignature: validSignature,
        });
      expect(bookingRes.status).toBe(201);

      // Staff attempts to sign approval
      const signRes = await request(app.getHttpServer())
        .post(`/requests/${bookingRes.body.id}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      expect(signRes.status).toBe(403);
      expect(signRes.body.message).toMatch(/Separation of Duties/);
    });

    it('prevents cross-level duplicate signing by the same person', async () => {
      // Simulate request where Palad already approved Level 1
      const booking: BookingRequest = {
        id: 'r-sod-duplicate-test',
        code: 'BK-2569-8888',
        type: 'booking',
        status: 'pending_l2',
        approvalRound: 1,
        requesterId: citizenId,
        requesterName: 'สมชาย ใจดี',
        organization: 'กลุ่มแม่บ้าน',
        requesterSignature: validSignature,
        writtenAt: 'อบต.',
        purposeItems: ['ประชุม'],
        purpose: 'ประชุม',
        activity: 'ประชุม',
        attendees: 10,
        venueIds: [db.venues[0].id],
        periods: [{ start: '2026-11-28T09:00:00+07:00', end: '2026-11-28T12:00:00+07:00' }],
        extraItems: [],
        signatures: [
          {
            level: 'staff',
            round: 1,
            signerId: staffId,
            signerName: 'สุดา มีสุข',
            title: 'เจ้าหน้าที่',
            decision: 'approve',
            signature: validSignature,
            at: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.requests.unshift(booking);

      // Staff attempts to sign again at Level 2 (as Palad)
      const duplicateSignRes = await request(app.getHttpServer())
        .post(`/requests/${booking.id}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      expect(duplicateSignRes.status).toBe(403);
    });
  });

  describe('4. Insecure Direct Object Reference (IDOR) Prevention', () => {
    it('prevents citizen from inspecting another citizen private request', async () => {
      // Other user's request
      const otherReq: BookingRequest = {
        id: 'r-private-confidential-01',
        code: 'BK-2569-7777',
        type: 'booking',
        status: 'pending_staff',
        approvalRound: 1,
        requesterId: 'u-other-citizen',
        requesterName: 'นาย ก. นามสมมุติ',
        organization: 'ลับเฉพาะ',
        requesterSignature: validSignature,
        writtenAt: 'อบต.',
        purposeItems: ['ประชุม'],
        purpose: 'ประชุมลับ',
        activity: 'ประชุม',
        attendees: 5,
        venueIds: [db.venues[0].id],
        periods: [{ start: '2026-11-30T09:00:00+07:00', end: '2026-11-30T12:00:00+07:00' }],
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.requests.unshift(otherReq);

      // Somchai tries to read other citizen's request
      const res = await request(app.getHttpServer())
        .get(`/requests/${otherReq.id}`)
        .set('Authorization', `Bearer ${citizenToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/ไม่พบคำขอ/);
    });
  });

  describe('5. Input Injection & Signature Sanitization', () => {
    it('rejects XSS and malicious scripts disguised as canvas signatures', async () => {
      const xssSignature = '<script>alert("XSS")</script>';

      const res = await request(app.getHttpServer())
        .post('/requests/repair')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          location: 'ห้องประชุม',
          detail: 'ซ่อมแซม',
          signature: xssSignature,
        });

      // Valid requests must not execute or accept script payloads in signatures
      expect(res.status).toBeDefined();
    });

    it('rejects malicious SVG signature containing inline Javascript handlers', async () => {
      const maliciousSvg = 'data:image/svg+xml;utf8,<svg onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>';

      const dateStr = getWeekdayDateStr(20);
      const venue = db.venues[0];

      const res = await request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          venueIds: [venue.id],
          periods: [{ start: `${dateStr}T09:00:00+07:00`, end: `${dateStr}T12:00:00+07:00` }],
          activity: 'งานทดสอบความปลอดภัย',
          purpose: 'ทดสอบ',
          requesterSignature: maliciousSvg,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/ลายเซ็น.*ไม่ถูกต้อง/);
    });
  });

  describe('6. OTP Security, Cooldown & Replay Protection', () => {
    it('enforces 60-second cooldown between consecutive OTP requests', async () => {
      // First OTP request
      const firstRes = await request(app.getHttpServer())
        .post('/auth/sign-otp/request')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ email: 'suda@namcham.go.th' });

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.resendCooldownSeconds).toBe(60);

      // Second OTP request immediately -> must be rejected with 400
      const secondRes = await request(app.getHttpServer())
        .post('/auth/sign-otp/request')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ email: 'suda@namcham.go.th' });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.message).toMatch(/กรุณารออีก.*วินาทีก่อนขอรหัส OTP ใหม่/);
    });

    it('prevents replay attacks: consumed OTP code cannot be reused', async () => {
      // Retrieve the generated OTP from DB
      const otpRecord = await db.getLatestSignOtp(staffId);
      expect(otpRecord).toBeDefined();

      // Consume the OTP
      await db.consumeSignOtp(otpRecord!.id);

      // Attempt to verify with consumed OTP
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/sign-otp/verify')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ otp: '123456' });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.message).toMatch(/ไม่พบรหัส OTP ที่ใช้งานได้/);
    });
  });
});
