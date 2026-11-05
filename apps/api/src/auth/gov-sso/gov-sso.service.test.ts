import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbService } from '../../db/db.service';
import { GovSsoService } from './gov-sso.service';

describe('GovSsoService', () => {
  let service: GovSsoService;
  let db: DbService;

  beforeEach(() => {
    process.env.E_SERVICE_API_KEY = 'test-api-key';
    db = new DbService();
    // In-memory fallback
    (db as any).dbAvailable = false;
    db.accounts = [];
    service = new GovSsoService(db);
  });

  describe('handleSsoCallback', () => {
    it('throws UnauthorizedException if code is empty', async () => {
      await expect(service.handleSsoCallback('')).rejects.toThrow(UnauthorizedException);
      await expect(service.handleSsoCallback('   ')).rejects.toThrow(UnauthorizedException);
    });

    it('successfully handles mock SSO callback and creates new account with residence snapshot', async () => {
      const result = await service.handleSsoCallback('mock-sso-code');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.account).toBeDefined();
      expect(result.account.role).toBe('USER');
      expect(result.account.name).toBe('สมชาย ใจดี (Gov SSO)');
      expect(result.account.addressHouseNo).toBe('99/1');
      expect(result.account.addressMoo).toBe('3');
      expect(result.account.addressSubdistrict).toBe('หนองบัว');
      expect(result.account.addressDistrict).toBe('เมืองบิซ่า');
      expect(result.account.addressProvince).toBe('นนทบุรี');
      expect(result.user).toEqual({
        id: result.account.id,
        firstName: 'สมชาย',
        lastName: 'ใจดี (Gov SSO)',
        role: 'USER',
        email: 'somchai.sso@govcenter.co',
        phone: '0812345678',
      });

      // Verify account was added to db
      const savedAccount = db.accounts.find((a) => a.id === result.account.id);
      expect(savedAccount).toBeDefined();
      expect(savedAccount?.username).toBe('sso_mock_mock-sso-code');
    });

    it('updates existing account if user logs in again', async () => {
      // First login
      const firstResult = await service.handleSsoCallback('mock-sso-code');
      const accountId = firstResult.account.id;

      // Second login
      const secondResult = await service.handleSsoCallback('mock-sso-code');
      expect(secondResult.account.id).toBe(accountId);
      expect(db.accounts.filter((a) => a.id === accountId).length).toBe(1);
    });

    it('links to existing account by matching email', async () => {
      // Create pre-existing user with same email
      db.accounts.push({
        id: 'u-existing',
        username: 'existing_user',
        password: 'hashedpassword',
        name: 'เดิม มีสุข',
        nickname: 'เดิม',
        initial: 'ด',
        role: 'USER',
        position: 'ประชาชน',
        department: 'ประชาชนทั่วไป',
        phone: '0899999999',
        email: 'somchai.sso@govcenter.co',
        permissions: {} as any,
        signature: null,
        pin: null,
        createdAt: new Date().toISOString(),
      });

      const result = await service.handleSsoCallback('mock-sso-code');
      expect(result.account.id).toBe('u-existing');
      expect(result.account.name).toBe('สมชาย ใจดี (Gov SSO)');
    });

    it('correctly maps IAM officer role to STAFF', async () => {
      vi.spyOn(service, 'verifyCodeWithIam').mockResolvedValueOnce({
        valid: true,
        user: {
          id: 'iam_officer_1',
          firstName: 'สมศรี',
          lastName: 'งานดี',
          role: 'OFFICER',
          email: 'somsri@govcenter.co',
        },
      });

      const result = await service.handleSsoCallback('real-code-officer');
      expect(result.account.role).toBe('STAFF');
      expect(result.account.position).toBe('เจ้าหน้าที่ อบต.');
    });

    it('correctly maps IAM admin role to ADMIN', async () => {
      vi.spyOn(service, 'verifyCodeWithIam').mockResolvedValueOnce({
        valid: true,
        user: {
          id: 'iam_admin_1',
          firstName: 'ผู้ดูแล',
          lastName: 'ระบบส่วนกลาง',
          role: 'ADMIN',
          email: 'admin@govcenter.co',
        },
      });

      const result = await service.handleSsoCallback('real-code-admin');
      expect(result.account.role).toBe('ADMIN');
      expect(result.account.position).toBe('ผู้ดูแลระบบ');
    });

    it('propagates error when IAM verification fails', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Invalid SSO code' }),
      } as any);

      await expect(service.handleSsoCallback('invalid-code')).rejects.toThrow(
        'Invalid SSO code',
      );
    });
  });
});

