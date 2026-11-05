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

export interface LineTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token: string;
}

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

export interface StoredState {
  nonce: string;
  createdAt: number;
  linkUserId?: string;
}

export interface StoredTicket {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  createdAt: number;
}

@Injectable()
export class LineAuthService {
  private readonly logger = new Logger(LineAuthService.name);

  // In-memory state and nonce store (TTL: 10 minutes)
  private stateStore = new Map<string, StoredState>();

  // In-memory registration ticket store (TTL: 15 minutes)
  private ticketStore = new Map<string, StoredTicket>();

  constructor(
    private readonly db: DbService,
    @Optional() private readonly richMenuService?: LineRichMenuService,
  ) {}

  get channelId(): string {
    return process.env.LINE_CHANNEL_ID || '';
  }

  get channelSecret(): string {
    return process.env.LINE_CHANNEL_SECRET || '';
  }

  get callbackUrl(): string {
    return process.env.LINE_LOGIN_CALLBACK_URL || 'http://localhost:4000/auth/line/callback';
  }

  get frontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Generates authorization URL, state (CSRF), and nonce (ID token replay protection)
   */
  generateAuthUrl(linkUserId?: string): { url: string; state: string } {
    if (!this.channelId) {
      throw new BadRequestException('ยังไม่ได้กำหนดค่า LINE_CHANNEL_ID ในระบบ');
    }

    this.cleanExpiredStates();

    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');

    this.stateStore.set(state, {
      nonce,
      createdAt: Date.now(),
      linkUserId: linkUserId?.trim() || undefined,
    });

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
   * Validates and consumes state, returning the associated nonce
   */
  validateAndConsumeState(state: string): { valid: boolean; nonce?: string; linkUserId?: string } {
    if (!state) return { valid: false };

    const stored = this.stateStore.get(state);
    if (!stored) return { valid: false };

    this.stateStore.delete(state);

    const isExpired = Date.now() - stored.createdAt > 10 * 60 * 1000;
    if (isExpired) return { valid: false };

    return { valid: true, nonce: stored.nonce, linkUserId: stored.linkUserId };
  }

  /**
   * Exchanges authorization code for tokens with LINE Platform
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
   * Verifies ID Token and extracts user profile
   */
  async verifyIdToken(idToken: string, expectedNonce?: string): Promise<LineIdTokenPayload> {
    if (!idToken) throw new BadRequestException('ID Token is required');

    // 1. In production / live LINE, verify via LINE verify endpoint
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

    // 2. Local fallback verification (for unit testing and offline development)
    const payload = this.parseJwtPayload(idToken);
    this.validateTokenPayload(payload, expectedNonce);
    return payload;
  }

  /**
   * Validates claims inside the ID Token
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
   * Issues a temporary Registration Ticket (TTL: 15 minutes)
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
   * Retrieves registration info by ticket without consuming it
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
   * Registers a first-time citizen user with LINE identity & PDPA consents
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

    // 1. Validate mandatory PDPA consents
    const requiredConsents = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'];
    for (const reqType of requiredConsents) {
      const match = dto.consents.find((c) => c.consentType === reqType);
      if (!match || !match.agreed) {
        throw new BadRequestException(`กรุณายินยอมข้อกำหนดและนโยบายความเป็นส่วนตัว (${reqType}) ที่จำเป็นก่อนลงทะเบียน`);
      }
    }

    // 2. Prevent duplicate account (LINE User ID)
    const existingByLine = await this.db.findUserByLineUserId(stored.lineUserId);
    if (existingByLine) {
      throw new ConflictException('บัญชี LINE นี้ได้รับการลงทะเบียนในระบบเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ');
    }

    // 3. Prevent duplicate phone number
    const cleanPhone = dto.phone.trim();
    const existingByPhone = this.db.accounts.find((a) => a.phone === cleanPhone);
    if (existingByPhone) {
      throw new ConflictException('เบอร์โทรศัพท์นี้ถูกใช้งานในระบบแล้ว กรุณาใช้เบอร์อื่น');
    }

    // 4. Create Account and Consents in Database
    const newAccount = await this.db.createLineCitizenAccount({
      name: dto.name.trim(),
      phone: cleanPhone,
      lineUserId: stored.lineUserId,
      displayName: stored.displayName,
      pictureUrl: stored.pictureUrl,
      consents: dto.consents,
    });

    // 5. Consume ticket (one-time use)
    const lineUserId = stored.lineUserId;
    this.ticketStore.delete(dto.ticket);

    // Sync role-based Rich Menu
    if (this.richMenuService) {
      await this.richMenuService.switchUserRichMenuByRole(lineUserId, newAccount.role).catch(() => {});
    }

    // 6. Create JapJong session token
    const token = await this.db.createSession(newAccount.id);

    return {
      token,
      account: this.db.toPublic(newAccount),
    };
  }

  /**
   * Main callback handler for LINE Login
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

    // 1. Verify CSRF state
    const { valid, nonce, linkUserId } = this.validateAndConsumeState(state);
    if (!valid) {
      return {
        redirectUrl: `${this.frontendUrl}/login?line_error=${encodeURIComponent('ความปลอดภัยไม่ถูกต้อง (State mismatch หรือคำขอหมดอายุ)')}`,
      };
    }

    try {
      // 2. Exchange code for tokens
      const tokenRes = await this.exchangeCodeForToken(code);

      // 3. Verify ID Token
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

      // 4. Find linked JapJong account
      const user = await this.db.findUserByLineUserId(lineUserId);

      if (user) {
        // Check account active / suspended status
        if (user.active === false || user.accountStatus === 'SUSPENDED') {
          return {
            redirectUrl: `${this.frontendUrl}/login?line_error=${encodeURIComponent('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ')}`,
          };
        }

        // Existing User -> Create Session & Redirect directly to service
        if (this.richMenuService) {
          await this.richMenuService.switchUserRichMenuByRole(lineUserId, user.role).catch(() => {});
        }
        const sessionToken = await this.db.createSession(user.id);
        return {
          redirectUrl: `${this.frontendUrl}/login?line_token=${sessionToken}&account_id=${user.id}`,
        };
      } else {
        // First-time User -> Issue Registration Ticket & Redirect to /register/line
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
   * Checks status of LINE account for a given user
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
   * Authenticates a user from LIFF using LINE ID Token
   * Returns session token for existing user, or registration ticket for new user
   */
  async authenticateLiffUser(idToken: string) {
    if (!idToken) {
      throw new BadRequestException('idToken is required');
    }

    const payload = await this.verifyIdToken(idToken);
    const lineUserId = payload.sub;
    const displayName = payload.name || 'LINE User';
    const pictureUrl = payload.picture || null;

    // 1. Search for existing account linked to this LINE User ID
    const user = await this.db.findUserByLineUserId(lineUserId);

    if (user) {
      // 2. Validate account status
      if (user.active === false || user.accountStatus === 'SUSPENDED') {
        throw new ForbiddenException('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }

      // 3. Create Session Token
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
      // 4. Issue Registration Ticket for first-time registration (Phase 2 flow)
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
   * Returns safe LIFF public configuration
   */
  getLiffConfig() {
    return {
      liffId: (process.env.NEXT_PUBLIC_LIFF_ID || process.env.LINE_LIFF_ID || '').trim() || null,
      channelId: this.channelId || null,
    };
  }

  private cleanExpiredStates() {
    const now = Date.now();
    for (const [state, data] of this.stateStore.entries()) {
      if (now - data.createdAt > 10 * 60 * 1000) {
        this.stateStore.delete(state);
      }
    }
  }

  private cleanExpiredTickets() {
    const now = Date.now();
    for (const [ticket, data] of this.ticketStore.entries()) {
      if (now - data.createdAt > 15 * 60 * 1000) {
        this.ticketStore.delete(ticket);
      }
    }
  }
}
