import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  api,
  formatThaiDate,
  formatThaiDateTime,
  formatPeriodRange,
  formatMonthTitle,
  getStoredToken,
  setStoredAuth,
  clearStoredAuth,
} from './api';

describe('Web Utility & Date Formatter Functions', () => {
  describe('formatThaiDate', () => {
    it('returns "-" for undefined or empty input', () => {
      expect(formatThaiDate(undefined)).toBe('-');
      expect(formatThaiDate('')).toBe('-');
    });

    it('formats ISO date to Thai Buddhist calendar year (BE)', () => {
      const formatted = formatThaiDate('2026-11-20T09:00:00Z', true);
      expect(formatted).toContain('พ.ย.');
      expect(formatted).toContain('2569');
    });

    it('omits year when withYear is false', () => {
      const formatted = formatThaiDate('2026-05-15T10:00:00Z', false);
      expect(formatted).toContain('พ.ค.');
      expect(formatted).not.toContain('2569');
    });

    it('returns raw string if date is invalid', () => {
      expect(formatThaiDate('invalid-date')).toBe('invalid-date');
    });
  });

  describe('formatThaiDateTime', () => {
    it('returns "-" for empty string', () => {
      expect(formatThaiDateTime('')).toBe('-');
    });

    it('formats date and time in Thai format', () => {
      const date = new Date(2026, 10, 20, 14, 30);
      const formatted = formatThaiDateTime(date.toISOString(), true);
      expect(formatted).toContain('20');
      expect(formatted).toContain('พ.ย.');
      expect(formatted).toContain('2569');
      expect(formatted).toContain('14:30');
    });
  });

  describe('formatPeriodRange', () => {
    it('formats same-day period range cleanly', () => {
      const period = {
        start: '2026-11-25T09:00:00',
        end: '2026-11-25T12:00:00',
      };
      const formatted = formatPeriodRange(period);
      expect(formatted).toContain('25 พ.ย. 2569');
      expect(formatted).toContain('09:00–12:00');
    });

    it('formats multi-day period range across dates', () => {
      const period = {
        start: '2026-11-20T08:30:00',
        end: '2026-11-22T16:30:00',
      };
      const formatted = formatPeriodRange(period);
      expect(formatted).toContain('20 พ.ย.');
      expect(formatted).toContain('22 พ.ย. 2569');
    });
  });

  describe('formatMonthTitle', () => {
    it('formats year-month string to Thai full month and BE year', () => {
      expect(formatMonthTitle('2026-11')).toBe('พฤศจิกายน 2569');
      expect(formatMonthTitle('2026-01')).toBe('มกราคม 2569');
    });
  });

  describe('LocalStorage Auth Tokens', () => {
    const store = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };

    beforeEach(() => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('localStorage', mockLocalStorage);
      mockLocalStorage.clear();
    });

    it('stores, retrieves, and clears authentication tokens in browser storage', () => {
      expect(getStoredToken()).toBeNull();

      setStoredAuth('token-test-123', 'u-citizen-01');
      expect(getStoredToken()).toBe('token-test-123');

      clearStoredAuth();
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('API Client Requests & Error Handling', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      setStoredAuth('test-auth-token', 'u-test');
    });

    afterEach(() => {
      global.fetch = originalFetch;
      clearStoredAuth();
    });

    it('handles successful API requests attaching Bearer authorization', async () => {
      let capturedUrl = '';
      let capturedHeaders: any = {};

      global.fetch = vi.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedHeaders = init?.headers;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      const res = await api.me();
      expect((res as any).success).toBe(true);
      expect(capturedUrl).toBe('/api/auth/me');
      expect(capturedHeaders['Authorization']).toBe('Bearer test-auth-token');
    });

    it('handles HTTP error responses throwing message array or string', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: ['รหัสผ่านสั้นเกินไป', 'ชื่อไม่ถูกต้อง'] }),
        }),
      );

      await expect(api.login({ username: 'test', password: '1' })).rejects.toThrow('รหัสผ่านสั้นเกินไป, ชื่อไม่ถูกต้อง');
    });

    it('dispatches Auth & Session API endpoints', async () => {
      global.fetch = vi.fn().mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ path: url }),
        }),
      );

      await api.demoAccounts();
      await api.demoLogin('u-somchai');
      await api.login({ username: 'somchai', password: 'password' });
      await api.logout();
      await api.requestOtp('0812345678');
      await api.register({ name: 'ทดสอบ', phone: '0812345678', password: '123' });
      await api.updateProfile({ name: 'ใหม่' });
      await api.changePassword({ currentPassword: 'old', newPassword: 'new' });
      await api.saveSignature('sig-data');
      await api.savePin('123456');
      await api.verifyPin('123456');

      // OTP & Sessions
      await api.requestSignOtp('officer@test.com');
      await api.verifySignOtp('123456');
      await api.getSignSessionStatus();
      await api.revokeSignSession();
    });

    it('dispatches Resources API endpoints', async () => {
      global.fetch = vi.fn().mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ path: url }),
        }),
      );

      await api.venues();
      await api.equipment();
      await api.createVenue({ name: 'หอประชุม' });
      await api.updateVenue('v-01', { capacity: 100 });
      await api.createEquipment({ name: 'ไมค์' });
      await api.updateEquipment('e-01', { stock: 10 });
      await api.availability(['v-01'], '2026-11');
      await api.checkConflicts(['v-01'], []);
    });

    it('dispatches Requests, Approvals & Handovers API endpoints', async () => {
      global.fetch = vi.fn().mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ path: url }),
        }),
      );

      await api.listRequests({ mine: true, queue: 'staff' });
      await api.getRequest('r-01');
      await api.createBooking({ venueIds: ['v-01'], periods: [] });
      await api.createBorrow({ items: [], pickupDate: '2026-11-20', returnDate: '2026-11-22' });
      await api.createRepair({ building: 'อาคาร 1', floor: '1', location: 'ห้อง 1', category: 'ไฟ', detail: 'เสีย' });
      await api.signRequest('r-01', { decision: 'approve', pin: '123456' });
      await api.reschedule('r-01', []);
      await api.cancelRequest('r-01', 'ยกเลิก');
      await api.returnRequest('r-01');
      await api.handover('r-01', { phase: 'before', items: [] });
      await api.updateRepairStatus('r-01', { action: 'finish' });
    });

    it('dispatches Admin, Notifications & Verification API endpoints', async () => {
      global.fetch = vi.fn().mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ path: url }),
        }),
      );

      await api.users('somchai', 'STAFF');
      await api.updatePermissions('u-01', { role: 'STAFF' });
      await api.adminOverview();
      await api.notifications();
      await api.readAllNotifications();
      await api.resetDemo();

      await api.getVerification('doc-01');
      await api.createVerification('doc-01');
      await api.revokeVerification('doc-01', 'ยกเลิกเอกสาร');
      await api.publicVerify('token-123');
      await api.staffVerify('query-123');
      await api.staffVerifyHistory(20);
    });
  });
});
