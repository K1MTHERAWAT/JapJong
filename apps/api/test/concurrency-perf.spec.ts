import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { RequestsController } from '../src/requests/requests.controller';
import { ResourcesController } from '../src/resources/resources.controller';

describe('Regression & Concurrency Performance Testing (PHASE 8)', () => {
  let app: INestApplication;
  let db: DbService;

  let citizen1Token: string;
  let citizen2Token: string;

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

    // Login citizen 1 (somchai)
    const c1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'somchai', password: '1234' });
    citizen1Token = c1.body.token;

    // Login citizen 2 (manee)
    const c2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'manee', password: '1234' });
    citizen2Token = c2.body.token;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('prevents double booking race condition: simultaneous requests for the same venue and slot', async () => {
    const venue = db.venues[0];
    const dateStr = getWeekdayDateStr(25);

    const period = {
      start: `${dateStr}T09:00:00+07:00`,
      end: `${dateStr}T12:00:00+07:00`,
    };

    const makeBooking = (token: string, activityName: string) =>
      request(app.getHttpServer())
        .post('/requests/booking')
        .set('Authorization', `Bearer ${token}`)
        .send({
          venueIds: [venue.id],
          periods: [period],
          activity: activityName,
          purpose: 'ทดสอบ race condition',
          attendees: 20,
          requesterSignature: validSignature,
        });

    // Fire 2 concurrent requests at the exact same instant
    const [res1, res2] = await Promise.all([
      makeBooking(citizen1Token, 'การประชุม 1'),
      makeBooking(citizen2Token, 'การประชุม 2'),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must succeed (201) and one must be rejected (409 Conflict)
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.message).toMatch(/มีการจองซ้อนทับแล้ว/);
  });

  it('prevents over-borrowing stock race condition: concurrent borrow requests exceeding total stock', async () => {
    // Equipment with limited stock
    const eq = db.equipment[0];
    const totalStock = eq.stock; // e.g. 5
    expect(totalStock).toBeGreaterThan(0);

    const makeBorrow = (token: string, qty: number) =>
      request(app.getHttpServer())
        .post('/requests/borrow')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ equipmentId: eq.id, qty }],
          pickupDate: '2026-11-26',
          returnDate: '2026-11-28',
          purpose: 'ทดสอบยืมพร้อมกัน',
          requesterSignature: validSignature,
        });

    // Request totalStock in first request, and 1 more in second request simultaneously
    const [res1, res2] = await Promise.all([
      makeBorrow(citizen1Token, totalStock),
      makeBorrow(citizen2Token, 1),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must succeed (201) and one must be rejected (409 Conflict)
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.message).toMatch(/มีคงเหลือให้ยืมเพียง/);
  });

  it('handles high throughput queries with sub-millisecond latency (< 1ms per query)', () => {
    const controller = app.get(ResourcesController);
    const startTime = Date.now();
    const ITERATIONS = 1000;

    for (let i = 0; i < ITERATIONS; i++) {
      const venues = controller.listVenues();
      expect(venues.length).toBeGreaterThan(0);
    }

    const elapsed = Date.now() - startTime;
    const avgLatency = elapsed / ITERATIONS;
    expect(avgLatency).toBeLessThan(1);
  });
});
