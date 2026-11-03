import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { Account, DEFAULT_PERMISSIONS } from '@jongwen/shared';

describe('UsersController', () => {
  let controller: UsersController;
  let mockDb: any;
  let testUser: Account;

  beforeEach(() => {
    testUser = {
      id: 'u-somchai',
      username: 'somchai',
      password: 'hashed-pwd',
      name: 'สมชาย ใจดี',
      nickname: 'ชาย',
      initial: 'ส',
      role: 'USER',
      position: 'ประชาชน',
      department: 'ประชาชนทั่วไป',
      phone: '0812345678',
      permissions: { ...DEFAULT_PERMISSIONS['USER'] },
      signature: null,
      pin: null,
      isDemo: false,
      active: true,
      accountStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    mockDb = {
      accounts: [testUser],
      toPublic: vi.fn((acc) => {
        const { password, ...pub } = acc;
        return pub;
      }),
      getLineAccount: vi.fn().mockResolvedValue({
        lineUserId: 'U12345',
        displayName: 'Somchai Line',
      }),
      getUserConsents: vi.fn().mockResolvedValue([
        {
          id: 'cst-1',
          consentType: 'TERMS_OF_SERVICE',
          consentVersion: '1.0.0',
          consentStatus: 'GRANTED',
        },
      ]),
      withdrawConsent: vi.fn().mockResolvedValue(true),
      dbAvailable: false,
    };

    controller = new UsersController(mockDb);
  });

  describe('getMe', () => {
    it('returns public account profile, line account, and consents', async () => {
      const res = await controller.getMe(testUser);
      expect(res.account.id).toBe('u-somchai');
      expect(res.account.name).toBe('สมชาย ใจดี');
      expect(res.lineAccount?.lineUserId).toBe('U12345');
      expect(res.consents).toHaveLength(1);
    });
  });

  describe('updateMe', () => {
    it('updates name and nickname correctly', async () => {
      const res = await controller.updateMe(testUser, {
        name: 'สมชาย ผู้เจริญ',
        nickname: 'พี่ชาย',
      });

      expect(res.name).toBe('สมชาย ผู้เจริญ');
      expect(testUser.name).toBe('สมชาย ผู้เจริญ');
      expect(testUser.nickname).toBe('พี่ชาย');
    });
  });

  describe('withdrawConsent', () => {
    it('allows withdrawal of optional consent', async () => {
      const res = await controller.withdrawConsent(testUser, {
        consentType: 'MARKETING',
      });
      expect(res.ok).toBe(true);
      expect(mockDb.withdrawConsent).toHaveBeenCalledWith('u-somchai', 'MARKETING');
    });

    it('rejects withdrawal of mandatory consent (TERMS_OF_SERVICE)', async () => {
      await expect(
        controller.withdrawConsent(testUser, {
          consentType: 'TERMS_OF_SERVICE',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects withdrawal of mandatory consent (PRIVACY_POLICY)', async () => {
      await expect(
        controller.withdrawConsent(testUser, {
          consentType: 'PRIVACY_POLICY',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

