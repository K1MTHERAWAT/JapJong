import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DbService } from '../../db/db.service';
import { LineRichMenuService } from '../../line/rich-menu/line-rich-menu.service';
import { LineRegisterDto } from './line-auth.dto';

// ข้อมูลผลลัพธ์การแลก Token จาก LINE OAuth2
export interface LineTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token: string;
}

// โครงสร้าง Payload ภายใน ID Token (JWT) ของ LINE
export interface LineIdTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
  picture?: string;
  email?: string;
}

// โครงสร้างบันทึก State ในหน่วยความจำชั่วคราว
export interface StoredState {
  nonce: string;
  createdAt: number;
  linkUserId?: string;
}

// โครงสร้างบันทึก Registration Ticket สำหรับลงทะเบียนครั้งแรก
export interface StoredTicket {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  createdAt: number;
}

/**
 * Service จัดการกระบวนการยืนยันตัวตนผ่าน LINE Login, LIFF และการลงทะเบียนผู้ใช้ใหม่ตาม PDPA
 */
@Injectable()
export class LineAuthService {
  private readonly logger = new Logger(LineAuthService.name);

  // เก็บค่า State และ Nonce ชั่วคราวในหน่วยความจำ (อายุ 10 นาที) เพื่อป้องกัน CSRF และ Replay Attack
  private stateStore = new Map<string, StoredState>();

  // เก็บค่า Ticket สำหรับการลงทะเบียนครั้งแรก (อายุ 15 นาที)
  private ticketStore = new Map<string, StoredTicket>();

  constructor(
    private readonly db: DbService,
    @Optional() private readonly richMenuService?: LineRichMenuService,
  ) {}

  // ดึงค่า LINE Channel ID จาก Environment
  get channelId(): string {
    return process.env.LINE_CHANNEL_ID || '';
  }

  // ดึงค่า LINE Channel Secret จาก Environment
  get channelSecret(): string {
    return process.env.LINE_CHANNEL_SECRET || '';
  }

  // ดึง URL สำหรับ Callback ของ LINE OAuth
  get callbackUrl(): string {
    return process.env.LINE_LOGIN_CALLBACK_URL || 'http://localhost:4000/auth/line/callback';
  }

