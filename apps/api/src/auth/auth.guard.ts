import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Reflector } from '@nestjs/core';
import {
  Account,
  PERMISSION_LABEL,
  PermissionKey,
  ROLE_LABEL,
  Role,
  hasPermission,
} from '@japjong/shared';
import { DbService } from '../db/db.service';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const PERMISSIONS = 'permissions';
/** ต้องมีสิทธิ์อย่างน้อย 1 รายการในรายการที่กำหนด */
export const Permissions = (...perms: PermissionKey[]) => SetMetadata(PERMISSIONS, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Account => {
  return ctx.switchToHttp().getRequest().user;
});

// ===== Rate limit / lockout (ป้องกันเดารหัสผ่าน และ PIN) =====
const attempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

export function extractToken(header: string | undefined): string {
  return (header ?? '').replace(/^Bearer\s+/i, '').trim();
}

export function assertNotLocked(key: string) {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) {
    const mins = Math.ceil((a.lockedUntil - Date.now()) / 60000);
    throw new HttpException(`ลองผิดเกินกำหนด กรุณารอ ${mins} นาที`, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export function recordFailure(key: string) {
  const a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.count = 0;
    a.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(key, a);
}

export function clearFailures(key: string) {
  attempts.delete(key);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ===== ตรวจรูปแบบลายเซ็นที่วาดจาก canvas (ห้ามข้อความพิมพ์ / ห้าม payload แปลกปลอม) =====
const PNG_SIGNATURE_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const SAFE_SVG_SIGNATURE_RE = /^data:image\/svg\+xml;utf8,<svg[\s\S]*<\/svg>$/i;
const MAX_SIGNATURE_LEN = 300_000;

export function requireDrawnSignature(value: unknown, who: string): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw new BadRequestException(`กรุณาให้${who}เขียนลายเซ็นบนหน้าจอ`);
  const isPng = PNG_SIGNATURE_RE.test(v);
  const isSafeSvg =
    SAFE_SVG_SIGNATURE_RE.test(v) && !/<script/i.test(v) && !/\son[a-z]+\s*=/i.test(v) && !/javascript:/i.test(v);
  if (v.length > MAX_SIGNATURE_LEN || (!isPng && !isSafeSvg)) {
    throw new BadRequestException(`ลายเซ็นของ${who}ไม่ถูกต้อง (ต้องเป็นภาพลายเซ็นที่วาดจากหน้าจอเท่านั้น)`);
  }
  return v;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DbService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = extractToken(req.headers['authorization']);
    if (!token) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }
    const session = await this.db.getSession(token);
    if (!session) {
      throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    const user = this.db.accounts.find((a) => a.id === session.accountId);
    if (!user || user.active === false) {
      await this.db.revokeSession(token);
      throw new UnauthorizedException('บัญชีผู้ใช้ถูกระงับหรือไม่มีอยู่ในระบบ');
    }
    req.user = user;
    req.token = token;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && roles.length && !roles.includes(user.role)) {
      const allowedNames = roles.map((r) => ROLE_LABEL[r]).join(', ');
      throw new ForbiddenException(
        `ไม่มีสิทธิ์ดำเนินการ: เฉพาะบทบาท [${allowedNames}] เท่านั้น (ปัจจุบันคุณคือ ${ROLE_LABEL[user.role]})`,
      );
    }

    const perms = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS, targets);
    if (perms && perms.length && !perms.some((p) => hasPermission(user, p))) {
      const permNames = perms.map((p) => PERMISSION_LABEL[p]).join(' หรือ ');
      throw new ForbiddenException(`ไม่มีสิทธิ์ดำเนินการ: ต้องเปิดสิทธิ์ "${permNames}"`);
    }

    return true;
  }
}
