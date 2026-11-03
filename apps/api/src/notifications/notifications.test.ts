import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import * as crypto from 'crypto';
import {
  Account,
  BookingRequest,
  BorrowRequest,
  DEFAULT_PERMISSIONS,
  RepairRequest,
} from '@japjong/shared';
import { LineMessageTemplateService } from '../line/messaging/line-message-template.service';
import { LineMessagingService } from '../line/messaging/line-messaging.service';
import { LineWebhookService } from '../line/webhook/line-webhook.service';
import { NotificationEventsService } from './notification-events.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('Phase 3 — LINE Notification System Test Suite', () => {
  let db: any;
  let templateService: LineMessageTemplateService;
  let lineMessagingService: LineMessagingService;
  let webhookService: LineWebhookService;
  let queueService: NotificationQueueService;
  let preferencesService: NotificationPreferencesService;
  let notificationsService: NotificationsService;
  let eventsService: NotificationEventsService;
  let controller: NotificationsController;

  const mockUser: Account = {
    id: 'u-user-01',
    username: 'somchai',
    password: 'pwd',
    name: 'สมชาย ผู้ใช้งาน',
    nickname: 'ชาย',
    initial: 'ส',
    role: 'USER',
    position: 'ประชาชน',
    department: 'ประชาชนทั่วไป',
    phone: '0812345678',
    permissions: { ...DEFAULT_PERMISSIONS.USER },
    signature: null,
    pin: null,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const mockStaff: Account = {
    id: 'u-staff-01',
    username: 'suda',
    password: 'pwd',
    name: 'สุดา เจ้าหน้าที่',
    nickname: 'ดา',
    initial: 'ส',
    role: 'STAFF',
    position: 'เจ้าหน้าที่ธุรการ',
    department: 'สำนักปลัด',
    phone: '0825550101',
    permissions: { ...DEFAULT_PERMISSIONS.STAFF },
    signature: null,
    pin: null,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const mockAdmin: Account = {
    id: 'u-admin-01',
    username: 'admin',
    password: 'pwd',
    name: 'แอดมิน ผู้ดูแล',
    nickname: 'มิน',
    initial: 'อ',
    role: 'ADMIN',
    position: 'ผู้ดูแลระบบ',
    department: 'ฝ่ายเทคโนโลยี',
    phone: '0854440404',
    permissions: { ...DEFAULT_PERMISSIONS.ADMIN },
    signature: null,
    pin: null,
    active: true,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    process.env.LINE_NOTIFICATION_ENABLED = 'false';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test_token';
    process.env.LINE_CHANNEL_SECRET = 'test_secret_123';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    let notifCounter = 1;
    let logCounter = 1;

    db = {
      accounts: [mockUser, mockStaff, mockAdmin],
      venues: [{ id: 'v-01', name: 'ห้องประชุมสภา' }],
      equipment: [{ id: 'e-01', name: 'ไมโครโฟนไร้สาย' }],
      notifications: [] as any[],
      lineAccounts: new Map<string, any>(),
      preferences: new Map<string, boolean>(),
      lineLogs: [] as any[],
      webhookEvents: new Map<string, any>(),

      nextId: vi.fn(async (prefix: string) => `${prefix}-${notifCounter++}`),

      notify: vi.fn(async (userId: string, title: string, body: string, link?: string, options?: any) => {
        const prefKey = `${userId}:IN_APP:${options?.notificationType || 'SYSTEM'}`;
        if (db.preferences.has(prefKey) && !db.preferences.get(prefKey)) {
          return null; // Disabled in preferences
        }
        const item = {
          id: `n-${notifCounter++}`,
          userId,
          title,
          body,
          message: body,
          notificationType: options?.notificationType || 'SYSTEM',
          referenceType: options?.referenceType ?? null,
          referenceId: options?.referenceId ?? null,
          link,
          at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          read: false,
          isRead: false,
          readAt: null,
        };
        db.notifications.unshift(item);
        return item;
      }),

      markNotificationRead: vi.fn(async (userId: string, notificationId: string) => {
        const item = db.notifications.find((n: any) => n.id === notificationId && n.userId === userId);
        if (!item) return null;
        item.read = true;
        item.isRead = true;
        item.readAt = new Date().toISOString();
        return item;
      }),

      markAllNotificationsRead: vi.fn((userId: string) => {
        db.notifications
          .filter((n: any) => n.userId === userId)
          .forEach((n: any) => {
            n.read = true;
            n.isRead = true;
          });
      }),

      isChannelEnabled: vi.fn(async (userId: string, channel: string, type: string) => {
        const key = `${userId}:${channel}:${type}`;
        if (db.preferences.has(key)) return db.preferences.get(key);
        return channel === 'IN_APP'; // Default: IN_APP is true, LINE is false
      }),

      getUserNotificationPreferences: vi.fn(async (userId: string) => {
        const cats = [
          'BOOKING_STATUS',
          'BORROW_STATUS',
          'BORROW_RETURN',
          'REPAIR_STATUS',
          'DOCUMENT_SIGNING',
        ];
        const res: any[] = [];
        for (const c of cats) {
          for (const ch of ['IN_APP', 'LINE']) {
            const key = `${userId}:${ch}:${c}`;
            res.push({
              id: `pref-${userId}-${ch}-${c}`,
              userId,
              channel: ch,
              notificationType: c,
              isEnabled: db.preferences.has(key) ? db.preferences.get(key) : ch === 'IN_APP',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
        return res;
      }),

      upsertUserNotificationPreferences: vi.fn(async (userId: string, items: any[]) => {
        for (const item of items) {
          db.preferences.set(`${userId}:${item.channel}:${item.notificationType}`, item.isEnabled);
        }
        return db.getUserNotificationPreferences(userId);
      }),

      getLineAccount: vi.fn(async (userId: string) => {
        return db.lineAccounts.get(userId) || null;
      }),

      updateLineFriendshipStatus: vi.fn(async (lineUserId: string, status: string) => {
        for (const [_uid, acc] of db.lineAccounts.entries()) {
          if (acc.lineUserId === lineUserId) {
            acc.friendshipStatus = status;
            return true;
          }
        }
        return false;
      }),

      getLineNotificationLogByEventKey: vi.fn(async (eventKey: string) => {
        return db.lineLogs.find((l: any) => l.eventKey === eventKey) || null;
      }),

      getLineNotificationLogById: vi.fn(async (id: string) => {
        return db.lineLogs.find((l: any) => l.id === id) || null;
      }),

      createLineNotificationLog: vi.fn(async (data: any) => {
        const record = {
          id: `lnl-${logCounter++}`,
          attemptCount: 0,
          ...data,
          createdAt: new Date().toISOString(),
        };
        db.lineLogs.unshift(record);
        return record;
      }),

      updateLineNotificationLog: vi.fn(async (id: string, patch: any) => {
        const target = db.lineLogs.find((l: any) => l.id === id);
        if (!target) return null;
        Object.assign(target, patch);
        return target;
      }),

      getLineNotificationLogs: vi.fn(async (filter?: any) => {
        return db.lineLogs.filter((l: any) => {
          if (filter?.status && l.status !== filter.status) return false;
          if (filter?.userId && l.userId !== filter.userId) return false;
          return true;
        });
      }),

      findWebhookEvent: vi.fn(async (id: string) => db.webhookEvents.get(id) || null),
      recordWebhookEvent: vi.fn(async (data: any) => {
        db.webhookEvents.set(data.webhookEventId, data);
        return data;
      }),
    };

    // เชื่อมบัญชี LINE ของ mockUser เป็นค่าตั้งต้นสำหรับการทดสอบ
    db.lineAccounts.set(mockUser.id, {
      id: 'la-user-01',
      userId: mockUser.id,
      lineUserId: 'U1111222233334444',
      displayName: 'Somchai LINE',
      pictureUrl: 'https://example.com/pic.png',
      friendshipStatus: 'FRIEND',
      isActive: true,
      linkedAt: new Date(),
    });

    templateService = new LineMessageTemplateService();
    lineMessagingService = new LineMessagingService();
    webhookService = new LineWebhookService(db);
    queueService = new NotificationQueueService(db, lineMessagingService);
    preferencesService = new NotificationPreferencesService(db);
    notificationsService = new NotificationsService(
      db,
      templateService,
      lineMessagingService,
      queueService,
    );
    eventsService = new NotificationEventsService(db, notificationsService);
    controller = new NotificationsController(
      notificationsService,
      preferencesService,
      queueService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Section 12: Notification Unit Tests (Scenarios 1-6)
  // =========================================================================
  describe('Notification Core Tests (Scenarios 1-6)', () => {
    it('1. สร้าง In-App Notification สำเร็จ', async () => {
      const res = await notificationsService.dispatchToUser({
        userId: mockUser.id,
        event: 'TEST_NOTIFICATION',
        recipientRole: 'CITIZEN',
      });
      expect(res.inApp).toBeDefined();
      expect(res.inApp?.title).toContain('ทดสอบระบบแจ้งเตือน');
      expect(db.notifications.length).toBe(1);
    });

    it('2. สร้าง LINE Notification สำเร็จ', async () => {
      // เปิด LINE Preference ก่อน
      db.preferences.set(`${mockUser.id}:LINE:BOOKING_STATUS`, true);

      const res = await notificationsService.dispatchToUser({
        userId: mockUser.id,
        event: 'BOOKING_SUBMITTED',
        recipientRole: 'CITIZEN',
        requestCode: 'BK-2026-0001',
        venueName: 'ห้องประชุมสภา',
      });

      expect(res.lineLog).toBeDefined();
      expect(res.lineLog?.status).toBe('SENT');
      expect(res.lineLog?.lineUserId).toBe('U1111222233334444');
    });

    it('3. ปิด LINE Notification แล้วไม่ส่ง', async () => {
      // ปิด LINE Notification สำหรับ BOOKING_STATUS
      db.preferences.set(`${mockUser.id}:LINE:BOOKING_STATUS`, false);

      const res = await notificationsService.dispatchToUser({
        userId: mockUser.id,
        event: 'BOOKING_SUBMITTED',
        recipientRole: 'CITIZEN',
        requestCode: 'BK-2026-0001',
      });

      expect(res.inApp).toBeDefined(); // In-app ยังทำงานปกติ
      expect(res.lineLog).toBeNull(); // ไม่สร้าง job ในคิว
    });

    it('4. ปิด In-App Notification แล้วไม่สร้างตามการตั้งค่า', async () => {
      // ปิด In-App Notification
      db.preferences.set(`${mockUser.id}:IN_APP:BOOKING_STATUS`, false);

      const res = await notificationsService.dispatchToUser({
        userId: mockUser.id,
        event: 'BOOKING_SUBMITTED',
        recipientRole: 'CITIZEN',
        requestCode: 'BK-2026-0001',
      });

      expect(res.inApp).toBeNull();
      expect(db.notifications.length).toBe(0);
    });

    it('5. ผู้ใช้งานเห็นเฉพาะ Notification ของตนเอง (User Data Isolation)', async () => {
      await db.notify(mockUser.id, 'Notice User', 'Body');
      await db.notify(mockStaff.id, 'Notice Staff', 'Body');

      const userNotifs = controller.getNotifications(mockUser);
      expect(userNotifs.length).toBe(1);
      expect(userNotifs[0].userId).toBe(mockUser.id);
    });

    it('6. Notification เชื่อมกับ Reference ID ถูกต้อง', async () => {
      const res = await notificationsService.dispatchToUser({
        userId: mockUser.id,
        event: 'BOOKING_APPROVED',
        recipientRole: 'CITIZEN',
        requestCode: 'BK-2026-0001',
        requestId: 'r-bk-0001',
      });

      expect(res.inApp?.referenceType).toBe('booking');
      expect(res.inApp?.referenceId).toBe('r-bk-0001');
      expect(res.inApp?.link).toContain('/approver/permit/r-bk-0001');
    });
  });

  // =========================================================================
  // Section 12: LINE Messaging API Tests (Scenarios 7-14)
  // =========================================================================
  describe('LINE Messaging API Tests (Scenarios 7-14)', () => {
    it('7. ส่งข้อความสำเร็จ ผ่าน LINE Messaging API', async () => {
      process.env.LINE_NOTIFICATION_ENABLED = 'true';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-line-request-id': 'req-123' }),
        json: async () => ({ sentMessages: [{ id: 'msg-001' }] }),
      });

      const res = await lineMessagingService.sendPushMessage('U1111', [{ type: 'text', text: 'Hello' }]);
      expect(res.ok).toBe(true);
      expect(res.providerMessageId).toBe('msg-001');
    });

    it('8. LINE API ตอบกลับ Error ทั่วไป', async () => {
      process.env.LINE_NOTIFICATION_ENABLED = 'true';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ message: 'Internal Server Error' }),
      });

      const res = await lineMessagingService.sendPushMessage('U1111', [{ type: 'text', text: 'Hello' }]);
      expect(res.ok).toBe(false);
      expect(res.statusCode).toBe(500);
      expect(res.retryable).toBe(true);
    });

    it('9. Access Token ไม่ถูกต้อง', async () => {
      process.env.LINE_NOTIFICATION_ENABLED = 'true';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid access token' }),
      });

      const res = await lineMessagingService.sendPushMessage('U1111', [{ type: 'text', text: 'Hello' }]);
      expect(res.ok).toBe(false);
      expect(res.errorCode).toBe('INVALID_ACCESS_TOKEN');
      expect(res.retryable).toBe(false);
    });

    it('10. ผู้ใช้ไม่ได้เพิ่มเพื่อน OA', async () => {
      process.env.LINE_NOTIFICATION_ENABLED = 'true';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ message: 'Failed to send messages: not a friend' }),
      });

      const res = await lineMessagingService.sendPushMessage('U1111', [{ type: 'text', text: 'Hello' }]);
      expect(res.ok).toBe(false);
      expect(res.errorCode).toBe('USER_NOT_FRIEND_OR_BLOCKED');
      expect(res.retryable).toBe(false);
    });

    it('11. ผู้ใช้บล็อก OA', async () => {
      // ผู้ใช้มีสถานะ BLOCKED ในฐานข้อมูล -> Queue จะข้ามการส่งทันที (SKIPPED)
      const userAcc = db.lineAccounts.get(mockUser.id);
      userAcc.friendshipStatus = 'BLOCKED';

      const res = await queueService.enqueueAndDispatch({
        userId: mockUser.id,
        notificationType: 'BOOKING_STATUS',
        messages: [{ type: 'text', text: 'test' }],
        bypassPreferenceCheck: true,
      });

      expect(res.log?.status).toBe('SKIPPED');
      expect(res.skippedReason).toBe('LINE_OA_BLOCKED');
    });

    it('12. Quota หรือ Rate Limit เต็ม', async () => {
      process.env.LINE_NOTIFICATION_ENABLED = 'true';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({ message: 'monthly quota exceeded' }),
      });

      const res = await lineMessagingService.sendPushMessage('U1111', [{ type: 'text', text: 'Hello' }]);
      expect(res.ok).toBe(false);
      expect(res.errorCode).toBe('QUOTA_EXCEEDED');
      expect(res.retryable).toBe(false);
    });

    it('13. Retry สำเร็จ ผ่าน Admin API', async () => {
      const failedJob = await db.createLineNotificationLog({
        userId: mockUser.id,
        lineUserId: 'U1111222233334444',
        notificationType: 'BOOKING_STATUS',
        status: 'FAILED',
        errorCode: 'NETWORK_ERROR',
        errorMessage: 'Connection reset',
        attemptCount: 1,
      });

      const retryRes = await controller.retryFailedNotification(failedJob.id);
      expect(retryRes.ok).toBe(true);
      expect(retryRes.log.status).toBe('SENT');
      expect(retryRes.log.attemptCount).toBe(2);
    });

    it('14. ป้องกันการส่งข้อความซ้ำ (Idempotency)', async () => {
      const eventKey = 'event-unique-12345';
      const first = await queueService.enqueueAndDispatch({
        userId: mockUser.id,
        notificationType: 'BOOKING_STATUS',
        eventKey,
        messages: [{ type: 'text', text: 'test' }],
        bypassPreferenceCheck: true,
      });

      expect(first.duplicate).toBeFalsy();
      expect(first.log?.status).toBe('SENT');

      const second = await queueService.enqueueAndDispatch({
        userId: mockUser.id,
        notificationType: 'BOOKING_STATUS',
        eventKey,
        messages: [{ type: 'text', text: 'test' }],
        bypassPreferenceCheck: true,
      });

      expect(second.duplicate).toBe(true);
      expect(second.log?.id).toBe(first.log?.id);
    });
  });

  // =========================================================================
  // Section 12: Webhook Tests (Scenarios 15-20)
  // =========================================================================
  describe('LINE Webhook Tests (Scenarios 15-20)', () => {
    const rawPayload = JSON.stringify({
      events: [
        {
          type: 'follow',
          webhookEventId: 'ev-follow-01',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'U1111222233334444' },
        },
      ],
    });

    it('15. Webhook Signature ถูกต้อง', async () => {
      const sig = crypto
        .createHmac('sha256', 'test_secret_123')
        .update(Buffer.from(rawPayload, 'utf-8'))
        .digest('base64');

      const res = await webhookService.handleWebhook(rawPayload, sig, JSON.parse(rawPayload));
      expect(res.ok).toBe(true);
      expect(res.processed).toBe(1);
    });

    it('16. Webhook Signature ไม่ถูกต้อง', async () => {
      await expect(
        webhookService.handleWebhook(rawPayload, 'invalid_sig', JSON.parse(rawPayload)),
      ).rejects.toThrow(/Invalid X-Line-Signature/);
    });

    it('17. ป้องกัน Webhook Event ซ้ำ', async () => {
      const sig = crypto
        .createHmac('sha256', 'test_secret_123')
        .update(Buffer.from(rawPayload, 'utf-8'))
        .digest('base64');

      const first = await webhookService.handleWebhook(rawPayload, sig, JSON.parse(rawPayload));
      expect(first.processed).toBe(1);

      const second = await webhookService.handleWebhook(rawPayload, sig, JSON.parse(rawPayload));
      expect(second.duplicates).toBe(1);
    });

    it('18. Follow Event อัปเดตสถานะเป็น FRIEND', async () => {
      const userAcc = db.lineAccounts.get(mockUser.id);
      userAcc.friendshipStatus = 'UNKNOWN';

      await webhookService.processSingleEvent({
        type: 'follow',
        webhookEventId: 'ev-f-02',
        source: { type: 'user', userId: 'U1111222233334444' },
      });

      expect(userAcc.friendshipStatus).toBe('FRIEND');
    });

    it('19. Unfollow Event อัปเดตสถานะเป็น BLOCKED', async () => {
      const userAcc = db.lineAccounts.get(mockUser.id);
      userAcc.friendshipStatus = 'FRIEND';

      await webhookService.processSingleEvent({
        type: 'unfollow',
        webhookEventId: 'ev-uf-01',
        source: { type: 'user', userId: 'U1111222233334444' },
      });

      expect(userAcc.friendshipStatus).toBe('BLOCKED');
    });

    it('20. Webhook Processing ล้มเหลวและบันทึกสถานะ FAILED', async () => {
      db.findWebhookEvent = vi.fn().mockRejectedValue(new Error('DB crash'));
      const status = await webhookService.processSingleEvent({
        type: 'follow',
        webhookEventId: 'ev-err-01',
        source: { type: 'user', userId: 'U1111222233334444' },
      });
      expect(status).toBe('FAILED');
    });
  });

  // =========================================================================
  // Section 12: Integration & Business Events Tests (Scenarios 21-26)
  // =========================================================================
  describe('Business Event Notifications & Resilience (Scenarios 21-26)', () => {
    it('21. Booking Event สร้าง Notification', async () => {
      const bookingReq: BookingRequest = {
        id: 'r-bk-100',
        code: 'BK-2026-0100',
        type: 'booking',
        status: 'pending_staff',
        requesterId: mockUser.id,
        requesterName: mockUser.name,
        organization: mockUser.department,
        venueIds: ['v-01'],
        periods: [{ start: '2026-11-10T09:00:00+07:00', end: '2026-11-10T16:00:00+07:00' }],
        attendees: 20,
        activity: 'ประชุมประจำปี',
        purpose: 'ประชุมราชการ',
        attachments: [],
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await eventsService.onBookingCreated(bookingReq);

      // สร้างแจ้งเตือนประชาชน
      const citizenNotif = db.notifications.find((n: any) => n.userId === mockUser.id);
      expect(citizenNotif).toBeDefined();
      expect(citizenNotif.title).toContain('BK-2026-0100');

      // สร้างแจ้งเตือนเจ้าหน้าที่
      const staffNotif = db.notifications.find((n: any) => n.userId === mockStaff.id);
      expect(staffNotif).toBeDefined();
      expect(staffNotif.title).toContain('มีคำขอจองสถานที่ใหม่');
    });

    it('22. Borrow Event สร้าง Notification', async () => {
      const borrowReq: BorrowRequest = {
        id: 'r-br-100',
        code: 'BR-2026-0100',
        type: 'borrow',
        status: 'pending_staff',
        requesterId: mockUser.id,
        requesterName: mockUser.name,
        organization: mockUser.department,
        items: [{ equipmentId: 'e-01', qty: 2 }],
        pickupDate: '2026-11-12',
        returnDate: '2026-11-15',
        purpose: 'ใช้งานอบรม',
        attachments: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await eventsService.onBorrowCreated(borrowReq);

      const citizenNotif = db.notifications.find((n: any) => n.userId === mockUser.id);
      expect(citizenNotif).toBeDefined();
      expect(citizenNotif.title).toContain('BR-2026-0100');

      const staffNotif = db.notifications.find((n: any) => n.userId === mockStaff.id);
      expect(staffNotif).toBeDefined();
      expect(staffNotif.title).toContain('มีคำขอยืมครุภัณฑ์ใหม่');
    });

    it('23. Maintenance / Repair Event สร้าง Notification', async () => {
      const repairReq: RepairRequest = {
        id: 'r-rp-100',
        code: 'RP-2026-0100',
        type: 'repair',
        status: 'repair_submitted',
        requesterId: mockUser.id,
        requesterName: mockUser.name,
        organization: mockUser.department,
        building: 'อาคาร 1',
        floor: 'ชั้น 2',
        location: 'ห้องประชุมสภา',
        category: 'ไฟฟ้า',
        detail: 'ไฟกะพริบ',
        photos: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await eventsService.onRepairCreated(repairReq);

      const citizenNotif = db.notifications.find((n: any) => n.userId === mockUser.id);
      expect(citizenNotif).toBeDefined();
      expect(citizenNotif.title).toContain('ส่งแจ้งซ่อม');

      // ตรวจสอบเมื่อช่างรับเรื่อง
      await eventsService.onRepairStatusUpdated(repairReq, 'accept');
      const inProgressNotif = db.notifications.find(
        (n: any) => n.userId === mockUser.id && n.title.includes('กำลังดำเนินการ'),
      );
      expect(inProgressNotif).toBeDefined();
    });

    it('24. Approval Event สร้าง Notification', async () => {
      const bookingReq: BookingRequest = {
        id: 'r-bk-100',
        code: 'BK-2026-0100',
        type: 'booking',
        status: 'approved',
        requesterId: mockUser.id,
        requesterName: mockUser.name,
        organization: mockUser.department,
        venueIds: ['v-01'],
        periods: [{ start: '2026-11-10T09:00:00+07:00', end: '2026-11-10T16:00:00+07:00' }],
        attendees: 20,
        activity: 'ประชุม',
        purpose: 'ประชุม',
        attachments: [],
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await eventsService.onRequestSigned(bookingReq, 'l1', 'approve');

      const approvedNotif = db.notifications.find(
        (n: any) => n.userId === mockUser.id && n.title.includes('อนุมัติแล้ว'),
      );
      expect(approvedNotif).toBeDefined();
    });

    it('25. Database Transaction ล้มเหลวแต่ระบบมีกลไกรองรับ fallback', async () => {
      db.notify = vi.fn().mockRejectedValue(new Error('DB Connection Timeout'));

      // แม้ In-App DB ล้มเหลว ฟังก์ชัน dispatchToUser จะไม่ throw unhandled rejection
      const res = await notificationsService.dispatchToUser({
        userId: mockUser.id,
        event: 'TEST_NOTIFICATION',
        recipientRole: 'CITIZEN',
      });

      expect(res.inApp).toBeNull();
    });

    it('26. LINE API ล้มเหลวแต่ Business Event และ In-App Notification ยังสำเร็จ', async () => {
      process.env.LINE_NOTIFICATION_ENABLED = 'true';
      global.fetch = vi.fn().mockRejectedValue(new Error('LINE API 502 Bad Gateway'));
      db.preferences.set(`${mockUser.id}:LINE:BOOKING_STATUS`, true);

      const bookingReq: BookingRequest = {
        id: 'r-bk-100',
        code: 'BK-2026-0100',
        type: 'booking',
        status: 'pending_staff',
        requesterId: mockUser.id,
        requesterName: mockUser.name,
        organization: mockUser.department,
        venueIds: ['v-01'],
        periods: [{ start: '2026-11-10T09:00:00+07:00', end: '2026-11-10T16:00:00+07:00' }],
        attendees: 20,
        activity: 'ประชุม',
        purpose: 'ประชุม',
        attachments: [],
        extraItems: [],
        signatures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // เรียก business event
      await eventsService.onBookingCreated(bookingReq);

      // In-App Notification สำเร็จ 100%
      const citizenNotif = db.notifications.find((n: any) => n.userId === mockUser.id);
      expect(citizenNotif).toBeDefined();
      expect(citizenNotif.title).toContain('BK-2026-0100');

      // LINE delivery log ถูกบันทึกเป็น FAILED และไม่ทำให้ระบบล่ม
      const lineLog = db.lineLogs.find((l: any) => l.userId === mockUser.id);
      expect(lineLog).toBeDefined();
      expect(lineLog.status).toBe('FAILED');
      expect(lineLog.errorCode).toBe('NETWORK_ERROR');
    });
  });
});

