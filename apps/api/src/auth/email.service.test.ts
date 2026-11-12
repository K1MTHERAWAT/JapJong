import { describe, it, expect, vi } from 'vitest';
import { EmailService, isDemoEmail } from './email.service';

describe('EmailService', () => {
  it('correctly identifies demo email domains', () => {
    expect(isDemoEmail('somchai@namcham.go.th')).toBe(true);
    expect(isDemoEmail('suda@example.com')).toBe(true);
    expect(isDemoEmail('tester@example.org')).toBe(true);
    expect(isDemoEmail('dev@test.com')).toBe(true);
    expect(isDemoEmail('user@demo.local')).toBe(true);

    expect(isDemoEmail('citizen@gmail.com')).toBe(false);
    expect(isDemoEmail('officer@yahoo.com')).toBe(false);
    expect(isDemoEmail('mayor@outlook.com')).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });

  it('dispatches mock OTP email for demo domains without external API call', async () => {
    const service = new EmailService();
    const result = await service.sendSignOtpEmail('officer@namcham.go.th', '123456', 'สมชาย');
    expect(result.success).toBe(true);
    expect(result.id).toBe('demo-mock-dispatch');
  });

  it('dispatches mock OTP email when options.isDemo is explicitly true', async () => {
    const service = new EmailService();
    const result = await service.sendSignOtpEmail(
      'citizen@gmail.com',
      '123456',
      'สมชาย',
      { isDemo: true },
    );
    expect(result.success).toBe(true);
    expect(result.id).toBe('demo-mock-dispatch');
  });

  it('handles real recipient dispatch safely in test environment', async () => {
    const service = new EmailService();
    const result = await service.sendSignOtpEmail('real_citizen@gmail.com', '654321', 'สมหวัง');
    expect(result.success).toBe(true);
    expect(result.id).toBe('mock-local-dispatch');
  });
});


