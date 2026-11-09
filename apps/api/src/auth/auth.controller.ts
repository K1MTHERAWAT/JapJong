import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
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
import { EmailService } from './email.service';
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

function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly emailService: EmailService,
  ) {}

  @Public()
  @Get('demo-accounts')
  async demoAccounts(): Promise<DemoAccountSummary[]> {
    if (process.env.DEMO_MODE !== 'true') {
      throw new NotFoundException('Endpoint not available');
    }
    await this.db.checkPendingDemoReset();
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

  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Public()
  @Post('demo-login')
  async demoLogin(@Body() body: DemoLoginDto) {
    if (process.env.DEMO_MODE !== 'true') {
      throw new NotFoundException('Endpoint not available');
    }
    await this.db.checkPendingDemoReset();
    const accountId = String(body.accountId ?? '').trim();
    if (!accountId) throw new BadRequestException('กรุณาระบุ accountId');

    const user = this.db.accounts.find((a) => a.id === accountId && a.isDemo);
    if (!user) {
      throw new UnauthorizedException('ไม่พบบัญชีทดสอบนี้ในระบบ');
    }
    if (user.active === false) {
      throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
    }
    const token = await this.db.createSession(user.id);
    return { token, account: this.db.toPublic(user) };
  }

  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('login')
  async login(@Body() body: LoginDto) {
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!username || !password) throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

    const lockKey = `login:${username}`;
    assertNotLocked(lockKey);

    const digits = username.replace(/\D/g, '');
    const user = this.db.accounts.find(
      (a) =>
        a.username.toLowerCase() === username ||
        (a.email && a.email.toLowerCase() === username) ||
        (digits.length >= 9 && a.phone.replace(/\D/g, '') === digits),
    );
    if (!user || !(await verifySecret(user.password, password))) {
      recordFailure(lockKey);
      throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    if (user.active === false) {
      throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
    }
    clearFailures(lockKey);
    const token = await this.db.createSession(user.id);
    return { token, account: this.db.toPublic(user) };
  }

  @Post('logout')
  async logout(@Req() req: { token?: string }) {
    if (req.token) await this.db.revokeSession(req.token);
    return { ok: true };
  }

  @Throttle({ auth: { limit: 3, ttl: 60000 } })
  @Public()
  @Post('request-otp')
  async requestOtp(@Body() body: RequestOtpDto) {
    const isRegistrationOpen = process.env.DEMO_MODE === 'true' || process.env.REGISTRATION_OPEN === 'true';
    if (!isRegistrationOpen) {
      throw new ForbiddenException('ปิดรับการลงทะเบียนด้วยตนเองชั่วคราว');
    }
    const phone = String(body.phone ?? '').trim();
    const digits = phone.replace(/\D/g, '');
    if (!/^0\d{8,9}$/.test(digits)) {
      throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง');
    }

    if (process.env.DEMO_MODE === 'true') {
      return { ok: true, message: 'โหมดเดโม: ใช้รหัส OTP 000000' };
    }

    // สร้างรหัส OTP สุ่ม 6 หลัก บันทึกลงตาราง otp_codes (หมดอายุใน 5 นาที จำกัด 5 ครั้ง)
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

    // ในการใช้งานจริงจะส่งผ่าน SMS Gateway หรือ LINE OA
    return { ok: true, message: 'ส่งรหัส OTP เรียบร้อยแล้ว (หมดอายุใน 5 นาที)' };
  }

  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('register')
  async register(
    @Body()
    body: RegisterDto,
  ) {
    const isRegistrationOpen = process.env.DEMO_MODE === 'true' || process.env.REGISTRATION_OPEN === 'true';
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

    // ตรวจสอบอีเมล (ถ้ามีการกรอก)
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('รูปแบบอีเมลไม่ถูกต้อง');
      }
      if (this.db.accounts.some((a) => (a.email && a.email.toLowerCase() === email) || a.username.toLowerCase() === email)) {
        throw new ConflictException('อีเมลนี้ถูกใช้งานในระบบแล้ว');
      }
    }

    // ตรวจสอบเบอร์โทรศัพท์ (ถ้ามีการกรอก)
    if (digits) {
      if (!/^0\d{8,9}$/.test(digits)) throw new BadRequestException('เบอร์โทรศัพท์ไม่ถูกต้อง');
      if (this.db.accounts.some((a) => a.phone.replace(/\D/g, '') === digits || a.username === digits)) {
        throw new ConflictException('เบอร์โทรศัพท์นี้ลงทะเบียนแล้ว');
      }
    }

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว และมีทั้งตัวอักษรและตัวเลข');
    }

    // ตรวจสอบ OTP เฉพาะกรณีที่มีการส่ง OTP มา (เพื่อ Backward Compatibility กับการลงทะเบียนแบบ OTP)
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

    const hashedPassword = await hashSecret(password);
    const id = await this.db.nextId('u');
    const username = email || (digits ? digits : (body.username ? body.username.trim().toLowerCase() : `user_${id}`));

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
    this.db.accounts.unshift(account);
    await this.db.persistAccount(account);
    await this.db.log('user', 'ผู้ใช้ใหม่ลงทะเบียน', account.name, {
      id: account.id,
      name: account.name,
      role: account.role,
    });
    const token = await this.db.createSession(account.id);
    return { token, account: this.db.toPublic(account) };
  }

  @Get('me')
  me(@CurrentUser() user: Account) {
    return this.db.toPublic(user);
  }

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

    const valid = await verifySecret(user.password, currentPassword);
    if (!valid) {
      recordFailure(lockKey);
      throw new UnauthorizedException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    clearFailures(lockKey);

    if (newPassword.length < 4) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
    }

    user.password = await hashSecret(newPassword);
    await this.db.persistAccount(user);
    await this.db.log('user', 'เปลี่ยนรหัสผ่านบัญชี', user.name, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return { ok: true };
  }

  @Post('signature')
  async saveSignature(@CurrentUser() user: Account, @Body() body: SetSignatureDto) {
    user.signature = requireDrawnSignature(body.signature, 'ผู้ใช้');
    await this.db.persistAccount(user);
    return this.db.toPublic(user);
  }

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

  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('sign-otp/request')
  async requestSignOtp(
    @CurrentUser() user: Account,
    @Body() body: RequestSignOtpDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const targetEmail = body?.email?.trim().toLowerCase() || user.email;

    if (!targetEmail) {
      throw new BadRequestException('ไม่พบอีเมลของบัญชีนี้ กรุณาระบุหรือตั้งค่าอีเมลในหน้าจัดการบัญชีก่อน');
    }

    if (!user.email) {
      user.email = targetEmail;
      user.emailVerified = true;
      await this.db.persistAccount(user);
    }

    // Rate limiting: ต้องเว้นระยะขอใหม่ 60 วินาที
    const latest = await this.db.getLatestSignOtp(user.id);
    if (latest && !latest.consumedAt) {
      const msSince = Date.now() - latest.createdAt.getTime();
      if (msSince < 60000) {
        const secLeft = Math.ceil((60000 - msSince) / 1000);
        throw new BadRequestException(`กรุณารออีก ${secLeft} วินาทีก่อนขอรหัส OTP ใหม่`);
      }
    }

    // สร้าง OTP 6 หลักด้วย Node.js Crypto
    const otp = crypto.randomInt(100000, 1000000).toString();
    const salt = process.env.OTP_SECRET || 'japjong_sign_otp_secret_salt';
    const codeHash = crypto.createHmac('sha256', salt).update(otp).digest('hex');

    // อายุ 5 นาที
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // บันทึกลงฐานข้อมูล
    await this.db.createSignOtp(user.id, targetEmail, codeHash, expiresAt);

    // ส่งผ่าน Resend
    const sendResult = await this.emailService.sendSignOtpEmail(targetEmail, otp, user.name);
    if (!sendResult.success) {
      throw new BadRequestException(`ไม่สามารถส่งรหัส OTP ผ่าน Resend ได้: ${sendResult.error}`);
    }

    const masked = maskEmail(targetEmail);

    // บันทึก Audit Log
    await this.db.log('user', 'ขอรหัส OTP สำหรับยืนยันการลงนาม', `ส่งรหัส OTP 6 หลักไปยัง ${masked}`, {
      id: user.id,
      name: user.name,
      role: user.role,
      ip,
    });

    return {
      ok: true,
      email: targetEmail,
      maskedEmail: masked,
      expiresInSeconds: 300,
      resendCooldownSeconds: 60,
      demoOtp: otp, // Mock OTP mode สำหรับการทดสอบ
    };
  }

  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Post('sign-otp/verify')
  async verifySignOtp(
    @CurrentUser() user: Account,
    @Body() body: VerifySignOtpDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const submittedOtp = String(body.otp ?? '').trim();
    if (!/^\d{6}$/.test(submittedOtp)) {
      throw new BadRequestException('รหัส OTP ต้องเป็นตัวเลข 6 หลัก');
    }

    const latest = await this.db.getLatestSignOtp(user.id);
    if (!latest || latest.consumedAt || latest.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('ไม่พบรหัส OTP ที่ใช้งานได้ หรือรหัสหมดอายุแล้ว กรุณาขอรหัสใหม่');
    }

    if (latest.attempts >= 5) {
      await this.db.consumeSignOtp(latest.id);
      throw new BadRequestException('รหัส OTP ถูกระงับเนื่องจากกรอกผิดเกิน 5 ครั้ง กรุณาขอรหัสใหม่');
    }

    const salt = process.env.OTP_SECRET || 'japjong_sign_otp_secret_salt';
    const submittedHash = crypto.createHmac('sha256', salt).update(submittedOtp).digest('hex');

    if (submittedHash !== latest.codeHash) {
      const newAttempts = latest.attempts + 1;
      await this.db.recordSignOtpAttempt(latest.id, newAttempts);

      await this.db.log('user', 'ยืนยันรหัส OTP ลงนามไม่สำเร็จ', `กรอกรหัสผิดครั้งที่ ${newAttempts}/5`, {
        id: user.id,
        name: user.name,
        role: user.role,
        ip,
      });

      if (newAttempts >= 5) {
        await this.db.consumeSignOtp(latest.id);
        throw new BadRequestException('รหัส OTP ไม่ถูกต้อง และถูกระงับเนื่องจากกรอกผิดครบ 5 ครั้ง กรุณาขอรหัสใหม่');
      }

      throw new UnauthorizedException(`รหัส OTP ไม่ถูกต้อง (เหลือโอกาสอีก ${5 - newAttempts} ครั้ง)`);
    }

    // รหัสถูกต้อง -> ใช้ได้ครั้งเดียว มาร์ก consumed ทันที ป้องกัน OTP reuse
    await this.db.consumeSignOtp(latest.id);

    // สร้าง Verified Session ผูกกับ User ID และ Session Token (มีผล 30 นาที)
    const sessionToken = req.token;
    if (!sessionToken) {
      throw new UnauthorizedException('ไม่พบโทเคนเซสชันการเข้าสู่ระบบ');
    }

    const verifiedExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const verifiedSession = await this.db.createSignVerifiedSession(user.id, sessionToken, verifiedExpiresAt);

    await this.db.log('user', 'ยืนยัน OTP สำหรับลงนามสำเร็จ', 'สร้าง Verified Signing Session ระยะเวลา 30 นาที', {
      id: user.id,
      name: user.name,
      role: user.role,
      ip,
    });

    return {
      ok: true,
      verified: true,
      expiresAt: verifiedSession.expiresAt.toISOString(),
      message: 'ยืนยันตัวตนสำเร็จ สามารถลงนามเอกสารได้ตลอดเซสชัน',
    };
  }

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
