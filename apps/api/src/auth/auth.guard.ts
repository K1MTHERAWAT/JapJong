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

// คีย์ Metadata สำหรับระบุว่า Route นี้เป็น Public (ไม่ต้องตรวจ Auth)
export const IS_PUBLIC = 'isPublic';
// Decorator สำหรับยกเว้นการตรวจสอบสิทธิ์การเข้าสู่ระบบ (เข้าถึงได้ทุกคน)
export const Public = () => SetMetadata(IS_PUBLIC, true);

// คีย์ Metadata สำหรับระบุบทบาทผู้ใช้ (Role) ที่ได้รับอนุญาต
export const ROLES = 'roles';
// Decorator สำหรับกำหนดสิทธิ์ Role ขั้นต่ำที่สามารถเข้าถึง Route ได้
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

// คีย์ Metadata สำหรับระบุ Permission ย่อยที่จำเป็น
export const PERMISSIONS = 'permissions';
// Decorator กำหนดว่าผู้ใช้ต้องมีสิทธิ์อย่างน้อย 1 รายการในรายการที่ระบุไว้
export const Permissions = (...perms: PermissionKey[]) => SetMetadata(PERMISSIONS, perms);

// Custom Param Decorator สำหรับดึงข้อมูลผู้ใช้ปัจจุบัน (Account) จาก Request Object
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Account => {
  // ดึง Request จาก ExecutionContext ของ HTTP แล้วส่งคืน account ที่แนบไว้
  return ctx.switchToHttp().getRequest().user;
});

// ===== Rate limit / lockout (ระบบป้องกันการเดารหัสผ่าน และ PIN แบบ Brute-force) =====
// เก็บสถิติจำนวนครั้งที่ทำรายการล้มเหลวและเวลาที่ถูกระงับชั่วคราว
const attempts = new Map<string, { count: number; lockedUntil: number }>();
// จำนวนครั้งสูงสุดที่ยอมให้ทำผิดพลาดได้ก่อนถูกระงับ
const MAX_ATTEMPTS = 5;
// ระยะเวลาล็อคชั่วคราว (5 นาที ในหน่วยมิลลิวินาที)
const LOCK_MS = 5 * 60 * 1000;

/**
 * ดึง Bearer Token ออกจาก Authorization Header
 * @param header ค่า Authorization header จาก HTTP Request
 * @returns Token เพียวๆ ที่ตัดคำนำหน้า 'Bearer ' ออกแล้ว
 */