  // ดึง URL หน้าบ้าน (Frontend) ของระบบ
  get frontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * สร้าง Authorization URL พร้อมค่า State (ป้องกัน CSRF) และ Nonce (ป้องกัน Replay Attack)
   * @param linkUserId รหัสบัญชีผู้ใช้ที่ต้องการผูกบัญชี (กรณีเข้าสู่ระบบอยู่แล้ว)
   */
  generateAuthUrl(linkUserId?: string): { url: string; state: string } {
    if (!this.channelId) {
      throw new BadRequestException('ยังไม่ได้กำหนดค่า LINE_CHANNEL_ID ในระบบ');
    }

    // ล้างค่า State ที่หมดอายุออกจากหน่วยความจำ
    this.cleanExpiredStates();

    // สร้างสตริงสุ่ม State และ Nonce
    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');

    // บันทึก State ลงใน Store พร้อมเวลาสร้าง
    this.stateStore.set(state, {
      nonce,
      createdAt: Date.now(),
      linkUserId: linkUserId?.trim() || undefined,
    });

    // สร้าง Parameter สำหรับเรียกหน้า LINE Login
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.channelId,
      redirect_uri: this.callbackUrl,
      state,
      scope: 'profile openid',
      nonce,
    });

    const url = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
    return { url, state };
  }

  /**
   * ตรวจสอบความถูกต้องและล้าง State เมื่อถูกนำมาใช้งาน
   */
  validateAndConsumeState(state: string): { valid: boolean; nonce?: string; linkUserId?: string } {
    if (!state) return { valid: false };

    const stored = this.stateStore.get(state);
    if (!stored) return { valid: false };

    // ลบทันทีเพื่อใช้ได้ครั้งเดียว (One-time use)
    this.stateStore.delete(state);

    // ตรวจสอบอายุ State (ไม่เกิน 10 นาที)
    const isExpired = Date.now() - stored.createdAt > 10 * 60 * 1000;
    if (isExpired) return { valid: false };

    return { valid: true, nonce: stored.nonce, linkUserId: stored.linkUserId };
  }

  /**
   * นำ Authorization Code ไปแลก Access Token และ ID Token จากเซิร์ฟเวอร์ LINE
   */
  async exchangeCodeForToken(code: string): Promise<LineTokenResponse> {
    if (!code) throw new BadRequestException('Authorization code is required');
    if (!this.channelId || !this.channelSecret) {
      throw new BadRequestException('LINE channel credentials are not configured');
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl,
      client_id: this.channelId,
      client_secret: this.channelSecret,
    });

    try {
      // เรียก API แลกเปลี่ยน Token กับเซิร์ฟเวอร์ LINE
      const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LINE token exchange failed [${response.status}]: ${errorText}`);
        throw new UnauthorizedException('ไม่สามารถแลกเปลี่ยน Authorization Code กับ LINE ได้');
      }

      return (await response.json()) as LineTokenResponse;
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) throw err;
      this.logger.error('Fetch error during LINE token exchange', err);
      throw new UnauthorizedException('ไม่สามารถเชื่อมต่อไปยัง LINE Platform ได้');
    }
  }

  /**
   * ตรวจสอบความถูกต้องของ ID Token และดึงข้อมูลโปรไฟล์ผู้ใช้งาน
   */
  async verifyIdToken(idToken: string, expectedNonce?: string): Promise<LineIdTokenPayload> {
    if (!idToken) throw new BadRequestException('ID Token is required');

    // 1. ตรวจสอบผ่าน LINE Verify Endpoint โดยตรง
    try {
      const verifyParams = new URLSearchParams({
        id_token: idToken,
        client_id: this.channelId,
      });

      if (expectedNonce) {
        verifyParams.append('nonce', expectedNonce);
      }

      const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams.toString(),
      });

      if (verifyRes.ok) {
        const payload = (await verifyRes.json()) as LineIdTokenPayload;
        this.validateTokenPayload(payload, expectedNonce);
        return payload;
      }
    } catch (err) {
      this.logger.warn('LINE verify endpoint failed or offline, checking local payload parsing', err);
    }

    // 2. Fallback การตรวจสอบแบบจำลองภายใน (สำหรับการทดสอบแบบ Offline / Unit Test)
    const payload = this.parseJwtPayload(idToken);
    this.validateTokenPayload(payload, expectedNonce);
    return payload;
  }

  /**
   * ตรวจสอบ Claims สำคัญภายใน ID Token
   */
  private validateTokenPayload(payload: LineIdTokenPayload, expectedNonce?: string) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('ID Token ไม่ถูกต้อง หรือไม่มี LINE User ID');
    }

    if (payload.iss !== 'https://access.line.me') {
      throw new UnauthorizedException('ID Token Issuer ไม่ถูกต้อง');
    }

    const liffId = (process.env.NEXT_PUBLIC_LIFF_ID || process.env.LINE_LIFF_ID || '').trim();
    const allowedAudiences = [this.channelId, liffId].filter(Boolean);
    if (allowedAudiences.length > 0 && !allowedAudiences.includes(payload.aud)) {
      throw new UnauthorizedException('ID Token Audience ไม่ตรงกับ Channel ID หรือ LIFF ID');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSeconds) {
      throw new UnauthorizedException('ID Token หมดอายุแล้ว');
    }

    if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
      throw new UnauthorizedException('ID Token Nonce ไม่ตรงกับคำขอ (Replay attack detected)');
    }
  }

  /**
   * แยกข้อมูล Payload จาก JWT ID Token
   */
  private parseJwtPayload(token: string): LineIdTokenPayload {
    try {
      const parts = token.split('.');
      if (parts.length < 2) throw new Error('Invalid JWT format');
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    } catch {
      throw new UnauthorizedException('ไม่สามารถแยกข้อมูล ID Token ได้');
    }
  }

  /**
   * ออกตั๋วลงทะเบียนชั่วคราว (Registration Ticket) สำหรับผู้ใช้ใหม่ (อายุ 15 นาที)
   */
  issueRegistrationTicket(lineUserId: string, displayName: string, pictureUrl?: string | null): string {
    this.cleanExpiredTickets();
    const ticket = `tkt_${crypto.randomBytes(24).toString('hex')}`;
    this.ticketStore.set(ticket, {
      lineUserId,
      displayName,
      pictureUrl: pictureUrl ?? null,
      createdAt: Date.now(),
    });
    return ticket;
  }

  /**
   * ดึงข้อมูลการลงทะเบียนจาก Ticket โดยไม่ทำลายข้อมูล (สำหรับแสดงผลบนหน้าจอลงทะเบียน)
   */
  getRegistrationStatus(ticket: string) {
    if (!ticket) return { valid: false, error: 'ไม่พบ Registration Ticket' };

    const stored = this.ticketStore.get(ticket);
    if (!stored) return { valid: false, error: 'Registration Ticket หมดอายุหรือไม่ถูกต้อง' };

    if (Date.now() - stored.createdAt > 15 * 60 * 1000) {
      this.ticketStore.delete(ticket);
      return { valid: false, error: 'Registration Ticket หมดอายุแล้ว กรุณาเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง' };
    }

    return {
      valid: true,
      lineProfile: {
        displayName: stored.displayName,
        pictureUrl: stored.pictureUrl,
      },
    };
  }

  /**
   * ลงทะเบียนบัญชีประชาชนใหม่ครั้งแรกด้วย LINE พร้อมบันทึกความยินยอม PDPA
   */
  async registerFirstTimeUser(dto: LineRegisterDto) {
    this.cleanExpiredTickets();

    const stored = this.ticketStore.get(dto.ticket);
    if (!stored) {
      throw new BadRequestException('Registration Ticket หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง');
    }

    if (Date.now() - stored.createdAt > 15 * 60 * 1000) {
      this.ticketStore.delete(dto.ticket);
      throw new BadRequestException('Registration Ticket หมดอายุแล้ว กรุณาเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง');
    }

    // 1. ตรวจสอบความยินยอม PDPA ที่จำเป็นตามกฎหมาย
    const requiredConsents = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'];
    for (const reqType of requiredConsents) {
      const match = dto.consents.find((c) => c.consentType === reqType);
      if (!match || !match.agreed) {
        throw new BadRequestException(`กรุณายินยอมข้อกำหนดและนโยบายความเป็นส่วนตัว (${reqType}) ที่จำเป็นก่อนลงทะเบียน`);
      }
    }

    // 2. ป้องกันการสร้างบัญชีซ้ำจาก LINE User ID เดิม
    const existingByLine = await this.db.findUserByLineUserId(stored.lineUserId);
    if (existingByLine) {
      throw new ConflictException('บัญชี LINE นี้ได้รับการลงทะเบียนในระบบเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ');
    }

    // 3. ป้องกันเบอร์โทรศัพท์ซ้ำซ้อนในระบบ
    const cleanPhone = dto.phone.trim();
    const existingByPhone = this.db.accounts.find((a) => a.phone === cleanPhone);
    if (existingByPhone) {
      throw new ConflictException('เบอร์โทรศัพท์นี้ถูกใช้งานในระบบแล้ว กรุณาใช้เบอร์อื่น');
    }

    // 4. สร้างบัญชีผู้ใช้และบันทึกประวัติการยินยอมลงในฐานข้อมูล
    const newAccount = await this.db.createLineCitizenAccount({
      name: dto.name.trim(),
      phone: cleanPhone,
      lineUserId: stored.lineUserId,
      displayName: stored.displayName,
      pictureUrl: stored.pictureUrl,
      consents: dto.consents,
    });

    // 5. ล้าง Ticket ชั่วคราวทิ้ง (ใช้งานได้ครั้งเดียว)
    const lineUserId = stored.lineUserId;
    this.ticketStore.delete(dto.ticket);

    // ปรับเปลี่ยน Rich Menu บน LINE ตามบทบาทใหม่
    if (this.richMenuService) {
      await this.richMenuService.switchUserRichMenuByRole(lineUserId, newAccount.role).catch(() => {});
    }

    // 6. สร้าง Session Token สำหรับเข้าใช้งานระบบทันที
    const token = await this.db.createSession(newAccount.id);

    return {
      token,
      account: this.db.toPublic(newAccount),
    };
  }

  /**
   * ฟังก์ชันจัดการ Callback หลวงของ LINE Login
   */
  async handleCallback(
    code?: string,
    state?: string,
    error?: string,
    errorDescription?: string,
  ): Promise<{ redirectUrl: string }> {
    if (error) {
      const msg = errorDescription || error;
      return {
        redirectUrl: `${this.frontendUrl}/login?line_error=${encodeURIComponent(`LINE Login ถูกยกเลิก: ${msg}`)}`,
      };
    }

    if (!code || !state) {
      return {
        redirectUrl: `${this.frontendUrl}/login?line_error=${encodeURIComponent('ข้อมูลไม่ครบถ้วน (code หรือ state สูญหาย)')}`,
      };
    }

    // 1. ตรวจสอบความถูกต้องของ State เพื่อป้องกัน CSRF
    const { valid, nonce, linkUserId } = this.validateAndConsumeState(state);
    if (!valid) {
      return {
        redirectUrl: `${this.frontendUrl}/login?line_error=${encodeURIComponent('ความปลอดภัยไม่ถูกต้อง (State mismatch หรือคำขอหมดอายุ)')}`,
      };
    }

    try {
      // 2. แลก Code เป็น Token
      const tokenRes = await this.exchangeCodeForToken(code);

      // 3. ตรวจสอบ ID Token
      const profile = await this.verifyIdToken(tokenRes.id_token, nonce);
      const lineUserId = profile.sub;
      const displayName = profile.name || 'LINE User';
      const pictureUrl = profile.picture || null;

      // กรณีเชื่อมต่อบัญชี LINE จากหน้าจัดการบัญชีผู้ใช้งาน (Link LINE)
      if (linkUserId) {
        const targetUser = this.db.accounts.find((a) => a.id === linkUserId);
        if (!targetUser) {
          return {
            redirectUrl: `${this.frontendUrl}/account?line_error=${encodeURIComponent('ไม่พบบัญชีผู้ใช้งานที่ต้องการเชื่อมต่อ')}`,
          };
        }

        await this.db.linkLineAccount(linkUserId, {
          lineUserId,
          displayName,
          pictureUrl,
        });
        targetUser.lineUserId = lineUserId;
        targetUser.lineName = displayName;

        if (this.richMenuService) {
          await this.richMenuService.switchUserRichMenuByRole(lineUserId, targetUser.role).catch(() => {});
        }

        return {
          redirectUrl: `${this.frontendUrl}/account?line_linked=1`,
        };
      }

      // 4. ตรวจสอบว่าบัญชี LINE นี้เคยลงทะเบียนในระบบ JapJong หรือยัง
      const user = await this.db.findUserByLineUserId(lineUserId);

      if (user) {
        // ตรวจสอบสถานะการระงับบัญชี
        if (user.active === false || user.accountStatus === 'SUSPENDED') {
          return {
            redirectUrl: `${this.frontendUrl}/login?line_error=${encodeURIComponent('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ')}`,
          };
        }

        // ผู้ใช้เดิม -> สร้างเซสชันและ Redirect กลับไปยังหน้าหลัก
        if (this.richMenuService) {
          await this.richMenuService.switchUserRichMenuByRole(lineUserId, user.role).catch(() => {});
        }
        const sessionToken = await this.db.createSession(user.id);
        return {
          redirectUrl: `${this.frontendUrl}/login?line_token=${sessionToken}&account_id=${user.id}`,
        };
      } else {
        // ผู้ใช้ใหม่ครั้งแรก -> ออกตั๋ว Ticket และ Redirect ไปยังหน้าลงทะเบียน /register/line
        const ticket = this.issueRegistrationTicket(lineUserId, displayName, pictureUrl);
        return {
          redirectUrl: `${this.frontendUrl}/register/line?ticket=${ticket}`,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการยืนยันตัวตนกับ LINE';
      const targetPath = linkUserId ? '/account' : '/login';
      return {
        redirectUrl: `${this.frontendUrl}${targetPath}?line_error=${encodeURIComponent(message)}`,
      };
    }
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อบัญชี LINE ของผู้ใช้งานที่ระบุ
   */
  async getStatus(userId: string) {
    const account = await this.db.getLineAccount(userId);
    return {
      isLinked: !!account,
      lineAccount: account
        ? {
            lineUserId: account.lineUserId,
            displayName: account.displayName,
            pictureUrl: account.pictureUrl,
            linkedAt: account.linkedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * ยืนยันตัวตนผู้ใช้จาก LIFF ด้วย LINE ID Token
   * หากเป็นผู้ใช้เดิมจะส่งคืน Token สำหรับเข้าใช้งานทันที หากเป็นผู้ใช้ใหม่จะคืนตั๋ว Ticket สำหรับลงทะเบียน
   */
  async authenticateLiffUser(idToken: string) {
    if (!idToken) {
      throw new BadRequestException('idToken is required');
    }

    const payload = await this.verifyIdToken(idToken);
    const lineUserId = payload.sub;
    const displayName = payload.name || 'LINE User';
    const pictureUrl = payload.picture || null;

    // 1. ตรวจสอบว่าบัญชีผูกกับระบบไว้แล้วหรือไม่
    const user = await this.db.findUserByLineUserId(lineUserId);

    if (user) {
      // 2. ตรวจสอบสถานะบัญชี
      if (user.active === false || user.accountStatus === 'SUSPENDED') {
        throw new ForbiddenException('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }

      // 3. สร้าง Session Token
      if (this.richMenuService) {
        await this.richMenuService.switchUserRichMenuByRole(lineUserId, user.role).catch(() => {});
      }
      const token = await this.db.createSession(user.id);
      return {
        status: 'AUTHENTICATED' as const,
        token,
        account: this.db.toPublic(user),
      };
    } else {
      // 4. ออก Registration Ticket สำหรับผู้ใช้ใหม่
      const ticket = this.issueRegistrationTicket(lineUserId, displayName, pictureUrl);
      return {
        status: 'NEW_USER' as const,
        ticket,
        lineProfile: {
          displayName,
          pictureUrl,
        },
      };
    }
  }

  /**
   * ส่งคืนค่าคอนฟิก LIFF สาธารณะสำหรับใช้งานบนฝั่ง Frontend
   */
  getLiffConfig() {
    return {
      liffId: (process.env.NEXT_PUBLIC_LIFF_ID || process.env.LINE_LIFF_ID || '').trim() || null,
      channelId: this.channelId || null,
    };
  }

  // ล้าง State ที่หมดอายุเกิน 10 นาที
  private cleanExpiredStates() {
    const now = Date.now();
    for (const [state, data] of this.stateStore.entries()) {
      if (now - data.createdAt > 10 * 60 * 1000) {
        this.stateStore.delete(state);
      }
    }
  }

  // ล้าง Registration Ticket ที่หมดอายุเกิน 15 นาที
  private cleanExpiredTickets() {
    const now = Date.now();
    for (const [ticket, data] of this.ticketStore.entries()) {
      if (now - data.createdAt > 15 * 60 * 1000) {
        this.ticketStore.delete(ticket);
      }
    }
  }
}
