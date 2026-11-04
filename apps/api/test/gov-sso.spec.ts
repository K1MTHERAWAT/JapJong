import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { GovSsoService } from '../src/auth/gov-sso/gov-sso.service';

function createMockDb() {
  const accounts: any[] = [];
  const logs: any[] = [];
  let seq = 1;

  return {
    accounts,
    logs,
    createSessionCalledWith: null as string | null,
    sessionTokenToReturn: 'sess_valid_token_123' as string | null,
    async nextId(prefix: string) {
      return `${prefix}-${seq++}`;
    },
    async persistAccount(acc: any) {
      const idx = accounts.findIndex((a) => a.id === acc.id);
      if (idx >= 0) {
        accounts[idx] = acc;
      } else {
        accounts.push(acc);
      }
    },
    async createSession(accountId: string) {
      this.createSessionCalledWith = accountId;
      return this.sessionTokenToReturn;
    },
    async log(kind: string, action: string, detail: string, actor?: any) {
      logs.push({ kind, action, detail, actor });
    },
    toPublic(acc: any) {
      const { password, pin, ...pub } = acc;
      return pub;
    },
  };
}

describe('GovSsoService Automated Test Suite (TC-01 to TC-08)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.IAM_API_URL = 'https://api-auth.govcenter.co';
    process.env.E_SERVICE_CODE = 'jap-jong';
    process.env.E_SERVICE_API_KEY = 'esvc_test_valid_api_key';
    process.env.DEMO_MODE = 'false';
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('TC-01: Successful SSO Login maps user.name and camelCase residence fields and creates session', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    let capturedHeaders: any = null;
    let capturedBody: any = null;

    global.fetch = (async (_url: any, init: any) => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body || '{}');
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            user: {
              id: 'iam_u_1001',
              name: 'สมศรี รักชาติ',
              email: 'somsri@govcenter.co',
              phone: '0891112222',
              role: 'USER',
            },
            residences: [
              {
                membershipId: 'mem_01',
                role: 'HOST',
                status: 'VERIFIED',
                addressSnapshot: {
                  houseNo: '123/4',
                  moo: '5',
                  subdistrictNameTh: 'บางรักพัฒนา',
                  districtNameTh: 'บางบัวทอง',
                  provinceNameTh: 'นนทบุรี',
                },
              },
            ],
          };
        },
      } as any;
    }) as any;

    const result = await service.handleSsoCallback('valid_auth_code_999');

    assert.equal(capturedHeaders['x-api-key'], 'esvc_test_valid_api_key');
    assert.equal(capturedBody.code, 'valid_auth_code_999');
    assert.equal(result.success, true);
    assert.equal(result.token, 'sess_valid_token_123');
    assert.equal(result.account.name, 'สมศรี รักชาติ');
    assert.equal(result.account.addressHouseNo, '123/4');
    assert.equal(result.account.addressMoo, '5');
    assert.equal(result.account.addressSubdistrict, 'บางรักพัฒนา');
    assert.equal(result.account.addressDistrict, 'บางบัวทอง');
    assert.equal(result.account.addressProvince, 'นนทบุรี');
    assert.equal(result.user.firstName, 'สมศรี');
    assert.equal(result.user.lastName, 'รักชาติ');
  });

  it('TC-02: Missing or empty code & ticket throws UnauthorizedException', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    await assert.rejects(
      () => service.handleSsoCallback('   '),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match(err.message, /authorization code/);
        return true;
      },
    );
  });

  it('TC-03: Production rejects mock-sso-code when DEMO_MODE is false and NODE_ENV is production', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    let fetchCalled = false;
    global.fetch = (async () => {
      fetchCalled = true;
      return {
        ok: false,
        status: 401,
        async json() {
          return { message: 'Invalid SSO code' };
        },
      } as any;
    }) as any;

    await assert.rejects(
      () => service.handleSsoCallback('mock-sso-code'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        return true;
      },
    );
    assert.equal(fetchCalled, true, 'Must verify against real IAM API in production mode');
  });

  it('TC-04: IAM 401 / 403 / 500 error responses and missing E_SERVICE_API_KEY throw UnauthorizedException ( never falling back to E_SERVICE_CODE )', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    // 4a. Missing E_SERVICE_API_KEY must NOT fall back to E_SERVICE_CODE
    delete process.env.E_SERVICE_API_KEY;
    process.env.E_SERVICE_CODE = 'jap-jong';

    await assert.rejects(
      () => service.handleSsoCallback('some_code'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match(err.message, /E_SERVICE_API_KEY/);
        return true;
      },
    );

    // 4b. 401/403/500 from IAM
    process.env.E_SERVICE_API_KEY = 'esvc_test_valid_api_key';
    for (const status of [401, 403, 500]) {
      global.fetch = (async () => ({
        ok: false,
        status,
        async json() {
          return { message: `IAM error status ${status}` };
        },
      })) as any;

      await assert.rejects(
        () => service.handleSsoCallback('code_for_status_' + status),
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.match(err.message, new RegExp(`IAM error status ${status}`));
          return true;
        },
      );
    }
  });

  it('TC-05: IAM Timeout / Network failure throws UnauthorizedException with clear timeout message', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    global.fetch = (async () => {
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }) as any;

    await assert.rejects(
      () => service.handleSsoCallback('timeout_code'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match(err.message, /Timeout/);
        return true;
      },
    );
  });

  it('TC-06: Invalid IAM response format (missing user or missing user.id) throws UnauthorizedException', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    global.fetch = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return { valid: true, user: {} };
      },
    })) as any;

    await assert.rejects(
      () => service.handleSsoCallback('code_missing_user_id'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match(err.message, /ข้อมูลผู้ใช้งานจาก IAM-GOV ไม่ถูกต้อง/);
        return true;
      },
    );
  });

  it('TC-07: Suspended / inactive account or null session token throws UnauthorizedException', async () => {
    const mockDb = createMockDb();
    mockDb.accounts.push({
      id: 'u-suspended',
      username: 'sso_iam_suspended_1',
      name: 'ผู้ใช้ถูกระงับ',
      email: 'suspended@govcenter.co',
      phone: '0800000000',
      role: 'USER',
      active: false,
      accountStatus: 'SUSPENDED',
    });

    const service = new GovSsoService(mockDb as any);

    global.fetch = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          user: {
            id: 'iam_suspended_1',
            name: 'ผู้ใช้ถูกระงับ',
            email: 'suspended@govcenter.co',
          },
          residences: [],
        };
      },
    })) as any;

    await assert.rejects(
      () => service.handleSsoCallback('code_suspended'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match(err.message, /ระงับการใช้งาน/);
        return true;
      },
    );

    // Null session token test
    const mockDb2 = createMockDb();
    mockDb2.sessionTokenToReturn = '';
    const service2 = new GovSsoService(mockDb2 as any);

    await assert.rejects(
      () => service2.handleSsoCallback('code_null_session'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match(err.message, /ไม่สามารถสร้างเซสชัน/);
        return true;
      },
    );
  });

  it('TC-08: Direct Gov Center LINE Ticket exchange and Password Login (TownTrack pattern) succeed end-to-end', async () => {
    const mockDb = createMockDb();
    const service = new GovSsoService(mockDb as any);

    global.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/line/exchange')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { access_token: 'iam_jwt_token_abc' };
          },
        } as any;
      }
      if (urlStr.includes('/e-services/sso/generate-code')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { code: 'generated_sso_code_from_ticket' };
          },
        } as any;
      }
      if (urlStr.includes('/e-services/sso/verify-code')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              user: {
                id: 'iam_line_user_77',
                name: 'มานะ ล็อกอินไลน์',
                email: 'mana@govcenter.co',
                phone: '0819998888',
              },
              residences: [],
            };
          },
        } as any;
      }
      throw new Error('Unexpected URL: ' + urlStr);
    }) as any;

    const result = await service.handleSsoCallback(undefined, 'line_ticket_xyz');
    assert.equal(result.success, true);
    assert.equal(result.token, 'sess_valid_token_123');
    assert.equal(result.account.name, 'มานะ ล็อกอินไลน์');
  });
});

