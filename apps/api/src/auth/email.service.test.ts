import { describe, it, expect, vi } from 'vitest';
import { EmailService } from './email.service';

describe('EmailService', () => {
  it('dispatches mock OTP email successfully', async () => {
    const service = new EmailService();
    const result = await service.sendSignOtpEmail('officer@example.com', '123456', 'สมชาย');
    expect(result.success).toBe(true);
    expect(result.id).toBe('mock-local-dispatch');
  });
});

