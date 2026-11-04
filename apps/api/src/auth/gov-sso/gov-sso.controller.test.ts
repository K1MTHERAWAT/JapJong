import { describe, expect, it, vi } from 'vitest';
import { GovResidenceController, GovSsoController } from './gov-sso.controller';
import { GovSsoService } from './gov-sso.service';

describe('GovSsoController', () => {
  it('calls service.handleSsoCallback with code', async () => {
    const mockService = {
      handleSsoCallback: vi.fn().mockResolvedValue({ success: true, token: 'mock-token' }),
      exchangeSsoSession: vi.fn(),
      searchResidences: vi.fn(),
    } as unknown as GovSsoService;

    const controller = new GovSsoController(mockService);
    const result = await controller.ssoCallback({ code: 'test-code' });

    expect(mockService.handleSsoCallback).toHaveBeenCalledWith('test-code');
    expect(result).toEqual({ success: true, token: 'mock-token' });
  });

  it('calls service.exchangeSsoSession with sessionToken', async () => {
    const mockService = {
      handleSsoCallback: vi.fn(),
      exchangeSsoSession: vi.fn().mockResolvedValue({ success: true, authenticated: true }),
      searchResidences: vi.fn(),
    } as unknown as GovSsoService;

    const controller = new GovSsoController(mockService);
    const result = await controller.ssoSession({ sessionToken: 'mock-sess-token' });

    expect(mockService.exchangeSsoSession).toHaveBeenCalledWith('mock-sess-token');
    expect(result).toEqual({ success: true, authenticated: true });
  });
});

describe('GovResidenceController', () => {
  it('calls service.searchResidences with query', async () => {
    const mockService = {
      handleSsoCallback: vi.fn(),
      exchangeSsoSession: vi.fn(),
      searchResidences: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as GovSsoService;

    const controller = new GovResidenceController(mockService);
    const query = { q: 'บ้านเลขที่ 99', limit: '10' };
    const result = await controller.search(query);

    expect(mockService.searchResidences).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [] });
  });
});

