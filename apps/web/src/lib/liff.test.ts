import { describe, expect, it } from 'vitest';
import { isValidLocalTarget, resolveLiffTarget } from './liff';

describe('LIFF Target Extraction & Open Redirect Protection', () => {
  describe('isValidLocalTarget', () => {
    it('accepts valid local application routes', () => {
      expect(isValidLocalTarget('/borrow')).toBe(true);
      expect(isValidLocalTarget('/booking')).toBe(true);
      expect(isValidLocalTarget('/repair')).toBe(true);
      expect(isValidLocalTarget('/requests')).toBe(true);
      expect(isValidLocalTarget('/documents')).toBe(true);
      expect(isValidLocalTarget('/staff/reviews')).toBe(true);
      expect(isValidLocalTarget('/admin/line')).toBe(true);
      expect(isValidLocalTarget('/borrow?step=2')).toBe(true);
    });

    it('rejects external URLs and open redirect attacks', () => {
      expect(isValidLocalTarget('https://evil.com')).toBe(false);
      expect(isValidLocalTarget('http://malicious.org/phish')).toBe(false);
      expect(isValidLocalTarget('//attacker.com/steal-token')).toBe(false);
      expect(isValidLocalTarget('javascript:alert(1)')).toBe(false);
      expect(isValidLocalTarget('')).toBe(false);
      expect(isValidLocalTarget(null)).toBe(false);
      expect(isValidLocalTarget(undefined)).toBe(false);
    });
  });

  describe('resolveLiffTarget', () => {
    it('resolves direct target param from URLSearchParams', () => {
      const sp = new URLSearchParams('target=/borrow');
      expect(resolveLiffTarget(sp)).toBe('/borrow');
    });

    it('resolves direct redirect param from URLSearchParams', () => {
      const sp = new URLSearchParams('redirect=/booking');
      expect(resolveLiffTarget(sp)).toBe('/booking');
    });

    it('resolves target from liff.state when encoded as query string (?target=/borrow)', () => {
      // LINE passes: ?liff.state=%3Ftarget%3D%2Fborrow
      const sp = new URLSearchParams('liff.state=%3Ftarget%3D%2Fborrow');
      expect(resolveLiffTarget(sp)).toBe('/borrow');
    });

    it('resolves target from liff.state when double encoded (%3Ftarget%3D%252Fborrow)', () => {
      const sp = new URLSearchParams('liff.state=%3Ftarget%3D%252Fborrow');
      expect(resolveLiffTarget(sp)).toBe('/borrow');
    });

    it('resolves target from liff.state when formatted as path directly (/borrow)', () => {
      const sp = new URLSearchParams('liff.state=/borrow');
      expect(resolveLiffTarget(sp)).toBe('/borrow');
    });

    it('resolves target from liff.state when encoded path (%2Fborrow)', () => {
      const sp = new URLSearchParams('liff.state=%2Fborrow');
      expect(resolveLiffTarget(sp)).toBe('/borrow');
    });

    it('resolves target from liff.state containing redirect parameter', () => {
      const sp = new URLSearchParams('liff.state=%3Fredirect%3D%2Frepair');
      expect(resolveLiffTarget(sp)).toBe('/repair');
    });

    it('extracts local path from full URL inside liff.state', () => {
      const sp = new URLSearchParams('liff.state=https%3A%2F%2Fjapjong.vercel.app%2Fdocuments');
      expect(resolveLiffTarget(sp)).toBe('/documents');
    });

    it('resolves target from a raw URL string directly', () => {
      const url = 'https://japjong.vercel.app/liff?liff.state=%3Ftarget%3D%2Fborrow';
      expect(resolveLiffTarget(null, url)).toBe('/borrow');
    });

    it('resolves target from a raw root URL string', () => {
      const url = 'https://japjong.vercel.app/?liff.state=%3Ftarget%3D%2Fbooking';
      expect(resolveLiffTarget(null, url)).toBe('/booking');
    });

    it('safely falls back to default route / when target is external phishing site', () => {
      const sp = new URLSearchParams('target=https://evil-phish.com');
      expect(resolveLiffTarget(sp, null, '/')).toBe('/');

      const sp2 = new URLSearchParams('target=//evil.com');
      expect(resolveLiffTarget(sp2, null, '/')).toBe('/');

      const sp3 = new URLSearchParams('liff.state=%3Ftarget%3D%2F%2Fevil.com');
      expect(resolveLiffTarget(sp3, null, '/')).toBe('/');
    });

    it('returns custom fallback when no target is present', () => {
      const sp = new URLSearchParams('');
      expect(resolveLiffTarget(sp, null, '/custom-fallback')).toBe('/custom-fallback');
    });
  });
});

