import { describe, expect, it, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { Account, DEFAULT_PERMISSIONS } from '@japjong/shared';
import { hashSecret } from './secret';

describe('AuthController Unit Tests', () => {
  let controller: AuthController;
  let mockDb: any;
  let mockEmailService: any;
  let testUser: Account;

  beforeEach(async () => {
    process.env.DEMO_MODE = 'true';
    const pwdHash = await hashSecret('password123');

    testUser = {
      id: 'u-test',
      username: 'somchai_test',
      password: pwdHash,
      name: 'สมชาย ทดสอบ',
      nickname: 'ชาย',
      initial: 'ส',
      role: 'USER',
      position: 'ประชาชน',
      department: 'ชุมชนน้ำชำ',
      phone: '0812345678',
      email: 'somchai@namcham.go.th',
      emailVerified: true,
      addressHouseNo: '123',
      addressMoo: '1',
      addressSubdistrict: 'น้ำชำ',
      addressDistrict: 'สูงเม่น',
      addressProvince: 'แพร่',
      permissions: { ...DEFAULT_PERMISSIONS },
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pin: await hashSecret('123456'),
      active: true,
      isDemo: true,
      createdAt: new Date().toISOString(),
    };

    mockDb = {
      accounts: [testUser],
      checkPendingDemoReset: vi.fn(),
      toPublic: vi.fn((a) => {
        const { password, ...pub } = a;
        return pub;
      }),
      createSession: vi.fn().mockResolvedValue('test-session-token'),
      revokeSession: vi.fn().mockResolvedValue(true),
      persistAccount: vi.fn().mockImplementation((a) => {
        const idx = mockDb.accounts.findIndex((acc: Account) => acc.id === a.id);
        if (idx >= 0) mockDb.accounts[idx] = a;
        else mockDb.accounts.push(a);
        return Promise.resolve();
      }),
      log: vi.fn().mockResolvedValue(true),
      nextId: vi.fn().mockResolvedValue('u-new-001'),
      prisma: {
        account: {
          upsert: vi.fn().mockResolvedValue(testUser),
        },
      },
      getLatestSignOtp: vi.fn().mockResolvedValue(null),
      createSignOtp: vi.fn().mockResolvedValue({ id: 'otp-01' }),
      recordSignOtpAttempt: vi.fn().mockResolvedValue(true),
      consumeSignOtp: vi.fn().mockResolvedValue(true),
      createSignVerifiedSession: vi.fn().mockImplementation((accId, tok, exp) =>
        Promise.resolve({ id: 'sess-01', accountId: accId, sessionToken: tok, expiresAt: exp || new Date(Date.now() + 1800000) }),
      ),
      getSignVerifiedSession: vi.fn().mockResolvedValue({ id: 'sess-01', expiresAt: new Date(Date.now() + 1800000) }),
      revokeSignVerifiedSession: vi.fn().mockResolvedValue(true),
      revokeSignVerifiedSessionByAccount: vi.fn().mockResolvedValue(true),
    };

    mockEmailService = {
      sendSignOtpEmail: vi.fn().mockResolvedValue({ success: true, id: 'test-email-id' }),
    };

    controller = new AuthController(mockDb, mockEmailService);
  });

  describe('GET demo-accounts & POST demo-login', () => {
    it('returns available demo accounts when DEMO_MODE is true', async () => {
      const accounts = await controller.demoAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(1);
      expect(accounts[0].name).toBe('สมชาย ทดสอบ');
    });

    it('throws NotFoundException when DEMO_MODE is false', async () => {
      process.env.DEMO_MODE = 'false';
      await expect(controller.demoAccounts()).rejects.toThrow(NotFoundException);
      process.env.DEMO_MODE = 'true';
    });

    it('logs in successfully via demo-login', async () => {
      const res = await controller.demoLogin({ accountId: 'u-test' });
      expect(res.token).toBe('test-session-token');
      expect(res.account.id).toBe('u-test');
    });

    it('throws BadRequestException if accountId is missing', async () => {
      await expect(controller.demoLogin({ accountId: '' })).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if demo account not found', async () => {
      await expect(controller.demoLogin({ accountId: 'non-existing' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('POST login & logout', () => {
    it('authenticates with valid username and password', async () => {
      const res = await controller.login({ username: 'somchai_test', password: 'password123' });
      expect(res.token).toBe('test-session-token');
      expect(res.account.username).toBe('somchai_test');
    });

    it('authenticates with valid phone number and password', async () => {
      const res = await controller.login({ username: '0812345678', password: 'password123' });
      expect(res.token).toBe('test-session-token');
    });

    it('throws UnauthorizedException with wrong password', async () => {
      await expect(controller.login({ username: 'somchai_test', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if account is inactive', async () => {
      testUser.active = false;
      await expect(controller.login({ username: 'somchai_test', password: 'password123' })).rejects.toThrow(/ถูกระงับ/);
    });

    it('logs out and revokes session', async () => {
      const res = await controller.logout({ token: 'test-session-token' });
      expect(res.ok).toBe(true);
      expect(mockDb.revokeSession).toHaveBeenCalledWith('test-session-token');
    });
  });

  describe('POST request-otp & register', () => {
    it('validates phone number on request-otp', async () => {
      await expect(controller.requestOtp({ phone: '123' })).rejects.toThrow(BadRequestException);
    });

    it('handles request-otp in demo mode', async () => {
      const res = await controller.requestOtp({ phone: '0812345678' });
      expect(res.ok).toBe(true);
      expect(res.message).toContain('000000');
    });

    it('rejects registration with duplicate phone number', async () => {
      await expect(
        controller.register({
          name: 'นาย สอง',
          phone: testUser.phone,
          password: 'Password123',
          otp: '000000',
        }),
      ).rejects.toThrow(/เบอร์โทรศัพท์นี้ลงทะเบียนแล้ว/);
    });

    it('registers new user with valid OTP', async () => {
      const res = await controller.register({
        name: 'นาย สมศักดิ์',
        phone: '0891112233',
        password: 'Password123',
        otp: '000000',
      });
      expect(res.token).toBeDefined();
      expect(res.account.phone).toBe('0891112233');
      expect(res.account.username).toBe('0891112233');
    });
  });

  describe('Profile & Password Management', () => {
    it('returns current user with me()', () => {
      const me = controller.me(testUser);
      expect(me.username).toBe('somchai_test');
    });

    it('updates profile fields', async () => {
      const updated = await controller.updateProfile(testUser, {
        name: 'สมชาย อัปเดต',
        nickname: 'ชายใหม่',
        addressHouseNo: '99/1',
      });
      expect(testUser.name).toBe('สมชาย อัปเดต');
      expect(testUser.nickname).toBe('ชายใหม่');
      expect(testUser.addressHouseNo).toBe('99/1');
    });

    it('validates email format in updateProfile', async () => {
      await expect(controller.updateProfile(testUser, { email: 'invalid-email' })).rejects.toThrow(BadRequestException);
    });

    it('changes password with correct current password', async () => {
      const res = await controller.changePassword(testUser, {
        currentPassword: 'password123',
        newPassword: 'newPassword456',
      });
      expect(res.ok).toBe(true);
    });

    it('rejects password change if current password is wrong', async () => {
      await expect(
        controller.changePassword(testUser, {
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword456',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('saves drawn signature', async () => {
      const newSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await controller.saveSignature(testUser, { signature: newSig });
      expect(testUser.signature).toBe(newSig);
    });

    it('saves and verifies 6-digit PIN', async () => {
      await controller.savePin(testUser, { pin: '654321' });
      expect(testUser.pin).toBeDefined();

      const verifyRes = await controller.verifyPin(testUser, { pin: '654321' });
      expect(verifyRes.ok).toBe(true);

      await expect(controller.verifyPin(testUser, { pin: '000000' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Sign OTP & Session Management', () => {
    it('requests email OTP for signing', async () => {
      const res = await controller.requestSignOtp(testUser, {}, { ip: '127.0.0.1', headers: {} });
      expect(res.ok).toBe(true);
      expect(res.maskedEmail).toBeDefined();
      expect(res.demoOtp).toBeDefined();
    });

    it('checks signing session status', async () => {
      const res = await controller.getSignSessionStatus(testUser, { token: 'test-session-token' });
      expect(res.isVerified).toBe(true);
    });

    it('throws BadRequestException if submitted OTP is not 6 digits', async () => {
      await expect(
        controller.verifySignOtp(testUser, { otp: '12' }, { token: 'tok', headers: {} }),
      ).rejects.toThrow('รหัส OTP ต้องเป็นตัวเลข 6 หลัก');
    });

    it('throws BadRequestException if no valid OTP exists in db', async () => {
      mockDb.getLatestSignOtp.mockResolvedValueOnce(null);
      await expect(
        controller.verifySignOtp(testUser, { otp: '123456' }, { token: 'tok', headers: {} }),
      ).rejects.toThrow(/ไม่พบรหัส OTP ที่ใช้งานได้/);
    });

    it('increments attempts and throws UnauthorizedException on incorrect OTP', async () => {
      const salt = process.env.OTP_SECRET || 'japjong_sign_otp_secret_salt';
      const actualHash = crypto.createHmac('sha256', salt).update('654321').digest('hex');
      mockDb.getLatestSignOtp.mockResolvedValueOnce({
        id: 'otp-01',
        attempts: 0,
        codeHash: actualHash,
        expiresAt: new Date(Date.now() + 300000),
      });

      await expect(
        controller.verifySignOtp(testUser, { otp: '111111' }, { token: 'tok', headers: {} }),
      ).rejects.toThrow(/รหัส OTP ไม่ถูกต้อง/);
      expect(mockDb.recordSignOtpAttempt).toHaveBeenCalledWith('otp-01', 1);
    });

    it('verifies matching OTP, consumes it, and creates verified session', async () => {
      const salt = process.env.OTP_SECRET || 'japjong_sign_otp_secret_salt';
      const code = '123456';
      const codeHash = crypto.createHmac('sha256', salt).update(code).digest('hex');
      mockDb.getLatestSignOtp.mockResolvedValueOnce({
        id: 'otp-02',
        attempts: 0,
        codeHash,
        expiresAt: new Date(Date.now() + 300000),
      });

      const res = await controller.verifySignOtp(testUser, { otp: code }, { token: 'staff-token', headers: {} });
      expect(res.ok).toBe(true);
      expect(res.verified).toBe(true);
      expect(mockDb.consumeSignOtp).toHaveBeenCalledWith('otp-02');
      expect(mockDb.createSignVerifiedSession).toHaveBeenCalledWith(testUser.id, 'staff-token', expect.any(Date));
    });

    it('revokes signing session', async () => {
      const res = await controller.revokeSignSession(testUser, { token: 'test-session-token' });
      expect(res.ok).toBe(true);
      expect(mockDb.revokeSignVerifiedSession).toHaveBeenCalledWith('test-session-token');
    });
  });
});
