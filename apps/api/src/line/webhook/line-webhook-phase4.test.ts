import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { LineWebhookService } from './line-webhook.service';

describe('LINE Webhook Integration (Phase 4)', () => {
  let service: LineWebhookService;
  let mockDb: any;
  let mockMessaging: any;
  const SECRET = 'test-webhook-secret-key-123';

  function signBody(bodyStr: string): string {
    return crypto.createHmac('sha256', SECRET).update(Buffer.from(bodyStr, 'utf-8')).digest('base64');
  }

  beforeEach(() => {
    process.env.LINE_CHANNEL_SECRET = SECRET;
    process.env.FRONTEND_URL = 'https://japjong.vercel.app';
    process.env.NEXT_PUBLIC_LIFF_ID = 'test-liff-999';

    const eventsTable = new Map<string, any>();
    const lineAccounts = [
      {
        lineUserId: 'U1111',
        friendshipStatus: 'UNKNOWN',
        statusUpdatedAt: null as Date | null,
      },
    ];

    mockDb = {
      findWebhookEvent: vi.fn(async (id: string) => eventsTable.get(id) || null),
      recordWebhookEvent: vi.fn(async (ev: any) => {
        eventsTable.set(ev.webhookEventId, ev);
        return ev;
      }),
      updateLineFriendshipStatus: vi.fn(async (lineUserId: string, status: string, eventTime?: Date) => {
        const acc = lineAccounts.find((a) => a.lineUserId === lineUserId);
        if (!acc) return false;
        if (acc.statusUpdatedAt && eventTime && acc.statusUpdatedAt > eventTime) {
          return false; // Event ordering: discard older event
        }
        acc.friendshipStatus = status;
        acc.statusUpdatedAt = eventTime || new Date();
        return true;
      }),
      lineAccounts,
    };

    mockMessaging = {
      sendReplyMessage: vi.fn().mockResolvedValue({ ok: true, providerMessageId: 'mock_reply_1' }),
    };

    service = new LineWebhookService(mockDb, mockMessaging);
    vi.restoreAllMocks();
  });

  describe('Signature Verification', () => {
    it('verifies valid HMAC-SHA256 signature successfully', () => {
      const rawBody = JSON.stringify({ events: [] });
      const validSig = signBody(rawBody);

      expect(service.verifySignature(rawBody, validSig)).toBe(true);
    });

    it('rejects tampered or invalid signature', () => {
      const rawBody = JSON.stringify({ events: [] });
      const invalidSig = 'invalid-sig-base64';

      expect(service.verifySignature(rawBody, invalidSig)).toBe(false);
    });

    it('throws UnauthorizedException when handling webhook with invalid signature', async () => {
      const rawBody = JSON.stringify({ events: [] });
      await expect(service.handleWebhook(rawBody, 'wrong-sig', { events: [] })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Follow & Unfollow Events', () => {
    it('handles follow event, updates status to FRIEND and replies with welcome menu', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'follow',
            webhookEventId: 'ev-follow-01',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
            replyToken: 'reply-token-follow',
          },
        ],
      });

      const res = await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(res.processed).toBe(1);
      expect(mockDb.updateLineFriendshipStatus).toHaveBeenCalledWith('U1111', 'FRIEND', expect.any(Date));
      expect(mockMessaging.sendReplyMessage).toHaveBeenCalledWith(
        'reply-token-follow',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('ยินดีต้อนรับสู่ระบบจับจอง (JapJong)'),
          }),
        ]),
      );
    });

    it('handles unfollow event and updates status to BLOCKED without crashing', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'unfollow',
            webhookEventId: 'ev-unfollow-01',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
          },
        ],
      });

      const res = await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(res.processed).toBe(1);
      expect(mockDb.updateLineFriendshipStatus).toHaveBeenCalledWith('U1111', 'BLOCKED', expect.any(Date));
    });
  });

  describe('Message Event Commands & Reply Token', () => {
    it('replies to "menu" keyword with LIFF service URLs', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'message',
            webhookEventId: 'ev-msg-menu',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
            replyToken: 'token-menu',
            message: { id: 'm1', type: 'text', text: 'menu' },
          },
        ],
      });

      const res = await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(res.processed).toBe(1);
      expect(mockMessaging.sendReplyMessage).toHaveBeenCalledWith(
        'token-menu',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('เมนูบริการระบบจับจอง (JapJong)'),
          }),
        ]),
      );
    });

    it('replies to "booking" command with booking service link', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'message',
            webhookEventId: 'ev-msg-booking',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
            replyToken: 'token-booking',
            message: { id: 'm2', type: 'text', text: 'ขอใช้สถานที่' },
          },
        ],
      });

      await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(mockMessaging.sendReplyMessage).toHaveBeenCalledWith(
        'token-booking',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('ขอใช้สถานที่ราชการ'),
          }),
        ]),
      );
    });

    it('replies to "track" command with status tracking link', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'message',
            webhookEventId: 'ev-msg-track',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
            replyToken: 'token-track',
            message: { id: 'm3', type: 'text', text: 'track' },
          },
        ],
      });

      await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(mockMessaging.sendReplyMessage).toHaveBeenCalledWith(
        'token-track',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('ติดตามสถานะคำขอ'),
          }),
        ]),
      );
    });

    it('replies to unrecognized text with helpful guidance', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'message',
            webhookEventId: 'ev-msg-unknown',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
            replyToken: 'token-unknown',
            message: { id: 'm4', type: 'text', text: 'สวัสดีจ้า' },
          },
        ],
      });

      await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(mockMessaging.sendReplyMessage).toHaveBeenCalledWith(
        'token-unknown',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('ท่านสามารถพิมพ์ "menu"'),
          }),
        ]),
      );
    });
  });

  describe('Postback Events & Allowlist', () => {
    it('handles postback action=booking', async () => {
      const rawBody = JSON.stringify({
        events: [
          {
            type: 'postback',
            webhookEventId: 'ev-postback-booking',
            timestamp: Date.now(),
            source: { userId: 'U1111' },
            replyToken: 'token-postback-booking',
            postback: { data: 'action=booking' },
          },
        ],
      });

      const res = await service.handleWebhook(rawBody, signBody(rawBody), JSON.parse(rawBody));
      expect(res.processed).toBe(1);
      expect(mockMessaging.sendReplyMessage).toHaveBeenCalledWith(
        'token-postback-booking',
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('ขอใช้สถานที่ราชการ'),
          }),
        ]),
      );
    });
  });

  describe('Event Deduplication & Event Ordering', () => {
    it('detects duplicate webhook events and returns DUPLICATE status', async () => {
      const rawEvent = {
        type: 'follow',
        webhookEventId: 'ev-duplicate-test',
        timestamp: Date.now(),
        source: { userId: 'U1111' },
      };
      const rawBody = JSON.stringify({ events: [rawEvent] });
      const sig = signBody(rawBody);

      // First delivery
      const first = await service.handleWebhook(rawBody, sig, JSON.parse(rawBody));
      expect(first.processed).toBe(1);
      expect(first.duplicates).toBe(0);

      // Second delivery (Redelivery from LINE)
      const second = await service.handleWebhook(rawBody, sig, JSON.parse(rawBody));
      expect(second.processed).toBe(0);
      expect(second.duplicates).toBe(1);
    });

    it('enforces event ordering: older event does not overwrite newer status', async () => {
      const newerTime = new Date('2026-11-03T10:00:00.000Z');
      const olderTime = new Date('2026-11-03T09:00:00.000Z');

      // 1. Process newer unfollow event
      await mockDb.updateLineFriendshipStatus('U1111', 'BLOCKED', newerTime);
      expect(mockDb.lineAccounts[0].friendshipStatus).toBe('BLOCKED');

      // 2. An older follow event arrives delayed
      const updated = await mockDb.updateLineFriendshipStatus('U1111', 'FRIEND', olderTime);
      expect(updated).toBe(false); // Rejected due to event ordering
      expect(mockDb.lineAccounts[0].friendshipStatus).toBe('BLOCKED'); // Remains BLOCKED
    });
  });
});

