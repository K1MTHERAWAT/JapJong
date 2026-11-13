import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import {
  DEFAULT_PERMISSIONS,
  Account,
  DemoAccountSummary,
  validateThaiAddressHierarchy,
  validateThaiPhone,
} from '@japjong/shared';
import { DbService } from '../db/db.service';
import { EmailService, isDemoEmail } from './email.service';
import {
  CurrentUser,
  Public,
  assertNotLocked,
  clearFailures,
  recordFailure,
  requireDrawnSignature,
} from './auth.guard';
import { hashSecret, verifySecret } from './secret';
import {
  ChangePasswordDto,
  DemoLoginDto,
  LoginDto,
  RegisterDto,
  RequestOtpDto,
  RequestSignOtpDto,
  SetPinDto,
  SetSignatureDto,
  UpdateProfileDto,
  VerifyPinDto,
  VerifySignOtpDto,
} from './dto';

/**
 * ซ่อนตัวอักษรบางส่วนของอีเมล เช่น ki***@gmail.com เพื่อความเป็นส่วนตัว (Privacy Masking)
 * @param email อีเมลฉบับเต็ม
 * @returns อีเมลที่ทำการ Mask อักขระตรงกลางแล้ว
 */
function maskEmail(email?: string): string {
  // หากไม่มีอีเมลหรือไม่ตรงรูปแบบพื้นฐาน ให้คืนค่าเดิมกลับไป
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  // หากชื่อผู้ใช้สั้นมาก (2 ตัวอักษรหรือน้อยกว่า) ซ่อนเฉพาะส่วนท้าย
  if (local.length <= 2) {
    return `${local}***@${domain}`;
  }
  // แสดง 2 ตัวแรก แล้วตามด้วย *** และชื่อโดเมน
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Controller จัดการระบบการยืนยันตัวตน (Authentication & Authorization)
 * ครอบคลุมการเข้าสู่ระบบทั่วไป, Demo Login, ลงทะเบียน, จัดการรหัสผ่าน, PIN, ลายเซ็น และ Email OTP
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * ดึงรายชื่อบัญชีทดสอบสำหรับแสดงผลบนหน้า Demo One-Click Login
   * เปิดให้เข้าถึงได้เฉพาะเมื่อเปิดใช้งาน DEMO_MODE เท่านั้น
   */
  @Public()
  @Get('demo-accounts')
  async demoAccounts(): Promise<DemoAccountSummary[]> {
    // ปิดการใช้งานหากไม่ได้ตั้งค่า DEMO_MODE เป็น true
    if (process.env.DEMO_MODE !== 'true') {
      throw new NotFoundException('Endpoint not available');
    }
    // ตรวจสอบและรีเซ็ตข้อมูลเดโมเมื่อครบกำหนดเวลา
    await this.db.checkPendingDemoReset();
    // คัดกรองเฉพาะบัญชีที่เป็น Demo และยังมีสถานะ Active
    return this.db.accounts
      .filter((a) => a.isDemo && a.active !== false)
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        position: a.position,
        department: a.department,
        initial: a.initial,
        nickname: a.nickname,
      }));
  }

  /**
   * เข้าสู่ระบบด้วยบัญชีทดสอบในคลิกเดียว (Demo One-Click Login)
   */
  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Public()
  @Post('demo-login')
  async demoLogin(@Body() body: DemoLoginDto) {
    // ป้องกันการเรียกใช้บน Production หากไม่ได้เปิด DEMO_MODE
    if (process.env.DEMO_MODE !== 'true') {
      throw new NotFoundException('Endpoint not available');
    }
    await this.db.checkPendingDemoReset();
    const accountId = String(body.accountId ?? '').trim();
    if (!accountId) throw new BadRequestException('กรุณาระบุ accountId');

    // ค้นหาบัญชีทดสอบจากฐานข้อมูล
    const user = this.db.accounts.find((a) => a.id === accountId && a.isDemo);
    if (!user) {
      throw new UnauthorizedException('ไม่พบบัญชีทดสอบนี้ในระบบ');
    }
    if (user.active === false) {
      throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
    }
    // สร้าง Token Session ใหม่
    const token = await this.db.createSession(user.id);
    return { token, account: this.db.toPublic(user) };
  }

  /**
   * เข้าสู่ระบบด้วยชื่อผู้ใช้ / อีเมล / เบอร์โทรศัพท์ และรหัสผ่าน
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('login')
  async login(@Body() body: LoginDto) {
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!username || !password) throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

    // ตรวจสอบสถานะการระงับชั่วคราว (Brute-force Lockout)
    const lockKey = `login:${username}`;
    assertNotLocked(lockKey);

    // ดึงเฉพาะตัวเลขเพื่อรองรับการค้นหาด้วยเบอร์โทรศัพท์
    const digits = username.replace(/\D/g, '');
    const user = this.db.accounts.find(
      (a) =>
        a.username.toLowerCase() === username ||
        (a.email && a.email.toLowerCase() === username) ||
        (digits.length >= 9 && a.phone.replace(/\D/g, '') === digits),
    );
    // ตรวจสอบรหัสผ่านด้วย Argon2
    if (!user || !(await verifySecret(user.password, password))) {
      recordFailure(lockKey);
      throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    // ตรวจสอบว่าบัญชีถูกระงับการใช้งานหรือไม่
    if (user.active === false) {
      throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
    }
    // ล้างประวัติการพยายามล็อกอินล้มเหลว
    clearFailures(lockKey);
    // สร้าง Token Session ใหม่สำหรับใช้งานในคำขอถัดไป
    const token = await this.db.createSession(user.id);
    return { token, account: this.db.toPublic(user) };
  }

  /**
   * ออกจากระบบและเพิกถอน Token ปัจจุบัน
   */
  @Post('logout')
  async logout(@Req() req: { token?: string }) {
    if (req.token) await this.db.revokeSession(req.token);
    return { ok: true };
  }

  /**
   * ขอรหัส OTP ทางเบอร์โทรศัพท์มือถือ (สำหรับการลงทะเบียน)
   */
  @Throttle({ auth: { limit: 3, ttl: 60000 } })
  @Public()
  @Post('request-otp')
  async requestOtp(@Body() body: RequestOtpDto) {
    // ตรวจสอบว่าระบบเปิดรับการลงทะเบียนด้วยตนเองหรือไม่ (ค่าเริ่มต้นเปิดรับ ยกเว้นระบุ REGISTRATION_OPEN=false)
    const isRegistrationOpen = process.env.REGISTRATION_OPEN !== 'false';
    if (!isRegistrationOpen) {
      throw new ForbiddenException('ปิดรับการลงทะเบียนด้วยตนเองชั่วคราว');
    }
    const phone = String(body.phone ?? '').trim();
    const digits = phone.replace(/\D/g, '');
    // ตรวจสอบรูปแบบเบอร์โทรศัพท์ไทย
    if (!/^0\d{8,9}$/.test(digits)) {
      throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง');
    }

    // ในโหมดเดโม ให้ใช้รหัสจำลอง 000000 ได้ทันที
    if (process.env.DEMO_MODE === 'true') {
      return { ok: true, message: 'โหมดเดโม: ใช้รหัส OTP 000000' };
    }

    // สุ่มรหัส OTP 6 หลักและ Hash ก่อนบันทึกลงฐานข้อมูล
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await hashSecret(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.db.prisma.otpCode.create({
      data: {
        phone: digits,
        codeHash,
        attempts: 0,
        expiresAt,
      },
    });

    // ส่งข้อความแจ้งเตือนผลลัพธ์
    return { ok: true, message: 'ส่งรหัส OTP เรียบร้อยแล้ว (หมดอายุใน 5 นาที)' };
  }

  /**
   * ลงทะเบียนบัญชีผู้ใช้งานใหม่
   */
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('register')
  async register(
    @Body()
    body: RegisterDto,
  ) {
    // ตรวจสอบว่าระบบเปิดรับการลงทะเบียนด้วยตนเองหรือไม่ (ค่าเริ่มต้นเปิดรับ ยกเว้นระบุ REGISTRATION_OPEN=false)
    const isRegistrationOpen = process.env.REGISTRATION_OPEN !== 'false';
    if (!isRegistrationOpen) {
      throw new ForbiddenException('ปิดรับการลงทะเบียนด้วยตนเองชั่วคราว กรุณาติดต่อเจ้าหน้าที่เพื่อสร้างบัญชี');
    }

    const name = String(body.name ?? '').trim().slice(0, 100);
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const password = String(body.password ?? '');
    const digits = phone.replace(/\D/g, '');

    if (!name) throw new BadRequestException('กรุณากรอกชื่อ-นามสกุล');
    if (!password) throw new BadRequestException('กรุณากรอกรหัสผ่าน');

    // ตรวจสอบความถูกต้องและไม่ซ้ำซ้อนของอีเมล
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('รูปแบบอีเมลไม่ถูกต้อง');
      }
      if (this.db.accounts.some((a) => (a.email && a.email.toLowerCase() === email) || a.username.toLowerCase() === email)) {
        throw new ConflictException('อีเมลนี้ถูกใช้งานในระบบแล้ว');
      }
    }

    // ตรวจสอบความถูกต้องและไม่ซ้ำซ้อนของเบอร์โทรศัพท์
    if (digits) {
      if (!/^0\d{8,9}$/.test(digits)) throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง');
      if (this.db.accounts.some((a) => a.phone.replace(/\D/g, '') === digits || a.username === digits)) {
        throw new ConflictException('เบอร์โทรศัพท์นี้ลงทะเบียนแล้ว');
      }
    }

    // ตรวจสอบความแข็งแกร่งของรหัสผ่าน
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว และมีทั้งตัวอักษรและตัวเลข');
    }

    // ตรวจสอบ OTP เฉพาะกรณีที่มีการส่ง OTP มา (Backward Compatibility)
    const rawOtp = String(body.otp ?? '').trim();
    if (rawOtp && digits) {
      if (process.env.DEMO_MODE === 'true') {
        if (rawOtp !== '000000') {
          throw new BadRequestException('รหัส OTP ในโหมดเดโมคือ 000000');
        }
      } else {
        if (!/^\d{6}$/.test(rawOtp)) {
          throw new BadRequestException('รหัส OTP ไม่ถูกต้อง (ต้องเป็นตัวเลข 6 หลัก)');
        }
        const otpRecord = await this.db.prisma.otpCode.findFirst({
          where: {
            phone: digits,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            attempts: { lt: 5 },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!otpRecord) {
          throw new BadRequestException('ไม่พบรหัส OTP หรือรหัสหมดอายุแล้ว (กรุณาขอรหัสใหม่)');
        }
        await this.db.prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { attempts: { increment: 1 } },
        });
        const valid = await verifySecret(otpRecord.codeHash, rawOtp);
        if (!valid) {
          throw new BadRequestException('รหัส OTP ไม่ถูกต้อง');
        }
        await this.db.prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { consumedAt: new Date() },
        });
      }
    }

    // Hash รหัสผ่านก่อนบันทึก
    const hashedPassword = await hashSecret(password);
    const id = await this.db.nextId('u');
    const username = email || (digits ? digits : (body.username ? body.username.trim().toLowerCase() : `user_${id}`));

    // สร้างข้อมูลโครงสร้างบัญชีผู้ใช้งานใหม่
    const account: Account = {
      id,
      username,
      password: hashedPassword,
      name,
      nickname: name.split(' ')[0] || name,
      initial: name.charAt(0) || 'ผ',
      role: 'USER',
      position: 'ประชาชน',
      department: String(body.department ?? '').trim().slice(0, 100) || 'ประชาชนทั่วไป',
      phone: digits ? phone : '',
      email: email || undefined,
      lineName: String(body.lineName ?? '').slice(0, 50) || name.split(' ')[0],
      permissions: { ...DEFAULT_PERMISSIONS.USER },
      signature: null,
      pin: null,
      active: true,
      accountStatus: 'ACTIVE',
      registrationCompletedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    
    // บันทึกลงหน่วยความจำและฐานข้อมูลถาวร
    this.db.accounts.unshift(account);
    await this.db.persistAccount(account);
    await this.db.log('user', 'ผู้ใช้ใหม่ลงทะเบียน', account.name, {
      id: account.id,
      name: account.name,
      role: account.role,
    });
    
    // สร้างเซสชันพร้อมส่ง Token คืนให้เข้าใช้งานได้ทันที
    const token = await this.db.createSession(account.id);
    return { token, account: this.db.toPublic(account) };
  }

  /**
   * ดึงข้อมูลโปรไฟล์ผู้ใช้งานปัจจุบัน
   */
  @Get('me')
  me(@CurrentUser() user: Account) {
    return this.db.toPublic(user);
  }

  /**
   * อัปเดตข้อมูลส่วนตัวของผู้ใช้งาน (ชื่อ, ที่อยู่ตามลำดับขั้นราชการ, เบอร์โทรศัพท์, อีเมล)
   */
  @Patch('profile')
  async updateProfile(@CurrentUser() user: Account, @Body() body: UpdateProfileDto) {
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 100);
      if (!name) throw new BadRequestException('กรุณากรอกชื่อ-นามสกุล');
      user.name = name;
      user.initial = name.charAt(0) || 'ผ';
    }
    if (body.nickname !== undefined) {
      const nickname = String(body.nickname).trim().slice(0, 50);
      user.nickname = nickname || user.name.split(' ')[0] || user.name;
    }
    if (body.position !== undefined) {
      const position = String(body.position).trim().slice(0, 100);
      if (position) user.position = position;
    }
    if (body.department !== undefined) {
      const department = String(body.department).trim().slice(0, 100);
      if (!department) throw new BadRequestException('กรุณาระบุหน่วยงาน/สังกัด');
      user.department = department;
    }
    if (body.phone !== undefined) {
      const phoneCheck = validateThaiPhone(body.phone);
      if (!phoneCheck.valid) {
        throw new BadRequestException(phoneCheck.error || 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (0-9)');
      }
      const digits = phoneCheck.value;
      const duplicate = this.db.accounts.some(
        (a) => a.id !== user.id && a.phone.replace(/\D/g, '') === digits,
      );
      if (duplicate) {
        throw new ConflictException('เบอร์โทรศัพท์นี้ถูกใช้งานโดยบัญชีอื่นแล้ว');
      }
      user.phone = digits;
    }
    if (body.lineName !== undefined) {
      user.lineName = String(body.lineName).trim().slice(0, 50) || undefined;
    }
    if (body.addressHouseNo !== undefined) {
      user.addressHouseNo = String(body.addressHouseNo).trim().slice(0, 50) || undefined;
    }
    if (body.addressMoo !== undefined) {
      user.addressMoo = String(body.addressMoo).trim().slice(0, 20) || undefined;
    }
    // ตรวจสอบและจัดเก็บลำดับชั้นของที่อยู่ตามราชการ (จังหวัด -> อำเภอ -> ตำบล)
    const hasAddressInput =
      body.addressProvince !== undefined ||
      body.addressDistrict !== undefined ||
      body.addressSubdistrict !== undefined ||
      body.addressProvinceId !== undefined ||
      body.addressDistrictId !== undefined ||
      body.addressSubdistrictId !== undefined;
    if (hasAddressInput) {
      const provVal = body.addressProvince ?? user.addressProvince ?? '';
      const distVal = body.addressDistrict ?? user.addressDistrict ?? '';
      const subVal = body.addressSubdistrict ?? user.addressSubdistrict ?? '';
      const provId = body.addressProvinceId ?? user.addressProvinceId ?? '';
      const distId = body.addressDistrictId ?? user.addressDistrictId ?? '';
      const subId = body.addressSubdistrictId ?? user.addressSubdistrictId ?? '';
      if (provVal || distVal || subVal || provId || distId || subId) {
        const addrCheck = validateThaiAddressHierarchy({
          province: provVal,
          district: distVal,
          subdistrict: subVal,
          provinceId: provId,
          districtId: distId,
          subdistrictId: subId,
        });
        if (!addrCheck.valid) {
          throw new BadRequestException(addrCheck.error || 'ข้อมูลที่อยู่ (จังหวัด/อำเภอ/ตำบล) ไม่ถูกต้อง');
        }
        user.addressProvince = addrCheck.provinceName;
        user.addressDistrict = addrCheck.districtName;
        user.addressSubdistrict = addrCheck.subdistrictName;
        user.addressProvinceId = addrCheck.provinceId;
        user.addressDistrictId = addrCheck.districtId;
        user.addressSubdistrictId = addrCheck.subdistrictId;
      } else {
        user.addressProvince = undefined;
        user.addressDistrict = undefined;
        user.addressSubdistrict = undefined;
        user.addressProvinceId = undefined;
        user.addressDistrictId = undefined;
        user.addressSubdistrictId = undefined;
      }
    }
    if (body.email !== undefined) {
      const emailStr = String(body.email).trim().toLowerCase();
      if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
        throw new BadRequestException('รูปแบบอีเมลไม่ถูกต้อง');
      }
      user.email = emailStr || undefined;
      user.emailVerified = true;
    }

    await this.db.persistAccount(user);
    await this.db.log('user', 'แก้ไขข้อมูลโปรไฟล์', user.name, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return this.db.toPublic(user);
  }

  /**
   * เปลี่ยนรหัสผ่านเข้าสู่ระบบ
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('password')
  async changePassword(@CurrentUser() user: Account, @Body() body: ChangePasswordDto) {
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่');
    }

    const lockKey = `pwd:${user.id}`;
    assertNotLocked(lockKey);

    // ตรวจสอบรหัสผ่านเดิม
    const valid = await verifySecret(user.password, currentPassword);
    if (!valid) {
      recordFailure(lockKey);
      throw new UnauthorizedException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    clearFailures(lockKey);

    if (newPassword.length < 4) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
    }

    // เข้ารหัสรหัสผ่านใหม่และบันทึก
    user.password = await hashSecret(newPassword);
    await this.db.persistAccount(user);
    await this.db.log('user', 'เปลี่ยนรหัสผ่านบัญชี', user.name, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return { ok: true };
  }

  /**
   * บันทึกหรืออัปเดตภาพลายมือชื่อดิจิทัล (Digital Signature)
   */
  @Post('signature')
  async saveSignature(@CurrentUser() user: Account, @Body() body: SetSignatureDto) {
    // ตรวจสอบความถูกต้องและปลอดภัยของภาพลายเซ็น
    user.signature = requireDrawnSignature(body.signature, 'ผู้ใช้');
    await this.db.persistAccount(user);
    return this.db.toPublic(user);
  }

  /**
   * บันทึกหรือเปลี่ยนรหัส PIN 6 หลักสำหรับการอนุมัติและลงนาม
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('pin')
  async savePin(@CurrentUser() user: Account, @Body() body: SetPinDto) {
    if (!/^\d{6}$/.test(body.pin ?? '')) throw new BadRequestException('PIN ต้องเป็นตัวเลข 6 หลัก');
    if (!user.signature) {
      throw new BadRequestException('กรุณาเขียนและบันทึกลายเซ็นก่อนตั้งรหัส PIN');
    }
    user.pin = await hashSecret(body.pin);
    clearFailures(`pin:${user.id}`);
    await this.db.persistAccount(user);
    return this.db.toPublic(user);
  }

  /**
   * ยืนยันความถูกต้องของรหัส PIN 6 หลัก
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('verify-pin')
  async verifyPin(@CurrentUser() user: Account, @Body() body: VerifyPinDto) {
    if (!user.pin) throw new BadRequestException('บัญชีนี้ยังไม่ได้ตั้งค่า PIN');
    const key = `pin:${user.id}`;
    assertNotLocked(key);
    if (!(await verifySecret(user.pin, String(body.pin ?? '')))) {
      recordFailure(key);
      throw new UnauthorizedException('รหัส PIN ไม่ถูกต้อง');
    }
    clearFailures(key);
    return { ok: true };
  }

  // ===================== Email OTP for Signing (Resend) =====================

  /**
   * ขอรหัส OTP ทางอีเมลเพื่อยืนยันตัวตนในการลงนามเอกสารราชการ
   * จำกัดอัตราการขอ OTP สูงสุดไม่เกิน 10 ครั้งต่อ 60 วินาที เพื่อป้องกันการสแปม (Rate Limiting)
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('sign-otp/request')
  async requestSignOtp(
    @CurrentUser() user: Account,       // ผู้ใช้งานที่ล็อกอินอยู่ในระบบขณะนี้
    @Body() body: RequestSignOtpDto,   // ข้อมูล Body จากคำขอ (อาจมี email ที่ส่งมาใหม่)
    @Req() req: any,                   // คำขอ HTTP Request เพื่อดึง IP address
  ) {
    // ดึงหมายเลข IP ของผู้ใช้งาน (รองรับทั้ง direct IP และ IP ผ่าน Proxy / Cloudflare)
    const ip = req.ip || req.headers['x-forwarded-for'];
    // ใช้อีเมลที่ส่งมาใน Body หรือหากไม่มีให้ใช้อีเมลประจำบัญชีผู้ใช้
    const targetEmail = body?.email?.trim().toLowerCase() || user.email;

    // หากบัญชีไม่มีอีเมล และไม่ได้ระบุอีเมลมา ให้แจ้งเตือนปฏิเสธ
    if (!targetEmail) {
      throw new BadRequestException('ไม่พบอีเมลของบัญชีนี้ กรุณาระบุหรือตั้งค่าอีเมลในหน้าจัดการบัญชีก่อน');
    }

    // หากบัญชียังไม่เคยบันทึกอีเมล ให้บันทึกอีเมลนี้ลงในฐานข้อมูลผู้ใช้ทันที
    if (!user.email) {
      user.email = targetEmail;
      user.emailVerified = true;
      await this.db.persistAccount(user);
    }

    // ตรวจสอบ Rate Limiting รายบุคคล: ต้องเว้นระยะห่างการขอ OTP ใหม่ 60 วินาที
    const latest = await this.db.getLatestSignOtp(user.id);
    if (latest && !latest.consumedAt) {
      const msSince = Date.now() - latest.createdAt.getTime();
      if (msSince < 60000) {
        // คำนวณวินาทีที่ต้องรอคอยก่อนขอใหม่ได้
        const secLeft = Math.ceil((60000 - msSince) / 1000);
        throw new BadRequestException(`กรุณารออีก ${secLeft} วินาทีก่อนขอรหัส OTP ใหม่`);
      }
    }

    // สุ่มสร้างรหัส OTP 6 หลักที่ปลอดภัยด้วย Node.js Crypto (ตั้งแต่ 100000 ถึง 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    // Salt ลับสำหรับเข้ารหัสทางเดียว (HMAC SHA-256)
    const salt = process.env.OTP_SECRET || 'japjong_sign_otp_secret_salt';
    // ทำ Hash ของรหัส OTP เพื่อไม่เก็บรหัสผ่านตัวจริงลงฐานข้อมูล (ป้องกันฐานข้อมูลรั่วไหล)
    const codeHash = crypto.createHmac('sha256', salt).update(otp).digest('hex');

    // กำหนดเวลาหมดอายุของรหัส OTP ไว้ที่ 5 นาที
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // บันทึกรายการ OTP (เฉพาะ Hash, อีเมลปลายทาง, เวลาหมดอายุ) ลงในฐานข้อมูล
    await this.db.createSignOtp(user.id, targetEmail, codeHash, expiresAt);

    // ตรวจสอบว่าปลายทางเป็นอีเมลจำลองของระบบเดโมหรือไม่ (@namcham.go.th, @example.com, @test.com)
    const isMockEmail = isDemoEmail(targetEmail);

    // ส่งรหัส OTP ผ่าน EmailService:
    // - หากเป็นอีเมลจำลอง (isMockEmail = true): จะข้าม Resend จริงและใช้วิธีจำลองเดิมเพื่อไม่ให้ติด Error
    // - หากเป็นอีเมลจริง (isMockEmail = false): จะส่งผ่าน Resend จริงเข้ากล่องจดหมายผู้รับเสมอ
    const sendResult = await this.emailService.sendSignOtpEmail(
      targetEmail,
      otp,
      user.name,
      { isDemo: isMockEmail },
    );
    // หาก Resend เกิดข้อผิดพลาดในการส่งจริง ให้แจ้ง Error ทันที
    if (!sendResult.success) {
      throw new BadRequestException(`ไม่สามารถส่งรหัส OTP ผ่าน Resend ได้: ${sendResult.error}`);
    }

    // ซ่อนตัวอักษรบางส่วนของอีเมล เช่น ki***@gmail.com สำหรับแสดงบนหน้าจอและ Audit Log
    const masked = maskEmail(targetEmail);

    // บันทึกประวัติการทำงาน (Audit Log) ทางราชการเพื่อความโปร่งใสและตรวจสอบย้อนหลังได้
    await this.db.log(
      'user',
      'ขอรหัส OTP สำหรับยืนยันการลงนาม',
      `ส่งรหัส OTP 6 หลักไปยัง ${masked} (${isMockEmail ? 'โหมดเดโม (Mock)' : 'Resend จริง'})`,
      {
        id: user.id,
        name: user.name,
        role: user.role,
        ip,
      },
    );

    // ส่งผลลัพธ์กลับไปยัง Web Frontend
    return {
      ok: true,
      email: targetEmail,
      maskedEmail: masked,
      expiresInSeconds: 300,        // รหัสหมดอายุใน 300 วินาที (5 นาที)
      resendCooldownSeconds: 60,   // เว้นระยะขอใหม่ได้ใน 60 วินาที
      // หากเป็นบัญชีทดสอบหรืออีเมลจำลอง จะแนบ demoOtp ไปให้เพื่อให้มีปุ่มกรอกสะดวกในการทดสอบ
      ...(user.isDemo || isMockEmail ? { demoOtp: otp } : {}),
    };
  }

  /**
   * ยืนยันรหัส OTP 6 หลักที่ได้รับทางอีเมล เพื่อเปิดเซสชันลงนามเอกสาร (30 นาที)
   * จำกัดอัตราการยืนยันรหัส OTP ไม่เกิน 15 ครั้งต่อ 60 วินาที เพื่อป้องกัน Brute-force Attack
   */
  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Post('sign-otp/verify')
  async verifySignOtp(
    @CurrentUser() user: Account,       // บัญชีผู้ใช้งานปัจจุบันที่กำลังยืนยัน
    @Body() body: VerifySignOtpDto,     // ข้อมูล Body ที่มีรหัส OTP 6 หลักที่กรอกเข้ามา
    @Req() req: any,                   // ข้อมูล HTTP Request
  ) {
    // ดึง IP address ของผู้ใช้งานเพื่อบันทึกลง Audit Trail
    const ip = req.ip || req.headers['x-forwarded-for'];
    // ตัดช่องว่างและรับค่ารหัส OTP ที่ผู้ใช้ส่งเข้ามา
    const submittedOtp = String(body.otp ?? '').trim();
    // ตรวจสอบความถูกต้องเบื้องต้น: ต้องเป็นตัวเลข 6 หลักเท่านั้น
    if (!/^\d{6}$/.test(submittedOtp)) {
      throw new BadRequestException('รหัส OTP ต้องเป็นตัวเลข 6 หลัก');
    }

    // ค้นหารายการ OTP ล่าสุดของบัญชีนี้จากฐานข้อมูล
    const latest = await this.db.getLatestSignOtp(user.id);
    // ตรวจสอบว่ามี OTP อยู่จริง, ยังไม่เคยถูกใช้งาน (consumedAt), และยังไม่หมดอายุ (expiresAt)
    if (!latest || latest.consumedAt || latest.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('ไม่พบรหัส OTP ที่ใช้งานได้ หรือรหัสหมดอายุแล้ว กรุณาขอรหัสใหม่');
    }

    // หากเคยกรอกผิดพลาดมาแล้ว 5 ครั้ง ให้ยกเลิก OTP ตัวนี้ทันที (Lockout)
    if (latest.attempts >= 5) {
      await this.db.consumeSignOtp(latest.id);
      throw new BadRequestException('รหัส OTP ถูกระงับเนื่องจากกรอกผิดเกิน 5 ครั้ง กรุณาขอรหัสใหม่');
    }

    // เข้ารหัส OTP ที่ผู้ใช้กรอกเข้ามาด้วย HMAC SHA-256 เพื่อนำไปเปรียบเทียบกับค่า Hash ในฐานข้อมูล
    const salt = process.env.OTP_SECRET || 'japjong_sign_otp_secret_salt';
    const submittedHash = crypto.createHmac('sha256', salt).update(submittedOtp).digest('hex');

    // หากรหัสผ่านที่ส่งมาไม่ตรงกับ Hash ในฐานข้อมูล
    if (submittedHash !== latest.codeHash) {
      // เพิ่มจำนวนครั้งที่กรอกผิดอีก 1 ครั้ง
      const newAttempts = latest.attempts + 1;
      await this.db.recordSignOtpAttempt(latest.id, newAttempts);

      // บันทึก Log การกรอกรหัสผิดพลาด
      await this.db.log('user', 'ยืนยันรหัส OTP ลงนามไม่สำเร็จ', `กรอกรหัสผิดครั้งที่ ${newAttempts}/5`, {
        id: user.id,
        name: user.name,
        role: user.role,
        ip,
      });

      // หากครบ 5 ครั้ง ให้ยกเลิกรหัสทันที
      if (newAttempts >= 5) {
        await this.db.consumeSignOtp(latest.id);
        throw new BadRequestException('รหัส OTP ไม่ถูกต้อง และถูกระงับเนื่องจากกรอกผิดครบ 5 ครั้ง กรุณาขอรหัสใหม่');
      }

      // แจ้งเตือนข้อผิดพลาดพร้อมบอกจำนวนครั้งที่เหลือ
      throw new UnauthorizedException(`รหัส OTP ไม่ถูกต้อง (เหลือโอกาสอีก ${5 - newAttempts} ครั้ง)`);
    }

    // รหัสถูกต้อง -> ใช้ได้ครั้งเดียว มาร์ก consumed ทันที ป้องกัน Replay Attack
    await this.db.consumeSignOtp(latest.id);

    // สร้าง Verified Session ผูกกับ User ID และ Session Token (มีผล 30 นาที)
    const sessionToken = req.token;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.db.createSignVerifiedSession(user.id, sessionToken, expiresAt);

    // บันทึก Audit Log ความสำเร็จ
    await this.db.log('user', 'ยืนยันรหัส OTP สำเร็จ', `เปิดเซสชันลงนามเอกสาร (30 นาที) ถึง ${expiresAt.toLocaleTimeString('th-TH')}`, {
      id: user.id,
      name: user.name,
      role: user.role,
      ip,
    });

    return {
      ok: true,
      verified: true,
      expiresAt: expiresAt.toISOString(),
      message: 'ยืนยันตัวตนสำเร็จ สามารถลงนามเอกสารได้ตลอดเซสชัน (30 นาที)',
    };
  }

  /**
   * ตรวจสอบสถานะการยืนยันเซสชันการลงนาม (Sign Session Status) ว่ายังใช้งานได้หรือไม่
   */
  @SkipThrottle()
  @Get('sign-session/status')
  async getSignSessionStatus(@CurrentUser() user: Account, @Req() req: any) {
    const sessionToken = req.token;
    if (!sessionToken) {
      return { isVerified: false, email: user.email, maskedEmail: maskEmail(user.email) };
    }
    const verified = await this.db.getSignVerifiedSession(user.id, sessionToken);
    return {
      isVerified: !!verified,
      expiresAt: verified?.expiresAt?.toISOString(),
      email: user.email,
      maskedEmail: maskEmail(user.email),
    };
  }

  /**
   * เพิกถอนเซสชันการลงนามก่อนกำหนด (Sign Session Revoke) เมื่อเสร็จสิ้นภารกิจ
   */
  @Post('sign-session/revoke')
  async revokeSignSession(@CurrentUser() user: Account, @Req() req: any) {
    const sessionToken = req.token;
    if (sessionToken) {
      await this.db.revokeSignVerifiedSession(sessionToken);
      await this.db.log('user', 'เพิกถอนเซสชันยืนยันการลงนาม', 'ผู้ใช้ขอยกเลิกเซสชันการลงนามก่อนกำหนด', {
        id: user.id,
        name: user.name,
        role: user.role,
      });
    }
    return { ok: true };
  }
}
