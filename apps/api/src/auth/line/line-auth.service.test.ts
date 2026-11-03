import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { LineAuthService } from './line-auth.service';

function createJwt(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-sig';
  return `${header}.${body}.${signature}`;
}

describe('LineAuthService', () => {
  let service: LineAuthService;
  let mockDb: any;

  beforeEach(() => {
    process.env.LINE_CHANNEL_ID = 'test-channel-id';
    process.env.LINE_CHANNEL_SECRET = 'test-channel-secret';
    process.env.LINE_LOGIN_CALLBACK_URL = 'http://localhost:4000/auth/line/callback';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    mockDb = {
      findUserByLineUserId: vi.fn(),
      getLineAccount: vi.fn(),
      createSession: vi.fn().mockResolvedValue('test-japjong-session-token'),
      toPublic: vi.fn((acc) => ({ id: acc.id, name: acc.name })),
    };

    service = new LineAuthService(mockDb);
    vi.restoreAllMocks();
  });

  describe('generateAuthUrl', () => {
    it('creates a valid LINE authorize URL with state and nonce', () => {
      const result = service.generateAuthUrl();
      expect(result.url).toContain('https://access.line.me/oauth2/v2.1/authorize');
      expect(result.url).toContain('client_id=test-channel-id');
      expect(result.url).toContain(`state=${result.state}`);
      expect(result.url).toContain('scope=profile+openid');
      expect(result.url).toContain('response_type=code');

      // State is tracked
      const check = service.validateAndConsumeState(result.state);
      expect(check.valid).toBe(true);
      expect(check.nonce).toBeDefined();
    });

    it('throws BadRequestException if LINE_CHANNEL_ID is not configured', () => {
      delete process.env.LINE_CHANNEL_ID;
      expect(() => service.generateAuthUrl()).toThrow(BadRequestException);
    });
  });

  describe('validateAndConsumeState', () => {
    it('prevents replay by consuming state on first check', () => {
      const { state } = service.generateAuthUrl();
      const firstCheck = service.validateAndConsumeState(state);
      expect(firstCheck.valid).toBe(true);

      const secondCheck = service.validateAndConsumeState(state);
      expect(secondCheck.valid).toBe(false);
    });

    it('rejects expired state (> 10 minutes)', () => {
      const { state } = service.generateAuthUrl();
      // Manually manipulate state store time
      const stored = (service as any).stateStore.get(state);
      stored.createdAt = Date.now() - 11 * 60 * 1000;

      const check = service.validateAndConsumeState(state);
      expect(check.valid).toBe(false);
    });

    it('returns valid: false for non-existent state', () => {
      expect(service.validateAndConsumeState('unknown-state').valid).toBe(false);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('calls LINE token endpoint and returns tokens', async () => {
      const mockResponse = {
        access_token: 'line-access-token',
        token_type: 'Bearer',
        expires_in: 2592000,
        scope: 'profile openid',
        id_token: 'line-id-token',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const res = await service.exchangeCodeForToken('auth-code-123');
      expect(res.access_token).toBe('line-access-token');
      expect(res.id_token).toBe('line-id-token');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.line.me/oauth2/v2.1/token',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('throws UnauthorizedException if LINE token endpoint fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid authorization code',
      });

      await expect(service.exchangeCodeForToken('bad-code')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyIdToken', () => {
    it('validates a correct ID token payload and nonce', async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = createJwt({
        iss: 'https://access.line.me',
        sub: 'U1234567890abcdef',
        aud: 'test-channel-id',
        exp: now + 3600,
        iat: now,
        nonce: 'correct-nonce',
        name: 'Somchai Line',
        picture: 'https://profile.line-scdn.net/abc',
      });

      // Mock verify endpoint fallback to local parsing
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });

      const profile = await service.verifyIdToken(jwt, 'correct-nonce');
      expect(profile.sub).toBe('U1234567890abcdef');
      expect(profile.name).toBe('Somchai Line');
      expect(profile.picture).toBe('https://profile.line-scdn.net/abc');
    });

    it('rejects if issuer is not https://access.line.me', async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = createJwt({
        iss: 'https://fake-issuer.com',
        sub: 'U123',
        aud: 'test-channel-id',
        exp: now + 3600,
        iat: now,
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(service.verifyIdToken(jwt)).rejects.toThrow('ID Token Issuer ไม่ถูกต้อง');
    });

    it('rejects if audience does not match channel id', async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = createJwt({
        iss: 'https://access.line.me',
        sub: 'U123',
        aud: 'wrong-channel-id',
        exp: now + 3600,
        iat: now,
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(service.verifyIdToken(jwt)).rejects.toThrow('ID Token Audience ไม่ตรงกับ Channel ID');
    });

    it('rejects if token is expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = createJwt({
        iss: 'https://access.line.me',
        sub: 'U123',
        aud: 'test-channel-id',
        exp: now - 60,
        iat: now - 3600,
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(service.verifyIdToken(jwt)).rejects.toThrow('ID Token หมดอายุแล้ว');
    });

    it('rejects if nonce does not match expected nonce', async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = createJwt({
        iss: 'https://access.line.me',
        sub: 'U123',
        aud: 'test-channel-id',
        exp: now + 3600,
        iat: now,
        nonce: 'token-nonce',
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(service.verifyIdToken(jwt, 'expected-different-nonce')).rejects.toThrow('ID Token Nonce ไม่ตรงกับคำขอ');
    });
  });

  describe('handleCallback', () => {
    it('redirects with error if LINE returns an error', async () => {
      const result = await service.handleCallback(undefined, undefined, 'access_denied', 'User denied');
      expect(result.redirectUrl).toContain('/login?line_error=');
      expect(result.redirectUrl).toContain(encodeURIComponent('LINE Login ถูกยกเลิก: User denied'));
    });

    it('redirects with error if state is invalid or expired', async () => {
      const result = await service.handleCallback('valid-code', 'invalid-state');
      expect(result.redirectUrl).toContain('/login?line_error=');
      expect(result.redirectUrl).toContain(encodeURIComponent('ความปลอดภัยไม่ถูกต้อง'));
    });

    it('authenticates and redirects with token when LINE user is linked to JapJong account', async () => {
      const { state } = service.generateAuthUrl();
      const nonce = (service as any).stateStore.get(state).nonce;

      const now = Math.floor(Date.now() / 1000);
      const idToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_LINKED_USER',
        aud: 'test-channel-id',
        exp: now + 3600,
        iat: now,
        nonce,
        name: 'Somchai Sukdee',
      });

      vi.spyOn(service, 'exchangeCodeForToken').mockResolvedValue({
        access_token: 'acc-token',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile openid',
      });

      mockDb.findUserByLineUserId.mockResolvedValue({
        id: 'u-somchai',
        name: 'สมชาย สุขดี',
        role: 'USER',
      });

      const result = await service.handleCallback('valid-code', state);
      expect(result.redirectUrl).toContain('line_token=test-japjong-session-token');
      expect(result.redirectUrl).toContain('account_id=u-somchai');
      expect(mockDb.createSession).toHaveBeenCalledWith('u-somchai');
    });

    it('redirects to login with line_status=unlinked when user is not linked', async () => {
      const { state } = service.generateAuthUrl();
      const nonce = (service as any).stateStore.get(state).nonce;

      const now = Math.floor(Date.now() / 1000);
      const idToken = createJwt({
        iss: 'https://access.line.me',
        sub: 'U_NEW_UNLINKED_USER',
        aud: 'test-channel-id',
        exp: now + 3600,
        iat: now,
        nonce,
        name: 'Somying Line',
      });

      vi.spyOn(service, 'exchangeCodeForToken').mockResolvedValue({
        access_token: 'acc-token',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile openid',
      });

      mockDb.findUserByLineUserId.mockResolvedValue(null);

      const result = await service.handleCallback('valid-code', state);
      expect(result.redirectUrl).toContain('/register/line?ticket=tkt_');
      // Must NOT create a session or account
      expect(mockDb.createSession).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns isLinked: true when user has linked LINE account', async () => {
      mockDb.getLineAccount.mockResolvedValue({
        lineUserId: 'U12345',
        displayName: 'Somchai Line',
        pictureUrl: 'https://line.me/pic.jpg',
        linkedAt: new Date('2026-01-01T00:00:00Z'),
      });

      const status = await service.getStatus('u-somchai');
      expect(status.isLinked).toBe(true);
      expect(status.lineAccount?.lineUserId).toBe('U12345');
      expect(status.lineAccount?.displayName).toBe('Somchai Line');
    });

    it('returns isLinked: false when user has no linked LINE account', async () => {
      mockDb.getLineAccount.mockResolvedValue(null);
      const status = await service.getStatus('u-unlinked');
      expect(status.isLinked).toBe(false);
      expect(status.lineAccount).toBeNull();
    });
  });
});