export function extractToken(header: string | undefined): string {
  return (header ?? '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * ตรวจสอบว่าคีย์ที่ระบุ (เช่น username, ip, หรือ email) ถูกระงับการทำรายการชั่วคราวหรือไม่
 * @param key คีย์ที่ต้องการตรวจสอบ
 */
export function assertNotLocked(key: string) {
  const a = attempts.get(key);
  // หากมีบันทึกและเวลาปัจจุบันยังไม่พ้นระยะเวลาล็อค ให้ปฏิเสธการทำรายการทันที
  if (a && a.lockedUntil > Date.now()) {
    const mins = Math.ceil((a.lockedUntil - Date.now()) / 60000);
    throw new HttpException(`ลองผิดเกินกำหนด กรุณารอ ${mins} นาที`, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * บันทึกการทำรายการผิดพลาดเพิ่ม 1 ครั้ง หากเกินโควต้าจะทำการล็อคชั่วคราว
 * @param key คีย์ที่เกิดข้อผิดพลาด
 */
export function recordFailure(key: string) {
  const a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  a.count += 1;
  // หากทำผิดครบตามเกณฑ์ที่กำหนด ให้ล็อคและกำหนดเวลาปลดล็อค
  if (a.count >= MAX_ATTEMPTS) {
    a.count = 0;
    a.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(key, a);
}

/**
 * ล้างประวัติการทำรายการผิดพลาด (ใช้เมื่อผู้ใช้ยืนยันตัวตนสำเร็จ)
 * @param key คีย์ที่ต้องการล้างประวัติ
 */
export function clearFailures(key: string) {
  attempts.delete(key);
}

/**
 * เปรียบเทียบข้อความสองชุดแบบ Timing Safe เพื่อป้องกัน Side-channel Timing Attack
 * @param a ข้อความชุดที่ 1
 * @param b ข้อความชุดที่ 2
 * @returns true หากข้อความตรงกันทุกตัวอักษร
 */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ===== ตรวจสอบรูปแบบลายเซ็นดิจิทัลที่วาดจาก canvas (ป้องกัน XSS / Script Injection) =====
// Regular Expression สำหรับตรวจสอบ Base64 Data URL รูปแบบ PNG
const PNG_SIGNATURE_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
// Regular Expression สำหรับตรวจสอบ Data URL รูปแบบ SVG แบบปลอดภัย
const SAFE_SVG_SIGNATURE_RE = /^data:image\/svg\+xml;utf8,<svg[\s\S]*<\/svg>$/i;
// ขนาดสูงสุดของภาพลายเซ็น (300 KB) เพื่อป้องกันการส่งข้อมูลขนาดใหญ่เกินจำเป็น
const MAX_SIGNATURE_LEN = 300_000;

/**
 * ตรวจสอบความถูกต้องและปลอดภัยของภาพลายเซ็นอิเล็กทรอนิกส์
 * @param value ข้อมูลภาพลายเซ็น (Data URL)
 * @param who ข้อความระบุบทบาทของผู้ลงนาม เช่น "ผู้ขอ", "เจ้าหน้าที่", "ผู้อนุมัติ"
 * @returns ข้อมูลภาพที่ผ่านการตรวจสอบแล้ว
 */
export function requireDrawnSignature(value: unknown, who: string): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw new BadRequestException(`กรุณาให้${who}เขียนลายเซ็นบนหน้าจอ`);
  
  // ตรวจสอบว่าตรงกับรูปแบบ PNG Data URL หรือไม่
  const isPng = PNG_SIGNATURE_RE.test(v);
  // ตรวจสอบว่าเป็น SVG ที่ไม่มีโค้ดสคริปต์แอบแฝง
  const isSafeSvg =
    SAFE_SVG_SIGNATURE_RE.test(v) && !/<script/i.test(v) && !/\son[a-z]+\s*=/i.test(v) && !/javascript:/i.test(v);
    
  // หากขนาดเกินหรือรูปแบบไม่ถูกต้อง ให้ปฏิเสธทันที
  if (v.length > MAX_SIGNATURE_LEN || (!isPng && !isSafeSvg)) {
    throw new BadRequestException(`ลายเซ็นของ${who}ไม่ถูกต้อง (ต้องเป็นภาพลายเซ็นที่วาดจากหน้าจอเท่านั้น)`);
  }
  return v;
}

/**
 * NestJS Guard ระดับสากลสำหรับตรวจสอบการยืนยันตัวตน (Authentication)
 * และการตรวจสอบสิทธิ์การเข้าถึงตามบทบาท (RBAC) และสิทธิ์ย่อย (Permissions)
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DbService) {}

  /**
   * ฟังก์ชันตัดสินใจว่าจะอนุญาตให้คำขอผ่านเข้าไปประมวลผลหรือไม่
   * @param ctx ExecutionContext ของคำขอ
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    
    // 1. ตรวจสอบว่า Route นี้ถูกทำเครื่องหมายเป็น @Public() หรือไม่
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    // 2. ดึง Token จาก Authorization Header
    const req = ctx.switchToHttp().getRequest();
    const token = extractToken(req.headers['authorization']);
    if (!token) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }

    // 3. ตรวจสอบความถูกต้องของเซสชันในฐานข้อมูล
    const session = await this.db.getSession(token);
    if (!session) {
      throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    // 4. ค้นหาบัญชีผู้ใช้จาก accountId ในเซสชัน
    const user = this.db.accounts.find((a) => a.id === session.accountId);
    if (!user || user.active === false) {
      // หากบัญชีถูกระงับ ให้เพิกถอน Token ทันที
      await this.db.revokeSession(token);
      throw new UnauthorizedException('บัญชีผู้ใช้ถูกระงับหรือไม่มีอยู่ในระบบ');
    }

    // แนบข้อมูลผู้ใช้และ token เข้ากับ Request เพื่อให้ Handler อื่นๆ ใช้งานได้
    req.user = user;
    req.token = token;

    // 5. ตรวจสอบสิทธิ์ตามบทบาทผู้ใช้ (Role-based Access Control)
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && roles.length && !roles.includes(user.role)) {
      const allowedNames = roles.map((r) => ROLE_LABEL[r]).join(', ');
      throw new ForbiddenException(
        `ไม่มีสิทธิ์ดำเนินการ: เฉพาะบทบาท [${allowedNames}] เท่านั้น (ปัจจุบันคุณคือ ${ROLE_LABEL[user.role]})`,
      );
    }

    // 6. ตรวจสอบสิทธิ์ตาม Permissions ย่อยที่กำหนด
    const perms = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS, targets);
    if (perms && perms.length && !perms.some((p) => hasPermission(user, p))) {
      const permNames = perms.map((p) => PERMISSION_LABEL[p]).join(' หรือ ');
      throw new ForbiddenException(`ไม่มีสิทธิ์ดำเนินการ: ต้องเปิดสิทธิ์ "${permNames}"`);
    }

    // อนุญาตให้คำขอผ่านการตรวจสอบ
    return true;
  }
}
