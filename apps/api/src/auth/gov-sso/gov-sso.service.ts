import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Account, DEFAULT_PERMISSIONS, Role } from '@japjong/shared';
import { DbService } from '../../db/db.service';
import { hashSecret } from '../secret';
import { SearchResidenceDto } from './gov-sso.dto';

export interface IamGovUser {
  id: string;
  citizenId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  lineId?: string;
  pictureUrl?: string;
  avatarUrl?: string;
  [key: string]: any;
}

export interface IamGovAddressFields {
  residenceId?: string;
  residenceCode?: string;
  formattedAddress?: string;
  formatted_address?: string;
  houseNo?: string;
  moo?: string;
  soi?: string;
  road?: string;
  postalCode?: string;
  postal_code?: string;
  subdistrictNameTh?: string;
  subdistrict_name_th?: string;
  districtNameTh?: string;
  district_name_th?: string;
  provinceNameTh?: string;
  province_name_th?: string;
  [key: string]: any;
}

export interface IamGovResidence {
  membershipId?: string;
  role?: string;
  status?: string;
  verifiedAt?: string;
  residence?: IamGovAddressFields;
  addressSnapshot?: IamGovAddressFields;
  [key: string]: any;
}

export interface IamGovVerifyResult {
  valid?: boolean;
  user?: IamGovUser;
  residences?: IamGovResidence[];
  memberships?: any[];
  [key: string]: any;
}

@Injectable()
export class GovSsoService {
  private readonly logger = new Logger(GovSsoService.name);

  constructor(private readonly db: DbService) {}

  private getIamApiUrl(): string {
    return (process.env.IAM_API_URL || 'https://api-auth.govcenter.co').replace(/\/+$/, '');
  }

  private getServiceCode(): string {
    return (process.env.E_SERVICE_CODE || 'jap-jong').trim();
  }

  private getApiKey(): string {
    const key = (process.env.E_SERVICE_API_KEY || '').trim();
    if (!key) {
      throw new UnauthorizedException('ยังไม่ได้ตั้งค่า E_SERVICE_API_KEY ในระบบ');
    }
    return key;
  }

  private isDemoOrTestMode(): boolean {
    return process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
  }

  /**
   * แลก Authorization Code (หรือ LINE one-time Ticket) จาก IAM-GOV SSO กับข้อมูลผู้ใช้
   */
  async handleSsoCallback(code?: string, ticket?: string) {
    let trimmedCode = (code || '').trim();
    const trimmedTicket = (ticket || '').trim();

    this.logger.log(
      `[GovSSO] รับคำขอ POST /auth/sso-callback (codeLen=${trimmedCode.length}, ticketLen=${trimmedTicket.length})`,
    );

    if (!trimmedCode && trimmedTicket) {
      this.logger.log('[GovSSO] ไม่พบ code โดยตรง กำลังแลก ticket ผ่าน /auth/line/exchange และสร้าง SSO code...');
      trimmedCode = await this.exchangeLineTicketForSsoCode(trimmedTicket);
    }

    if (!trimmedCode) {
      this.logger.warn('[GovSSO] ปฏิเสธคำขอ: ไม่พบ authorization code');
      throw new UnauthorizedException('กรุณาระบุ authorization code');
    }

    let data: IamGovVerifyResult;

    // รองรับ Mock Code เฉพาะในโหมดทดสอบ / เดโม หรือ Unit Test เท่านั้น
    if (this.isDemoOrTestMode() && (trimmedCode === 'mock-sso-code' || trimmedCode.startsWith('demo-'))) {
      this.logger.log(`[GovSSO] ใช้ Mock Verify Result สำหรับ code=${trimmedCode}`);
      data = this.getMockVerifyResult(trimmedCode);
    } else {
      data = await this.verifyCodeWithIam(trimmedCode);
    }

    const iamUser = data?.user;
    if (!iamUser || !iamUser.id || !String(iamUser.id).trim()) {
      this.logger.warn(`[GovSSO] ข้อมูลผู้ใช้จาก IAM-GOV ไม่สมบูรณ์: ${JSON.stringify(data)}`);
      throw new UnauthorizedException('ข้อมูลผู้ใช้งานจาก IAM-GOV ไม่ถูกต้องหรือไม่พบผู้ใช้');
    }

    const account = await this.upsertAccountFromIam(iamUser, data.residences || []);
    const token = await this.db.createSession(account.id);
    if (!token) {
      throw new UnauthorizedException('ไม่สามารถสร้างเซสชันผู้ใช้งานได้');
    }

    this.logger.log(`[GovSSO] ล็อกอินสำเร็จ: accountId=${account.id}, username=${account.username}, role=${account.role}`);

    await this.db.log('user', 'เข้าสู่ระบบด้วย Gov Center SSO', `ผู้ใช้ ${account.name} (IAM ID: ${iamUser.id}) เข้าสู่ระบบสำเร็จ`, {
      id: account.id,
      name: account.name,
      role: account.role,
    });

    const nameParts = account.name.trim().split(/\s+/);
    const firstName = iamUser.firstName?.trim() || nameParts[0] || account.name;
    const lastName = iamUser.lastName?.trim() || nameParts.slice(1).join(' ') || '';

    return {
      success: true,
      token,
      account: this.db.toPublic(account),
      user: {
        id: account.id,
        firstName,
        lastName,
        role: account.role,
        email: account.email,
        phone: account.phone,
      },
      ssoPayload: data,
    };
  }

