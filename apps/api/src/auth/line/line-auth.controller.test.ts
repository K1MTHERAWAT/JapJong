import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LineAuthController } from './line-auth.controller';
import { Account, DEFAULT_PERMISSIONS } from '@jongwen/shared';

describe('LineAuthController', () => {
  let controller: LineAuthController;
  let mockLineAuthService: any;
  let mockDb: any;
  let mockUser: Account;

  beforeEach(() => {
    mockLineAuthService = {
      generateAuthUrl: vi.fn().mockReturnValue({
        url: 'https://access.line.me/oauth2/v2.1/authorize?mock=1',
        state: 'mock-state-123',
      }),
      handleCallback: vi.fn().mockResolvedValue({
        redirectUrl: 'http://localhost:3000/login?line_token=mock-token',
      }),
      getStatus: vi.fn().mockResolvedValue({
        isLinked: true,
        lineAccount: {
          lineUserId: 'U12345',
          displayName: 'Test Line',
          pictureUrl: null,
          linkedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    };

    mockDb = {
      revokeSession: vi.fn().mockResolvedValue(true),
    };

    mockUser = {
      id: 'u-somchai',
      username: 'somchai',
      password: 'pwd',
      name: 'สมชาย ใจดี',
      nickname: 'ชาย',
      initial: 'ส',
      role: 'USER',
      position: 'ประชาชน',
      department: 'ชุมชนน้ำชำ',
      phone: '0812345678',
      permissions: { ...DEFAULT_PERMISSIONS },
      signature: null,
      pin: null,
      createdAt: new Date().toISOString(),
    };

    controller = new LineAuthController(mockLineAuthService, mockDb);
  });

  describe('initiateLineLogin', () => {
    it('redirects HTTP 302 to LINE authorize URL by default', () => {
      const mockRes: any = {
        redirect: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      controller.initiateLineLogin(undefined, mockRes);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://access.line.me/oauth2/v2.1/authorize?mock=1',
      );
    });

    it('returns JSON with url and state when redirect=false', () => {
      const mockRes: any = {
        redirect: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      controller.initiateLineLogin('false', mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        url: 'https://access.line.me/oauth2/v2.1/authorize?mock=1',
        state: 'mock-state-123',
      });
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });
  });

  describe('lineCallback', () => {
    it('delegates to service.handleCallback and redirects to returned URL', async () => {
      const mockRes: any = {
        redirect: vi.fn(),
      };

      await controller.lineCallback(
        { code: 'auth-code', state: 'auth-state' },
        mockRes,
      );

      expect(mockLineAuthService.handleCallback).toHaveBeenCalledWith(
        'auth-code',
        'auth-state',
        undefined,
        undefined,
      );
      expect(mockRes.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/login?line_token=mock-token',
      );
    });
  });

  describe('getStatus', () => {
    it('returns LINE status for authenticated user', async () => {
      const res = await controller.getStatus(mockUser);
      expect(mockLineAuthService.getStatus).toHaveBeenCalledWith('u-somchai');
      expect(res.isLinked).toBe(true);
      expect(res.lineAccount?.displayName).toBe('Test Line');
    });
  });

  describe('logout', () => {
    it('revokes session token when present and returns ok', async () => {
      const mockReq: any = {
        token: 'active-session-token',
      };

      const res = await controller.logout(mockReq);
      expect(mockDb.revokeSession).toHaveBeenCalledWith('active-session-token');
      expect(res).toEqual({ ok: true });
    });

    it('returns ok even if token is absent', async () => {
      const mockReq: any = {};
      const res = await controller.logout(mockReq);
      expect(mockDb.revokeSession).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: true });
    });
  });
});

