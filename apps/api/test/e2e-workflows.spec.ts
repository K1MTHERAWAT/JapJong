import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { RequestsController } from '../src/requests/requests.controller';
import { hashSecret } from '../src/auth/secret';

describe('End-to-End System Workflows (E2E)', () => {
  let app: INestApplication;
  let db: DbService;

  const validSignature =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Tokens for actors
  let citizenToken: string;
  let citizenId: string;
  let staffToken: string;
  let staffId: string;
  let paladToken: string;
  let paladId: string;
  let nayokToken: string;
  let nayokId: string;
  let adminToken: string;

  const getWeekdayDateStr = (daysAhead: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    if (day === 6) d.setDate(d.getDate() + 2);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

    // Ensure staff, palad, nayok have emails and known PIN hashes
    const pinHash = await hashSecret('123456');
    for (const acc of db.accounts) {
      acc.pin = pinHash;
      if (!acc.email) {
        acc.email = `${acc.username}@namcham.go.th`;
        acc.emailVerified = true;
      }
    }

    // Login Citizen
    const citizenRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'somchai', password: '1234' });
    expect(citizenRes.status).toBe(201);
    citizenToken = citizenRes.body.token;
    citizenId = citizenRes.body.account.id;

    // Login Staff
    const staffRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'suda', password: '1234' });
    expect(staffRes.status).toBe(201);
    staffToken = staffRes.body.token;
    staffId = staffRes.body.account.id;

    // Login Palad L2
    const paladRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'wichai', password: '1234' });
    expect(paladRes.status).toBe(201);
    paladToken = paladRes.body.token;
    paladId = paladRes.body.account.id;

    // Login Nayok L1
    const nayokRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'prasert', password: '1234' });
    expect(nayokRes.status).toBe(201);
    nayokToken = nayokRes.body.token;
    nayokId = nayokRes.body.account.id;

    // Login Admin
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: '1234' });
    expect(adminRes.status).toBe(201);
    adminToken = adminRes.body.token;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Helper to establish Email OTP session for an officer
  async function establishSigningOtpSession(token: string, officerId: string) {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.createSignVerifiedSession(officerId, token, expiresAt);
  }

  describe('Workflow 1: Venue Booking Lifecycle', () => {
    let bookingId: string;

    it('Step 1: Citizen views available venues', async () => {
      const res = await request(app.getHttpServer())
        .get('/resources/venues')
        .set('Authorization', `Bearer ${citizenToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('Step 2: Citizen submits a venue booking request', async () => {
      const dateStr = getWeekdayDateStr(5);
      const venue = db.venues.find((v) => v.enabled);
      expect(venue).toBeDefined();

      const bookingPayload = {
        venueIds: [venue!.id],
        periods: [
          {
            start: `${dateStr}T09:00:00+07:00`,
            end: `${dateStr}T12:00:00+07:00`,
          },
        ],
        activity: 'ประชุมสภาเยาวชนตำบล',
        purpose: 'เพื่อพัฒนาศักยภาพเยาวชนในตำบล',
        attendees: 30,
        extraItems: [],
        requesterSignature: validSignature,
      };

      const res = await request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(bookingPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.code).toMatch(/^BK-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('pending_staff');

      bookingId = res.body.id;
    });

    it('Step 3: Staff views review queue and signs at Level 1 (Staff)', async () => {
      // Check staff queue
      const queueRes = await request(app.getHttpServer())
        .get('/requests?queue=staff')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(queueRes.status).toBe(200);
      expect(queueRes.body.some((r: any) => r.id === bookingId)).toBe(true);

      // Establish signing OTP session
      await establishSigningOtpSession(staffToken, staffId);

      // Staff signs approve
      const signRes = await request(app.getHttpServer())
        .post(`/requests/${bookingId}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          decision: 'approve',
          pin: '123456',
          signature: validSignature,
          note: 'ตรวจสอบเอกสารครบถ้วน เห็นควรส่งต่อปลัด อบต.',
        });

      expect(signRes.status).toBe(201);
      expect(signRes.body.status).toBe('pending_l2');
      expect(signRes.body.signatures.some((s: any) => s.level === 'staff')).toBe(true);
    });

    it('Step 4: Palad L2 signs at Level 2 (Palad)', async () => {
      await establishSigningOtpSession(paladToken, paladId);

      const signRes = await request(app.getHttpServer())
        .post(`/requests/${bookingId}/sign`)
        .set('Authorization', `Bearer ${paladToken}`)
        .send({
          decision: 'approve',
          pin: '123456',
          signature: validSignature,
          note: 'เห็นชอบตามเสนอ',
        });

      expect(signRes.status).toBe(201);
      expect(signRes.body.status).toBe('pending_l1');
      expect(signRes.body.signatures.some((s: any) => s.level === 'l2')).toBe(true);
    });

    it('Step 5: Nayok L1 signs at Level 3 (Nayok) and approves booking', async () => {
      await establishSigningOtpSession(nayokToken, nayokId);

      const signRes = await request(app.getHttpServer())
        .post(`/requests/${bookingId}/sign`)
        .set('Authorization', `Bearer ${nayokToken}`)
        .send({
          decision: 'approve',
          pin: '123456',
          signature: validSignature,
          note: 'อนุมัติให้ใช้สถานที่ตามระเบียบ',
        });

      expect(signRes.status).toBe(201);
      expect(signRes.body.status).toBe('approved');
      expect(signRes.body.signatures.length).toBe(3);
    });

    it('Step 6: Citizen views approved booking with timeline', async () => {
      const res = await request(app.getHttpServer())
        .get(`/requests/${bookingId}`)
        .set('Authorization', `Bearer ${citizenToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(bookingId);
      expect(res.body.status).toBe('approved');
      expect(res.body.timeline).toBeDefined();
    });
  });

  describe('Workflow 2: Borrowing & Inventory Handover Lifecycle', () => {
    let borrowId: string;

    it('Step 1: Citizen submits equipment borrow request', async () => {
      const eq = db.equipment.find((e) => e.enabled && e.stock >= 2);
      expect(eq).toBeDefined();

      const borrowPayload = {
        items: [{ equipmentId: eq!.id, qty: 1 }],
        pickupDate: '2026-11-20',
        returnDate: '2026-11-22',
        purpose: 'จัดงานกิจกรรมพัฒนาหมู่บ้าน',
        requesterSignature: validSignature,
      };

      const res = await request(app.getHttpServer())
        .post('/requests/borrow')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send(borrowPayload);

      expect(res.status).toBe(201);
      expect(res.body.code).toMatch(/^BR-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('pending_staff');
      borrowId = res.body.id;
    });

    it('Step 2: 3-Level approvals complete and request status transitions to approved (รอรับมอบ)', async () => {
      // Level 1: Staff
      await establishSigningOtpSession(staffToken, staffId);
      await request(app.getHttpServer())
        .post(`/requests/${borrowId}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      // Level 2: Palad
      await establishSigningOtpSession(paladToken, paladId);
      await request(app.getHttpServer())
        .post(`/requests/${borrowId}/sign`)
        .set('Authorization', `Bearer ${paladToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      // Level 3: Nayok
      await establishSigningOtpSession(nayokToken, nayokId);
      const approveRes = await request(app.getHttpServer())
        .post(`/requests/${borrowId}/sign`)
        .set('Authorization', `Bearer ${nayokToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      expect(approveRes.status).toBe(201);
      expect(approveRes.body.status).toBe('approved');
    });

    it('Step 3: Staff records Handover Before Pickup (phase: before)', async () => {
      const handoverRes = await request(app.getHttpServer())
        .post(`/requests/${borrowId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          phase: 'before',
          items: [{ label: 'อุปกรณ์ครบและทดสอบเปิดติด', ok: true }],
          note: 'ตรวจสภาพก่อนส่งมอบเรียบร้อย',
          citizenSignature: validSignature,
          staffSignature: validSignature,
        });

      expect(handoverRes.status).toBe(201);
      expect(handoverRes.body.status).toBe('borrowing');
      expect(handoverRes.body.handoverBefore).toBeDefined();
    });

    it('Step 4: Citizen requests equipment return', async () => {
      const returnRes = await request(app.getHttpServer())
        .post(`/requests/${borrowId}/return-request`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send();

      expect(returnRes.status).toBe(201);
      expect(returnRes.body.status).toBe('return_inspect');
    });

    it('Step 5: Staff inspects and records Handover After Return (phase: after)', async () => {
      const inspectRes = await request(app.getHttpServer())
        .post(`/requests/${borrowId}/handover`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          phase: 'after',
          items: [{ label: 'อุปกรณ์ส่งคืนครบถ้วน ไม่ชำรุด', ok: true }],
          note: 'รับคืนเข้าคลังเรียบร้อย',
          citizenSignature: validSignature,
          staffSignature: validSignature,
        });

      expect(inspectRes.status).toBe(201);
      expect(inspectRes.body.status).toBe('returned');
      expect(inspectRes.body.returnedAt).toBeDefined();
    });
  });

  describe('Workflow 3: Maintenance & Repair Lifecycle', () => {
    let repairId: string;

    it('Step 1: Citizen creates a repair request', async () => {
      const res = await request(app.getHttpServer())
        .post('/requests/repair')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          location: 'ห้องน้ำสาธารณะ ข้างอาคาร 2',
          detail: 'ก๊อกน้ำรั่วซึมและหลอดไฟเสีย',
          category: 'ประปาและไฟฟ้า',
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toMatch(/^RP-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('repair_submitted');
      repairId = res.body.id;
    });

    it('Step 2: Staff accepts repair job', async () => {
      const acceptRes = await request(app.getHttpServer())
        .post(`/requests/${repairId}/repair-status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          action: 'accept',
          pin: '123456',
          signature: validSignature,
        });

      expect(acceptRes.status).toBe(201);
      expect(acceptRes.body.status).toBe('repair_in_progress');
    });

    it('Step 3: Staff finishes repair job', async () => {
      const finishRes = await request(app.getHttpServer())
        .post(`/requests/${repairId}/repair-status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          action: 'finish',
          pin: '123456',
          resolution: 'เปลี่ยนวาล์วก๊อกน้ำใหม่และเปลี่ยนหลอด LED เรียบร้อย',
          signature: validSignature,
        });

      expect(finishRes.status).toBe(201);
      expect(finishRes.body.status).toBe('repair_awaiting_acceptance');
    });

    it('Step 4: Citizen inspects and confirms repair completion', async () => {
      const confirmRes = await request(app.getHttpServer())
        .post(`/requests/${repairId}/repair-status`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          action: 'confirm',
          signature: validSignature,
        });

      expect(confirmRes.status).toBe(201);
      expect(confirmRes.body.status).toBe('repair_done');
      expect(confirmRes.body.acceptedByRequesterAt).toBeDefined();
    });
  });

  describe('Workflow 4: Security Policies & Separation of Duties (SoD)', () => {
    it('prevents self-approval: staff cannot approve a booking they created themselves', async () => {
      const dateStr = getWeekdayDateStr(8);
      const venue = db.venues[0];

      const createdRes = await request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          venueIds: [venue.id],
          periods: [{ start: `${dateStr}T13:00:00+07:00`, end: `${dateStr}T16:00:00+07:00` }],
          activity: 'ประชุมงานฝ่าย',
          purpose: 'วางแผนงาน',
          requesterSignature: validSignature,
        });

      expect(createdRes.status).toBe(201);
      const reqId = createdRes.body.id;

      // Staff tries to sign their own request
      await establishSigningOtpSession(staffToken, staffId);
      const signRes = await request(app.getHttpServer())
        .post(`/requests/${reqId}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      expect(signRes.status).toBe(403);
      expect(signRes.body.message).toMatch(/Separation of Duties/);
    });

    it('rejects signing without verified OTP session', async () => {
      // Revoke any active session for staff
      await db.revokeSignVerifiedSessionByAccount(staffId);

      const venue = db.venues[0];
      const dateStr = getWeekdayDateStr(10);

      const bookingRes = await request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          venueIds: [venue.id],
          periods: [{ start: `${dateStr}T09:00:00+07:00`, end: `${dateStr}T12:00:00+07:00` }],
          activity: 'สัมมนา',
          purpose: 'สัมมนา',
          requesterSignature: validSignature,
        });

      expect(bookingRes.status).toBe(201);

      const signRes = await request(app.getHttpServer())
        .post(`/requests/${bookingRes.body.id}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ decision: 'approve', pin: '123456', signature: validSignature });

      expect(signRes.status).toBe(401);
      expect(signRes.body.message).toMatch(/กรุณายืนยันตัวตนด้วยรหัส OTP/);
    });

    it('rejects signing if wrong PIN is entered', async () => {
      await establishSigningOtpSession(staffToken, staffId);

      const venue = db.venues[0];
      const dateStr = getWeekdayDateStr(14);

      const bookingRes = await request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({
          venueIds: [venue.id],
          periods: [{ start: `${dateStr}T13:00:00+07:00`, end: `${dateStr}T16:00:00+07:00` }],
          activity: 'สัมมนา',
          purpose: 'สัมมนา',
          requesterSignature: validSignature,
        });

      expect(bookingRes.status).toBe(201);

      const signRes = await request(app.getHttpServer())
        .post(`/requests/${bookingRes.body.id}/sign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ decision: 'approve', pin: '999999', signature: validSignature });

      expect(signRes.status).toBe(401);
      expect(signRes.body.message).toMatch(/รหัส PIN ไม่ถูกต้อง/);
    });
  });

  describe('Workflow 5: Admin & Resource Governance', () => {
    it('Admin creates a new venue', async () => {
      const newVenuePayload = {
        name: 'ห้องประชุมแก้วมุกดา (อาคาร 3)',
        type: 'meeting',
        building: 'อาคารเฉลิมพระเกียรติ',
        floor: 'ชั้น 3',
        capacity: 80,
        status: 'available',
        enabled: true,
        facilities: ['เครื่องฉายโปรเจคเตอร์', 'ระบบเสียงห้องประชุม', 'เครื่องปรับอากาศ'],
        openTime: '08:30',
        closeTime: '16:30',
        openDays: [1, 2, 3, 4, 5],
        advanceDays: 2,
        approvalLevels: 3,
      };

      const res = await request(app.getHttpServer())
        .post('/resources/venues')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newVenuePayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(newVenuePayload.name);
    });

    it('Admin creates and updates equipment stock', async () => {
      const eqPayload = {
        name: 'กล้องวิดีโอดิจิทัลสำหรับบันทึกการประชุม',
        category: 'av',
        stock: 3,
        enabled: true,
      };

      const createRes = await request(app.getHttpServer())
        .post('/resources/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(eqPayload);

      expect(createRes.status).toBe(201);
      const eqId = createRes.body.id;

      // Update stock via PATCH
      const updateRes = await request(app.getHttpServer())
        .patch(`/resources/equipment/${eqId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 5 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.stock).toBe(5);
    });

    it('Admin retrieves system dashboard statistics and audit logs', async () => {
      const statsRes = await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.usersCount).toBeGreaterThan(0);
      expect(statsRes.body.resourcesCount).toBeGreaterThan(0);
      expect(Array.isArray(statsRes.body.activities)).toBe(true);
    });
  });
});
