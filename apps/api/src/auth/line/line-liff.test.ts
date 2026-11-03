import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { LineAuthService } from './line-auth.service';

function createJwt(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-sig';
  return `${header}.${body}.${signature}`;
}

describe('LIFF Authentication & Integration (Phase 4)', () => {
  let service: LineAuthService;
  let mockDb: any;

  beforeEach(() => {
    process.env.LINE_CHANNEL_ID = 'test-channel-id';
    process.env.LINE_CHANNEL_SECRET = 'test-channel-secret';
    process.env.NEXT_PUBLIC_LIFF_ID = 'test-liff-id-123';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    mockDb = {
      findUserByLineUserId: vi.fn(),
      getLineAccount: vi.fn(),
      createSession: vi.fn().mockResolvedValue('test-liff-session-token'),
      toPublic: vi.fn((acc) => ({ id: acc.id, name: acc.name, role: acc.role })),
    };

    service = new LineAuthService(mockDb);
    vi.restoreAllMocks();
  });

  describe('authenticateLiffUser', () => {
    it('authenticates an existing active user and returns JapJong session token', async () => {
      const validToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_EXISTING_CITIZEN',
        aud: 'test-channel-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name: 'สมชาย รักชาติ',
      });

      mockDb.findUserByLineUserId.mockResolvedValue({
        id: 'acc-001',
        name: 'สมชาย รักชาติ',
        role: 'USER',
        active: true,
        accountStatus: 'ACTIVE',
      });

      const res = await service.authenticateLiffUser(validToken);

      expect(res.status).toBe('AUTHENTICATED');
      if (res.status === 'AUTHENTICATED') {
        expect(res.token).toBe('test-liff-session-token');
        expect(res.account.id).toBe('acc-001');
      }
      expect(mockDb.createSession).toHaveBeenCalledWith('acc-001');
    });

    it('accepts ID Token where audience matches NEXT_PUBLIC_LIFF_ID', async () => {
      const validLiffToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_EXISTING_STAFF',
        aud: 'test-liff-id-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name: 'เจ้าหน้าที่ทดสอบ',
      });

      mockDb.findUserByLineUserId.mockResolvedValue({
        id: 'acc-staff-001',
        name: 'เจ้าหน้าที่ทดสอบ',
        role: 'STAFF',
        active: true,
        accountStatus: 'ACTIVE',
      });

      const res = await service.authenticateLiffUser(validLiffToken);
      expect(res.status).toBe('AUTHENTICATED');
      if (res.status === 'AUTHENTICATED') {
        expect(res.token).toBe('test-liff-session-token');
      }
    });

    it('returns NEW_USER status and registration ticket for first-time LINE user', async () => {
      const validToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_NEW_USER_999',
        aud: 'test-channel-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name: 'ผู้ใช้ใหม่ สดใส',
        picture: 'https://profile.line-scdn.net/newuser',
      });

      mockDb.findUserByLineUserId.mockResolvedValue(null);

      const res = await service.authenticateLiffUser(validToken);

      expect(res.status).toBe('NEW_USER');
      if (res.status === 'NEW_USER') {
        expect(res.ticket).toMatch(/^tkt_/);
        expect(res.lineProfile.displayName).toBe('ผู้ใช้ใหม่ สดใส');
        expect(res.lineProfile.pictureUrl).toBe('https://profile.line-scdn.net/newuser');
      }
      expect(mockDb.createSession).not.toHaveBeenCalled();
    });

    it('rejects authentication if account is SUSPENDED', async () => {
      const validToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_SUSPENDED_USER',
        aud: 'test-channel-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      mockDb.findUserByLineUserId.mockResolvedValue({
        id: 'acc-suspended',
        active: true,
        accountStatus: 'SUSPENDED',
      });

      await expect(service.authenticateLiffUser(validToken)).rejects.toThrow(ForbiddenException);
    });

    it('rejects authentication if account is inactive (active: false)', async () => {
      const validToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_INACTIVE_USER',
        aud: 'test-channel-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      mockDb.findUserByLineUserId.mockResolvedValue({
        id: 'acc-inactive',
        active: false,
        accountStatus: 'ACTIVE',
      });

      await expect(service.authenticateLiffUser(validToken)).rejects.toThrow(ForbiddenException);
    });

    it('rejects ID Token with expired timestamp', async () => {
      const expiredToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_USER_001',
        aud: 'test-channel-id',
        exp: Math.floor(Date.now() / 1000) - 300,
      });

      await expect(service.authenticateLiffUser(expiredToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects ID Token with mismatched issuer', async () => {
      const fakeIssuerToken = createJwt({
        iss: 'https://evil-issuer.com',
        sub: 'U_USER_001',
        aud: 'test-channel-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(service.authenticateLiffUser(fakeIssuerToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects ID Token with mismatched audience', async () => {
      const wrongAudToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_USER_001',
        aud: 'random-other-app-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(service.authenticateLiffUser(wrongAudToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when idToken is empty', async () => {
      await expect(service.authenticateLiffUser('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLiffConfig', () => {
    it('returns public safe configuration without sensitive secrets', () => {
      const config = service.getLiffConfig();
      expect(config.liffId).toBe('test-liff-id-123');
      expect(config.channelId).toBe('test-channel-id');
      expect((config as any).channelSecret).toBeUndefined();
    });
  });
});