  /**
   * เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของ Gov Center โดยตรง (Server-to-Server แบบเดียวกับ TownTrack)
   */
  async loginWithPassword(email: string, password: string) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = password || '';
    if (!cleanEmail || !cleanPassword) {
      throw new UnauthorizedException('กรุณากรอกอีเมลและรหัสผ่าน Gov Center');
    }

    const serviceCode = this.getServiceCode();
    const loginUrl = `${this.getIamApiUrl()}/auth/login?service=${encodeURIComponent(serviceCode)}`;

    let loginData: any;
    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          service: serviceCode,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        let errMessage = 'อีเมลหรือรหัสผ่าน Gov Center ไม่ถูกต้อง';
        try {
          const errBody = await response.json();
          if (errBody?.message) {
            errMessage = Array.isArray(errBody.message) ? errBody.message.join(', ') : errBody.message;
          } else if (errBody?.error && typeof errBody.error === 'string' && errBody.error !== 'Unauthorized') {
            errMessage = errBody.error;
          }
        } catch {
          // fallback
        }
        throw new UnauthorizedException(errMessage);
      }

      loginData = await response.json();
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new UnauthorizedException(
        isTimeout
          ? 'การเชื่อมต่อกับ IAM-GOV หมดเวลา (Timeout)'
          : `ไม่สามารถเชื่อมต่อไปยัง IAM-GOV: ${err?.message || 'Unknown error'}`,
      );
    }

    let ssoCode = loginData?.code ? String(loginData.code).trim() : '';
    const accessToken = loginData?.access_token || loginData?.accessToken;

    if (!ssoCode && accessToken) {
      ssoCode = await this.generateSsoCodeWithBearer(String(accessToken));
    }

    if (!ssoCode) {
      throw new UnauthorizedException('ไม่ได้รับรหัสยืนยันตัวตน (SSO Code) จาก Gov Center');
    }

    return this.handleSsoCallback(ssoCode);
  }

  /**
   * แลก LINE Ticket จาก /auth/line/callback เป็น IAM Access Token แล้วออก SSO Code
   */
  private async exchangeLineTicketForSsoCode(ticket: string): Promise<string> {
    const exchangeUrl = `${this.getIamApiUrl()}/auth/line/exchange`;
    try {
      const response = await fetch(exchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new UnauthorizedException('รหัสเข้าสู่ระบบ LINE (Ticket) หมดอายุหรือไม่ถูกต้อง');
      }

      const data: any = await response.json();
      if (data?.code) {
        return String(data.code).trim();
      }

      const accessToken = data?.access_token || data?.accessToken;
      if (!accessToken) {
        throw new UnauthorizedException('ไม่พบ Access Token จากการแลก LINE Ticket ของ Gov Center');
      }

      return await this.generateSsoCodeWithBearer(String(accessToken));
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(`ไม่สามารถแลก LINE Ticket กับ IAM-GOV: ${err?.message || 'Unknown error'}`);
    }
  }

  /**
   * ขอออก SSO Code จาก IAM Access Token ผ่าน POST /e-services/sso/generate-code
   */
  private async generateSsoCodeWithBearer(accessToken: string): Promise<string> {
    const generateUrl = `${this.getIamApiUrl()}/e-services/sso/generate-code`;
    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ eServiceCode: this.getServiceCode() }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new UnauthorizedException(`ไม่สามารถสร้างรหัส SSO จาก Gov Center ได้ (${response.status})`);
    }

    const data: any = await response.json();
    if (!data?.code) {
      throw new UnauthorizedException('Gov Center ไม่ได้ส่งรหัส SSO กลับมา');
    }
    return String(data.code).trim();
  }

  /**
   * ส่ง authorization code ไปยัง IAM-GOV verify-code endpoint
   */
  async verifyCodeWithIam(trimmedCode: string): Promise<IamGovVerifyResult> {
    const verifyUrl = `${this.getIamApiUrl()}/e-services/sso/verify-code`;
    const apiKey = this.getApiKey();

    try {
      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ code: trimmedCode }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        let errMessage = `การยืนยันรหัส SSO กับ IAM-GOV ล้มเหลว (${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody?.message) {
            errMessage = Array.isArray(errBody.message) ? errBody.message.join(', ') : errBody.message;
          }
        } catch {
          // ใช้ fallback message
        }
        this.logger.warn(`IAM-GOV verify failed: ${response.status} - ${errMessage}`);
        throw new UnauthorizedException(errMessage);
      }

      const parsed = await response.json();
      if (!parsed || typeof parsed !== 'object') {
        throw new UnauthorizedException('รูปแบบข้อมูลจาก IAM-GOV ไม่ถูกต้อง');
      }
      return parsed as IamGovVerifyResult;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const detail = isTimeout ? 'หมดเวลาการเชื่อมต่อ (Timeout)' : err?.message || 'Unknown error';
      this.logger.error(`Network or fetch error while verifying SSO code: ${detail}`, err?.stack);
      throw new UnauthorizedException(`ไม่สามารถเชื่อมต่อไปยัง IAM-GOV: ${detail}`);
    }
  }

  /**
   * แลก SSO Session Token หรือ Code เป็น Session ในระบบจับจอง
   */
  async exchangeSsoSession(sessionToken: string) {
    const trimmed = (sessionToken || '').trim();
    if (!trimmed) {
      throw new UnauthorizedException('กรุณาระบุ session token');
    }
    const result = await this.handleSsoCallback(trimmed);
    return {
      ...result,
      authenticated: true,
    };
  }

  /**
   * Proxy ค้นหาบ้านและที่อยู่จาก IAM-GOV Residence API
   */
  async searchResidences(params: SearchResidenceDto) {
    const qs = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        qs.append(key, String(val).trim());
      }
    }

    const searchUrl = `${this.getIamApiUrl()}/e-services/residences/search?${qs.toString()}`;
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'x-api-key': this.getApiKey(),
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new UnauthorizedException(`ค้นหาที่อยู่จาก IAM-GOV ล้มเหลว (${response.status})`);
    }

    return response.json();
  }

  /**
   * แม็ปข้อมูลจาก IAM-GOV User และ Residence Snapshot ลงตาราง Account ของจับจอง
   * รองรับทั้ง user.name และ firstName/lastName รวมถึงที่อยู่ทั้งแบบ camelCase และ snake_case
   */
  private async upsertAccountFromIam(iamUser: IamGovUser, residences: IamGovResidence[]): Promise<Account> {
    const ssoUsername = `sso_${iamUser.id}`;
    const email = iamUser.email ? iamUser.email.trim().toLowerCase() : undefined;
    const phoneDigits = iamUser.phone ? iamUser.phone.replace(/\D/g, '') : '';

    // ค้นหาบัญชีเดิมตาม SSO username, email หรือเบอร์โทร (ใน memory ก่อน แล้วตรวจสอบใน DB กรณีมีหลาย instance)
    let account = this.db.accounts.find(
      (a) =>
        a.username === ssoUsername ||
        (email && a.email && a.email.toLowerCase() === email) ||
        (phoneDigits && phoneDigits.length >= 9 && a.phone.replace(/\D/g, '') === phoneDigits),
    );

    if (!account && this.db.dbAvailable) {
      try {
        const dbAcc = await this.db.prisma.account.findFirst({
          where: { username: ssoUsername },
        });
        if (dbAcc) {
          account = {
            id: dbAcc.id,
            username: dbAcc.username,
            password: dbAcc.password,
            name: dbAcc.name,
            nickname: dbAcc.nickname,
            initial: dbAcc.initial,
            role: (dbAcc.role as Role) || 'USER',
            position: dbAcc.position,
            department: dbAcc.department,
            phone: dbAcc.phone,
            lineName: dbAcc.lineName ?? undefined,
            lineUserId: dbAcc.lineUserId ?? undefined,
            permissions:
              dbAcc.permissions && typeof dbAcc.permissions === 'object'
                ? (dbAcc.permissions as any)
                : { ...DEFAULT_PERMISSIONS[(dbAcc.role as Role) || 'USER'] },
            signature: dbAcc.signature,
            pin: dbAcc.pin,
            isDemo: dbAcc.isDemo,
            active: dbAcc.active,
            createdAt: dbAcc.createdAt.toISOString(),
          };
          this.db.accounts.unshift(account);
        }
      } catch {
        // fallback to creating new account
      }
    }

    if (account && (account.active === false || account.accountStatus === 'SUSPENDED')) {
      throw new UnauthorizedException('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
    }

    // เลือก residence ที่ VERIFIED หรือรายการแรก
    const verifiedResidence = residences.find((r) => r.status === 'VERIFIED') || residences[0];
    const snapshot = verifiedResidence?.addressSnapshot;
    const resObj = verifiedResidence?.residence;

    const houseNo = snapshot?.houseNo ?? resObj?.houseNo;
    const moo = snapshot?.moo ?? resObj?.moo;
    const subdistrict =
      snapshot?.subdistrictNameTh ??
      snapshot?.subdistrict_name_th ??
      resObj?.subdistrictNameTh ??
      resObj?.subdistrict_name_th ??
      (resObj as any)?.subdistrict?.nameTh;
    const district =
      snapshot?.districtNameTh ??
      snapshot?.district_name_th ??
      resObj?.districtNameTh ??
      resObj?.district_name_th ??
      (resObj as any)?.district?.nameTh;
    const province =
      snapshot?.provinceNameTh ??
      snapshot?.province_name_th ??
      resObj?.provinceNameTh ??
      resObj?.province_name_th ??
      (resObj as any)?.province?.nameTh;

    const firstLastCombined = `${iamUser.firstName?.trim() || ''} ${iamUser.lastName?.trim() || ''}`.trim();
    const rawName = firstLastCombined || iamUser.name?.trim() || '';
    const fullName = rawName || `ผู้ใช้ GovCenter (${iamUser.id})`;
    const firstWord = iamUser.firstName?.trim() || fullName.split(/\s+/)[0] || 'ผู้ใช้';
    const nickname = firstWord;
    const initial = (firstWord || fullName).charAt(0) || 'ผ';

    const mappedRole = this.mapIamRole(iamUser.role);

    if (account) {
      // อัปเดตข้อมูลบัญชีเดิม
      account.name = fullName || account.name;
      account.nickname = nickname || account.nickname;
      account.initial = initial || account.initial;
      if (email) {
        account.email = email;
        account.emailVerified = true;
      }
      if (iamUser.phone) {
        account.phone = iamUser.phone;
      }
      if (houseNo) account.addressHouseNo = String(houseNo);
      if (moo) account.addressMoo = String(moo);
      if (subdistrict) account.addressSubdistrict = String(subdistrict);
      if (district) account.addressDistrict = String(district);
      if (province) account.addressProvince = String(province);
      await this.db.persistAccount(account);
      return account;
    }

    // สร้างบัญชีใหม่
    const newId = await this.db.nextId('u');
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hashedPassword = await hashSecret(randomPassword);

    account = {
      id: newId,
      username: ssoUsername,
      password: hashedPassword,
      name: fullName,
      nickname,
      initial,
      role: mappedRole,
      position: mappedRole === 'STAFF' ? 'เจ้าหน้าที่ อบต.' : mappedRole === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'ประชาชน',
      department: 'ผู้รับบริการผ่าน Gov Center',
      phone: iamUser.phone || '',
      email,
      emailVerified: !!email,
      addressHouseNo: houseNo ? String(houseNo) : undefined,
      addressMoo: moo ? String(moo) : undefined,
      addressSubdistrict: subdistrict ? String(subdistrict) : undefined,
      addressDistrict: district ? String(district) : undefined,
      addressProvince: province ? String(province) : undefined,
      permissions: { ...DEFAULT_PERMISSIONS[mappedRole] },
      signature: null,
      pin: null,
      active: true,
      accountStatus: 'ACTIVE',
      registrationCompletedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.db.accounts.unshift(account);
    await this.db.persistAccount(account);
    return account;
  }

  private mapIamRole(rawRole?: string): Role {
    const roleStr = String(rawRole || '').toUpperCase();
    if (roleStr === 'ADMIN' || roleStr === 'SUPERADMIN') return 'ADMIN';
    if (roleStr === 'APPROVER_L1' || roleStr === 'MAYOR' || roleStr === 'CHIEF') return 'APPROVER_L1';
    if (roleStr === 'APPROVER_L2' || roleStr === 'PALAD') return 'APPROVER_L2';
    if (roleStr === 'STAFF' || roleStr === 'OFFICER') return 'STAFF';
    return 'USER';
  }

  private getMockVerifyResult(code: string): IamGovVerifyResult {
    return {
      valid: true,
      user: {
        id: `mock_${code}`,
        citizenId: '1100500123456',
        firstName: 'สมชาย',
        lastName: 'ใจดี (Gov SSO)',
        email: 'somchai.sso@govcenter.co',
        phone: '0812345678',
        role: 'CITIZEN',
      },
      residences: [
        {
          membershipId: 'mem_sso_001',
          role: 'OWNER',
          status: 'VERIFIED',
          verifiedAt: new Date().toISOString(),
          addressSnapshot: {
            residenceId: 'res_sso_001',
            houseNo: '99/1',
            moo: '3',
            subdistrict_name_th: 'หนองบัว',
            district_name_th: 'เมืองบิซ่า',
            province_name_th: 'นนทบุรี',
          },
        },
      ],
    };
  }
}
