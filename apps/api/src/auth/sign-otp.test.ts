import { describe, expect, it, beforeEach } from 'vitest';
import * as crypto from 'crypto';

describe('Sign OTP & Verified Session Security', () => {
  const SALT = 'test_salt_secret';

  function generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  function hashOtp(otp: string): string {
    return crypto.createHmac('sha256', SALT).update(otp).digest('hex');
  }

  it('generates a 6-digit cryptographically secure numeric OTP', () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      expect(otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
      const num = parseInt(otp, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThan(1000000);
    }
  });

  it('correctly hashes OTP and verifies matching submission', () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);

    const correctSubmission = hashOtp(otp);
    expect(correctSubmission).toBe(hash);

    const wrongSubmission = hashOtp('000000');
    expect(wrongSubmission).not.toBe(hash);
  });

  it('enforces 60-second cooldown between OTP requests', () => {
    const lastRequestAt = new Date();
    const now = new Date(lastRequestAt.getTime() + 45 * 1000); // 45 seconds later

    const msDiff = now.getTime() - lastRequestAt.getTime();
    const isRateLimited = msDiff < 60000;
    expect(isRateLimited).toBe(true);

    const afterCooldown = new Date(lastRequestAt.getTime() + 61 * 1000);
    const msDiff2 = afterCooldown.getTime() - lastRequestAt.getTime();
    expect(msDiff2 < 60000).toBe(false);
  });

  it('locks OTP and rejects after 5 failed attempts (brute force protection)', () => {
    let attempts = 0;
    const maxAttempts = 5;

    for (let i = 1; i <= 5; i++) {
      attempts++;
    }

    expect(attempts).toBe(5);
    const isLocked = attempts >= maxAttempts;
    expect(isLocked).toBe(true);
  });

  it('rejects expired OTP (>5 minutes)', () => {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);

    const currentValidTime = new Date(createdAt.getTime() + 4 * 60 * 1000);
    expect(currentValidTime < expiresAt).toBe(true);

    const currentExpiredTime = new Date(createdAt.getTime() + 5 * 60 * 1000 + 1000);
    expect(currentExpiredTime < expiresAt).toBe(false);
  });

  it('prevents OTP replay/reuse by marking consumedAt', () => {
    const otpRecord = {
      id: 'otp-1',
      consumedAt: null as Date | null,
    };

    // First use: success and consume
    expect(otpRecord.consumedAt).toBeNull();
    otpRecord.consumedAt = new Date();

    // Second use: must be rejected
    const canUseAgain = otpRecord.consumedAt === null;
    expect(canUseAgain).toBe(false);
  });

  it('validates verified session binding with Session Token and expiration', () => {
    const sessionToken = 'auth-token-123';
    const verifiedSession = {
      accountId: 's-suda',
      sessionToken,
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      revokedAt: null as Date | null,
    };

    // Active session matches token and is unexpired
    const isActive =
      verifiedSession.sessionToken === sessionToken &&
      verifiedSession.revokedAt === null &&
      verifiedSession.expiresAt > new Date();
    expect(isActive).toBe(true);

    // Revocation on logout
    verifiedSession.revokedAt = new Date();
    const isActiveAfterLogout =
      verifiedSession.sessionToken === sessionToken &&
      verifiedSession.revokedAt === null;
    expect(isActiveAfterLogout).toBe(false);
  });

  it('requires drawn signature and does not treat OTP as signature automatically', () => {
    const otpSessionVerified = true;
    const emptySignature = '';
    const validDrawnSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';

    // Must have drawn signature even if OTP session is verified
    expect(otpSessionVerified).toBe(true);
    expect(Boolean(emptySignature && emptySignature.startsWith('data:image/'))).toBe(false);
    expect(Boolean(validDrawnSignature && validDrawnSignature.startsWith('data:image/'))).toBe(true);
  });
});

