import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthGuard,
  IS_PUBLIC,
  PERMISSIONS,
  ROLES,
  extractToken,
  requireDrawnSignature,
  safeEqual,
} from './auth.guard';
import { Account } from '@jongwen/shared';

describe('AuthGuard & Helper Functions Unit Tests', () => {
  describe('extractToken()', () => {
    it('extracts bearer token correctly', () => {
      expect(extractToken('Bearer my-secret-token')).toBe('my-secret-token');
      expect(extractToken('bearer my-secret-token')).toBe('my-secret-token');
    });

    it('returns trimmed string if no Bearer prefix', () => {
      expect(extractToken('my-secret-token')).toBe('my-secret-token');
      expect(extractToken(undefined)).toBe('');
    });
  });

  describe('safeEqual()', () => {
    it('returns true for matching strings with constant time', () => {
      expect(safeEqual('token123456', 'token123456')).toBe(true);
    });

    it('returns false for mismatched strings', () => {
      expect(safeEqual('token123456', 'token123457')).toBe(false);
      expect(safeEqual('short', 'longer-token')).toBe(false);
    });
  });

  describe('requireDrawnSignature()', () => {
    it('accepts valid base64 PNG data url', () => {
      const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(requireDrawnSignature(validPng, 'ผู้ใช้')).toBe(validPng);
    });

    it('accepts safe SVG signature', () => {
      const validSvg = 'data:image/svg+xml;utf8,<svg width="100" height="50"><path d="M0,0 L10,10" /></svg>';
      expect(requireDrawnSignature(validSvg, 'เจ้าหน้าที่')).toBe(validSvg);
    });

    it('rejects empty or non-string signature', () => {
      expect(() => requireDrawnSignature('', 'ผู้ใช้')).toThrow(/เขียนลายเซ็นบนหน้าจอ/);
      expect(() => requireDrawnSignature(null, 'ผู้ใช้')).toThrow(/เขียนลายเซ็นบนหน้าจอ/);
    });

    it('rejects plain text signature pretending to be an image', () => {
      expect(() => requireDrawnSignature('สมชาย ใจดี', 'ผู้ใช้')).toThrow(/ต้องเป็นภาพลายเซ็น/);
    });

    it('rejects XSS malicious payloads in SVG signatures', () => {
      const xssSvg = 'data:image/svg+xml;utf8,<svg><script>alert("xss")</script></svg>';
      expect(() => requireDrawnSignature(xssSvg, 'ผู้ใช้')).toThrow(/ไม่ถูกต้อง/);

      const onloadSvg = 'data:image/svg+xml;utf8,<svg onload="alert(1)"></svg>';
      expect(() => requireDrawnSignature(onloadSvg, 'ผู้ใช้')).toThrow(/ไม่ถูกต้อง/);
    });
  });

  describe('AuthGuard canActivate()', () => {
    const dummyUser: Account = {
      id: 'u-01',
      username: 'user01',
      password: 'hash',
      name: 'ผู้ใช้ หนึ่ง',
      nickname: 'หนึ่ง',
      initial: 'ห',
      role: 'USER',
      position: 'ประชาชน',
      department: 'ชุมชน 1',
      phone: '081-111-1111',
      permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: false, manageUsers: false },
      signature: null,
      pin: null,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const mockDbService: any = {
      accounts: [dummyUser],
      getSession: vi.fn(),
      revokeSession: vi.fn(),
    };

    const mockReflector: any = {
      getAllAndOverride: vi.fn(),
    };

    const guard = new AuthGuard(mockReflector as Reflector, mockDbService);

    const createMockContext = (headers: Record<string, string> = {}) => {
      const req: any = { headers };
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext;
    };

    it('allows public routes without authentication', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC) return true;
        return undefined;
      });

      const ctx = createMockContext();
      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });

    it('throws UnauthorizedException when token is missing', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const ctx = createMockContext({});

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session is invalid or expired', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockDbService.getSession.mockResolvedValue(null);
      const ctx = createMockContext({ authorization: 'Bearer invalid-token' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(/เซสชันหมดอายุ/);
    });

    it('authenticates user and attaches user and token to request', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC) return false;
        return undefined;
      });
      mockDbService.getSession.mockResolvedValue({ accountId: dummyUser.id, token: 'valid-token' });

      const ctx = createMockContext({ authorization: 'Bearer valid-token' });
      const can = await guard.canActivate(ctx);
      expect(can).toBe(true);
      expect((ctx.switchToHttp().getRequest() as any).user).toEqual(dummyUser);
    });

    it('throws ForbiddenException when role is not allowed', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC) return false;
        if (key === ROLES) return ['STAFF', 'ADMIN'];
        return undefined;
      });
      mockDbService.getSession.mockResolvedValue({ accountId: dummyUser.id, token: 'valid-token' });

      const ctx = createMockContext({ authorization: 'Bearer valid-token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user lacks required permission', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC) return false;
        if (key === PERMISSIONS) return ['review'];
        return undefined;
      });
      mockDbService.getSession.mockResolvedValue({ accountId: dummyUser.id, token: 'valid-token' });

      const ctx = createMockContext({ authorization: 'Bearer valid-token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });
});

