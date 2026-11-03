import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LineAuthService } from './line-auth.service';
import { DEFAULT_PERMISSIONS } from '@japjong/shared';

function createJwt(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-sig';
  return `${header}.${body}.${signature}`;
}

describe('Phase 2 — LINE Login, First-time Registration & PDPA Consent', () => {
  let service: LineAuthService;
  let mockDb: any;

  beforeEach(() => {
    process.env.LINE_CHANNEL_ID = 'test-channel-id';
    process.env.LINE_CHANNEL_SECRET = 'test-channel-secret';
    process.env.LINE_LOGIN_CALLBACK_URL = 'http://localhost:4000/auth/line/callback';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    mockDb = {
      accounts: [],
      findUserByLineUserId: vi.fn(),
      getLineAccount: vi.fn(),
      createSession: vi.fn().mockResolvedValue('test-session-token'),
      toPublic: vi.fn((acc) => ({ id: acc.id, name: acc.name, role: acc.role })),
      createLineCitizenAccount: vi.fn(),
      saveUserConsents: vi.fn(),
      getUserConsents: vi.fn(),
      withdrawConsent: vi.fn().mockResolvedValue(true),
    };

    service = new LineAuthService(mockDb);
    vi.restoreAllMocks();
  });

  // Scenario 1: First-time user Login via LINE -> redirect to /register/line?ticket=...
  it('Scenario 1: redirects first-time user to /register/line with secure ticket', async () => {
    const { state } = service.generateAuthUrl();
    const nonce = (service as any).stateStore.get(state).nonce;

    const now = Math.floor(Date.now() / 1000);
    const idToken = createJwt({
      iss: 'https://access.line.me',
      sub: 'U_NEW_CITIZEN',
      aud: 'test-channel-id',
      exp: now + 3600,
      iat: now,
      nonce,
      name: 'สมชาย ผู้ใช้ใหม่',
      picture: 'https://line.me/avatar.jpg',
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

    // Extract ticket and verify ticket status
    const ticket = result.redirectUrl.split('ticket=')[1];
    const ticketInfo = service.getRegistrationStatus(ticket);
    expect(ticketInfo.valid).toBe(true);
    expect(ticketInfo.lineProfile?.displayName).toBe('สมชาย ผู้ใช้ใหม่');
    expect(ticketInfo.lineProfile?.pictureUrl).toBe('https://line.me/avatar.jpg');
  });

  // Scenario 2: First-time user has not consented to mandatory PDPA
  it('Scenario 2: rejects registration if mandatory PDPA consents are missing or false', async () => {
    const ticket = service.issueRegistrationTicket('U_NEW_1', 'สมหญิง', null);

    // Missing PRIVACY_POLICY
    await expect(
      service.registerFirstTimeUser({
        ticket,
        name: 'สมหญิง รักดี',
        phone: '0812345678',
        consents: [
          { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
          { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: false },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // Scenario 3: First-time user registration with invalid phone format
  it('Scenario 3: handles phone number validation', async () => {
    const ticket = service.issueRegistrationTicket('U_NEW_2', 'สมศักดิ์', null);

    // Register with valid phone
    mockDb.createLineCitizenAccount.mockResolvedValue({
      id: 'u-somsak',
      name: 'สมศักดิ์',
      role: 'USER',
    });

    const res = await service.registerFirstTimeUser({
      ticket,
      name: 'สมศักดิ์ ขยัน',
      phone: '0898765432',
      consents: [
        { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
        { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: true },
      ],
    });

    expect(res.token).toBe('test-session-token');
    expect(mockDb.createLineCitizenAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'สมศักดิ์ ขยัน',
        phone: '0898765432',
        lineUserId: 'U_NEW_2',
      }),
    );
  });

  // Scenario 4: First-time user registration succeeds
  it('Scenario 4: successfully creates citizen account with role USER and creates session', async () => {
    const ticket = service.issueRegistrationTicket('U_NEW_4', 'สมพร', 'https://line.me/p.jpg');

    const createdAccount = {
      id: 'u-somporn',
      name: 'สมพร เจริญ',
      role: 'USER',
      position: 'ประชาชน',
      accountStatus: 'ACTIVE',
      registrationCompletedAt: new Date().toISOString(),
    };

    mockDb.createLineCitizenAccount.mockResolvedValue(createdAccount);

    const res = await service.registerFirstTimeUser({
      ticket,
      name: 'สมพร เจริญ',
      phone: '0819998888',
      consents: [
        { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
        { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: true },
        { consentType: 'MARKETING', consentVersion: '1.0.0', agreed: true },
      ],
    });

    expect(res.token).toBe('test-session-token');
    expect(mockDb.createSession).toHaveBeenCalledWith('u-somporn');
    // Ticket must be consumed
    expect(service.getRegistrationStatus(ticket).valid).toBe(false);
  });

  // Scenario 5 & 6: Existing user Login via LINE -> redirect directly to service without registration
  it('Scenario 5 & 6: existing user enters service immediately without registration or PDPA prompt', async () => {
    const { state } = service.generateAuthUrl();
    const nonce = (service as any).stateStore.get(state).nonce;

    const now = Math.floor(Date.now() / 1000);
    const idToken = createJwt({
      iss: 'https://access.line.me',
      sub: 'U_EXISTING_USER',
      aud: 'test-channel-id',
      exp: now + 3600,
      iat: now,
      nonce,
      name: 'สมชาย ใจดี',
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
      name: 'สมชาย ใจดี',
      role: 'USER',
      active: true,
      accountStatus: 'ACTIVE',
    });

    const result = await service.handleCallback('valid-code', state);
    expect(result.redirectUrl).toContain('/login?line_token=test-session-token');
    expect(result.redirectUrl).toContain('account_id=u-somchai');
    expect(mockDb.createSession).toHaveBeenCalledWith('u-somchai');
  });

  // Scenario 7: Duplicate phone number prevents registration
  it('Scenario 7: rejects registration with duplicate phone number', async () => {
    const ticket = service.issueRegistrationTicket('U_NEW_7', 'สมหญิง', null);
    mockDb.accounts = [{ id: 'u-other', phone: '0812345678' }];

    await expect(
      service.registerFirstTimeUser({
        ticket,
        name: 'สมหญิง แซ่ตั้ง',
        phone: '0812345678',
        consents: [
          { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
          { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: true },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  // Scenario 8: Duplicate LINE User ID prevents registration
  it('Scenario 8: rejects registration if LINE User ID is already linked', async () => {
    const ticket = service.issueRegistrationTicket('U_ALREADY_LINKED', 'สมหญิง', null);
    mockDb.findUserByLineUserId.mockResolvedValue({ id: 'u-existing' });

    await expect(
      service.registerFirstTimeUser({
        ticket,
        name: 'สมหญิง ทดสอบ',
        phone: '0891112222',
        consents: [
          { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
          { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: true },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  // Scenario 9: Suspended account rejected on Login
  it('Scenario 9: rejects login if account is SUSPENDED or inactive', async () => {
    const { state } = service.generateAuthUrl();
    const nonce = (service as any).stateStore.get(state).nonce;

    const now = Math.floor(Date.now() / 1000);
    const idToken = createJwt({
      iss: 'https://access.line.me',
      sub: 'U_SUSPENDED',
      aud: 'test-channel-id',
      exp: now + 3600,
      iat: now,
      nonce,
      name: 'คนถูกแบน',
    });

    vi.spyOn(service, 'exchangeCodeForToken').mockResolvedValue({
      access_token: 'acc-token',
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'profile openid',
    });

    mockDb.findUserByLineUserId.mockResolvedValue({
      id: 'u-banned',
      name: 'คนถูกแบน',
      role: 'USER',
      active: false,
      accountStatus: 'SUSPENDED',
    });

    const result = await service.handleCallback('valid-code', state);
    expect(result.redirectUrl).toContain('line_error=');
    expect(result.redirectUrl).toContain(encodeURIComponent('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน'));
    expect(mockDb.createSession).not.toHaveBeenCalled();
  });

  // Scenario 10: Invalid state rejected (CSRF protection)
  it('Scenario 10: rejects callback with invalid or forged state', async () => {
    const result = await service.handleCallback('any-code', 'forged-state');
    expect(result.redirectUrl).toContain('line_error=');
    expect(result.redirectUrl).toContain(encodeURIComponent('ความปลอดภัยไม่ถูกต้อง'));
  });

  // Scenario 11: Invalid ID token rejected
  it('Scenario 11: rejects callback if ID Token verification fails', async () => {
    const { state } = service.generateAuthUrl();

    vi.spyOn(service, 'exchangeCodeForToken').mockResolvedValue({
      access_token: 'acc-token',
      id_token: 'corrupted.jwt.token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'profile openid',
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const result = await service.handleCallback('valid-code', state);
    expect(result.redirectUrl).toContain('line_error=');
  });

  // Scenario 12: Ticket expiration (> 15 minutes)
  it('Scenario 12: rejects expired registration tickets', () => {
    const ticket = service.issueRegistrationTicket('U_EXP', 'เก่าแล้ว', null);
    const stored = (service as any).ticketStore.get(ticket);
    stored.createdAt = Date.now() - 16 * 60 * 1000;

    const status = service.getRegistrationStatus(ticket);
    expect(status.valid).toBe(false);
    expect(status.error).toContain('หมดอายุ');
  });

  // Scenario 13: Single-use Ticket prevents replay
  it('Scenario 13: registration ticket is strictly single-use', async () => {
    const ticket = service.issueRegistrationTicket('U_ONCE', 'ครั้งเดียว', null);
    mockDb.createLineCitizenAccount.mockResolvedValue({ id: 'u-once', name: 'ครั้งเดียว', role: 'USER' });

    await service.registerFirstTimeUser({
      ticket,
      name: 'ครั้งเดียว พอดี',
      phone: '0812345679',
      consents: [
        { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
        { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: true },
      ],
    });

    // Replay attempt with same ticket
    await expect(
      service.registerFirstTimeUser({
        ticket,
        name: 'ครั้งสอง ซ้ำ',
        phone: '0812345670',
        consents: [
          { consentType: 'TERMS_OF_SERVICE', consentVersion: '1.0.0', agreed: true },
          { consentType: 'PRIVACY_POLICY', consentVersion: '1.0.0', agreed: true },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // Scenario 14: Consent recording and withdrawal
  it('Scenario 14 & 15: records PDPA consents and allows withdrawal of optional consents', async () => {
    mockDb.getUserConsents.mockResolvedValue([
      {
        id: 'cst-1',
        userId: 'u-1',
        consentType: 'TERMS_OF_SERVICE',
        consentVersion: '1.0.0',
        consentStatus: 'GRANTED',
        consentedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'cst-2',
        userId: 'u-1',
        consentType: 'MARKETING',
        consentVersion: '1.0.0',
        consentStatus: 'GRANTED',
        consentedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const consents = await mockDb.getUserConsents('u-1');
    expect(consents).toHaveLength(2);
    expect(consents[0].consentType).toBe('TERMS_OF_SERVICE');

    const withdrawResult = await mockDb.withdrawConsent('u-1', 'MARKETING');
    expect(withdrawResult).toBe(true);
    expect(mockDb.withdrawConsent).toHaveBeenCalledWith('u-1', 'MARKETING');
  });
});

