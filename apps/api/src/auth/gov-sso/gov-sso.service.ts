import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Account, DEFAULT_PERMISSIONS, Role } from '@japjong/shared';
import { DbService } from '../../db/db.service';
import { hashSecret } from '../secret';
import { SearchResidenceDto } from './gov-sso.dto';

export interface IamGovUser {
  id: string;
  citizenId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  pictureUrl?: string;
  avatarUrl?: string;
  [key: string]: any;
}

export interface IamGovResidence {
  membershipId?: string;
  role?: string;
  status?: string;
  verifiedAt?: string;
  addressSnapshot?: {
    residenceId?: string;
    residenceCode?: string;
    formatted_address?: string;
    houseNo?: string;
    moo?: string;
    soi?: string;
    road?: string;
    postal_code?: string;
    subdistrict_name_th?: string;
    district_name_th?: string;
    province_name_th?: string;
    [key: string]: any;
  };
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

  private getApiKey(): string {
    return (
      process.env.E_SERVICE_API_KEY ||
      process.env.E_SERVICE_CODE ||
      'sk_fdf9bac1f02ac3642fe1829003c5aadbfd01e1ae04c45a888288a113714df395'
    );
  }

  /**
   * แลก Authorization Code จาก IAM-GOV SSO กับข้อมูลผู้ใช้
   */
  async handleSsoCallback(code: string) {
    const trimmedCode = (code || '').trim();
    this.logger.log(`[GovSSO] รับคำขอ POST /auth/sso-callback (code length=${trimmedCode.length}, prefix=${trimmedCode.slice(0, 8)}...)`);
    if (!trimmedCode) {
      this.logger.warn('[GovSSO] ปฏิเสธคำขอ: ไม่พบ authorization code');
      throw new UnauthorizedException('กรุณาระบุ authorization code');
    }

    let data: IamGovVerifyResult;

    // รองรับ Mock Code สำหรับโหมดทดสอบ / เดโม หรือ Unit Test
    if (trimmedCode === 'mock-sso-code' || (process.env.DEMO_MODE === 'true' && trimmedCode.startsWith('demo-'))) {
      this.logger.log(`[GovSSO] ใช้ Mock Verify Result สำหรับ code=${trimmedCode}`);
      data = this.getMockVerifyResult(trimmedCode);
    } else {
      data = await this.verifyCodeWithIam(trimmedCode);
    }

    const iamUser = data.user;
    if (!iamUser || !iamUser.id) {
      this.logger.warn(`[GovSSO] ข้อมูลผู้ใช้จาก IAM-GOV ไม่สมบูรณ์: ${JSON.stringify(data)}`);
      throw new UnauthorizedException('ข้อมูลผู้ใช้งานจาก IAM-GOV ไม่ถูกต้องหรือไม่พบผู้ใช้');
    }

    const account = await this.upsertAccountFromIam(iamUser, data.residences || []);
    const token = await this.db.createSession(account.id);
    this.logger.log(`[GovSSO] ล็อกอินสำเร็จ: accountId=${account.id}, username=${account.username}, role=${account.role}`);

    await this.db.log('user', 'เข้าสู่ระบบด้วย Gov Center SSO', `ผู้ใช้ ${account.name} (IAM ID: ${iamUser.id}) เข้าสู่ระบบสำเร็จ`, {
      id: account.id,
      name: account.name,
      role: account.role,
    });

    return {
      success: true,
      token,
      account: this.db.toPublic(account),
      user: {
        id: account.id,
        firstName: iamUser.firstName || account.name.split(' ')[0],
        lastName: iamUser.lastName || (account.name.split(' ').slice(1).join(' ') || ''),
        role: account.role,
        email: account.email,
        phone: account.phone,
      },
      ssoPayload: data,
    };
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

      return (await response.json()) as IamGovVerifyResult;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Network or fetch error while verifying SSO code: ${err.message}`, err.stack);
      throw new UnauthorizedException(`ไม่สามารถเชื่อมต่อไปยัง IAM-GOV: ${err.message}`);
    }
  }

  /**
   * แลก SSO Session Token เป็น Session ในระบบจับจอง (สำหรับ auto-login / SSO session exchange)
   */
  async exchangeSsoSession(sessionToken: string) {
    const trimmed = (sessionToken || '').trim();
    if (!trimmed) {
      throw new UnauthorizedException('กรุณาระบุ session token');
    }

    // เรียก verify session กับ IAM-GOV
    try {
      const sessionUrl = `${this.getIamApiUrl()}/e-services/sso/verify-session`;
      const response = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.getApiKey(),
        },
        body: JSON.stringify({ sessionToken: trimmed }),
      });

      if (!response.ok) {
        throw new UnauthorizedException('เซสชันของ IAM-GOV หมดอายุหรือไม่ถูกต้อง');
      }

      const data = (await response.json()) as IamGovVerifyResult;
      if (!data.user) throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้ในเซสชัน');

      const account = await this.upsertAccountFromIam(data.user, data.residences || []);
      const token = await this.db.createSession(account.id);

      return {
        success: true,
        authenticated: true,
        token,
        account: this.db.toPublic(account),
        user: {
          id: account.id,
          firstName: data.user.firstName || account.name.split(' ')[0],
          lastName: data.user.lastName || (account.name.split(' ').slice(1).join(' ') || ''),
          role: account.role,
        },
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('ไม่สามารถแลกเซสชัน IAM-GOV ได้');
    }
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
    });

    if (!response.ok) {
      throw new UnauthorizedException(`ค้นหาที่อยู่จาก IAM-GOV ล้มเหลว (${response.status})`);
    }

    return response.json();
  }

  /**
   * แม็ปข้อมูลจาก IAM-GOV User และ Residence Snapshot ลงตาราง Account ของจับจอง
   */
  private async upsertAccountFromIam(iamUser: IamGovUser, residences: IamGovResidence[]): Promise<Account> {
    const ssoUsername = `sso_${iamUser.id}`;
    const email = iamUser.email ? iamUser.email.trim().toLowerCase() : undefined;
    const phoneDigits = iamUser.phone ? iamUser.phone.replace(/\D/g, '') : '';

    // ค้นหาบัญชีเดิมตาม SSO username, email หรือเบอร์โทร
    let account = this.db.accounts.find(
      (a) =>
        a.username === ssoUsername ||
        (email && a.email && a.email.toLowerCase() === email) ||
        (phoneDigits && phoneDigits.length >= 9 && a.phone.replace(/\D/g, '') === phoneDigits),
    );

    // เลือก residence ที่ VERIFIED หรือรายการแรก
    const verifiedResidence = residences.find((r) => r.status === 'VERIFIED') || residences[0];
    const snapshot = verifiedResidence?.addressSnapshot;

    const firstName = iamUser.firstName?.trim() || '';
    const lastName = iamUser.lastName?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim() || `ผู้ใช้ GovCenter (${iamUser.id})`;
    const nickname = firstName || fullName.split(' ')[0] || 'ผู้ใช้';
    const initial = (firstName || fullName).charAt(0) || 'ผ';

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
      if (snapshot) {
        if (snapshot.houseNo) account.addressHouseNo = String(snapshot.houseNo);
        if (snapshot.moo) account.addressMoo = String(snapshot.moo);
        if (snapshot.subdistrict_name_th) account.addressSubdistrict = String(snapshot.subdistrict_name_th);
        if (snapshot.district_name_th) account.addressDistrict = String(snapshot.district_name_th);
        if (snapshot.province_name_th) account.addressProvince = String(snapshot.province_name_th);
      }
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
      addressHouseNo: snapshot?.houseNo ? String(snapshot.houseNo) : undefined,
      addressMoo: snapshot?.moo ? String(snapshot.moo) : undefined,
      addressSubdistrict: snapshot?.subdistrict_name_th ? String(snapshot.subdistrict_name_th) : undefined,
      addressDistrict: snapshot?.district_name_th ? String(snapshot.district_name_th) : undefined,
      addressProvince: snapshot?.province_name_th ? String(snapshot.province_name_th) : undefined,
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
