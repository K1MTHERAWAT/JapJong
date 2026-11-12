import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Account } from '@japjong/shared';
import { CurrentUser } from '../auth/auth.guard';
import { DbService } from '../db/db.service';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Data Transfer Object (DTO) สำหรับอัปเดตข้อมูลผู้ใช้งานส่วนตัว (/users/me)
 */
export class UpdateUserMeDto {
  // ชื่อ-นามสกุล
  @IsOptional()
  @IsString()
  name?: string;

  // ชื่อเล่น
  @IsOptional()
  @IsString()
  nickname?: string;

  // ตำแหน่งหน้าที่
  @IsOptional()
  @IsString()
  position?: string;

  // สำนัก / กอง / แผนก
  @IsOptional()
  @IsString()
  department?: string;

  // เบอร์โทรศัพท์ 10 หลัก
  @IsOptional()
  @Matches(/^0[689]\d{8}$/, {
    message: 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 06, 08 หรือ 09 และมีความยาว 10 หลัก',
  })
  phone?: string;

  // อีเมล
  @IsOptional()
  @IsString()
  email?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับขอถอนความยินยอมตามสิทธิ PDPA
 */
export class WithdrawConsentDto {
  // ประเภทความยินยอมที่ต้องการเพิกถอน เช่น NOTIFICATION_CONSENT
  @IsNotEmpty({ message: 'กรุณาระบุประเภทความยินยอมที่ต้องการถอน' })
  @IsString()
  consentType!: string;
}

/**
 * Controller ให้บริการดึงและแก้ไขข้อมูลโปรไฟล์ผู้ใช้งาน ตลอดจนการจัดการสิทธิ์ความยินยอม PDPA
 */
@ApiTags('Authentication')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly db: DbService) {}

  /**
   * ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน ข้อมูลบัญชี LINE ที่เชื่อมต่อ และรายการความยินยอม PDPA
   * GET /users/me
   */
  @Get('me')
  async getMe(@CurrentUser() user: Account) {
    // ดึงข้อมูลบัญชีล่าสุดจาก State
    const freshUser = this.db.accounts.find((a) => a.id === user.id) || user;
    // ดึงข้อมูลบัญชี LINE ที่ผูกไว้
    const lineAccount = await this.db.getLineAccount(user.id);
    // ดึงรายการความยินยอม PDPA ที่เคยให้ไว้
    const consents = await this.db.getUserConsents(user.id);

    return {
      account: this.db.toPublic(freshUser),
      lineAccount,
      consents,
    };
  }

  /**
   * อัปเดตข้อมูลส่วนตัวของผู้ใช้ปัจจุบัน
   * PATCH /users/me
   */
  @Patch('me')
  async updateMe(
    @CurrentUser() user: Account,
    @Body() body: UpdateUserMeDto,
  ) {
    const acc = this.db.accounts.find((a) => a.id === user.id);
    if (!acc) throw new BadRequestException('ไม่พบบัญชีผู้ใช้งาน');

    // นำเข้าข้อมูลที่มีการส่งมาแก้ไข
    if (body.name !== undefined) acc.name = body.name.trim();
    if (body.nickname !== undefined) acc.nickname = body.nickname.trim();
    if (body.position !== undefined) acc.position = body.position.trim();
    if (body.department !== undefined) acc.department = body.department.trim();
    if (body.phone !== undefined) acc.phone = body.phone.trim();
    if (body.email !== undefined) acc.email = body.email.trim();

    // บันทึกลงฐานข้อมูล PostgreSQL หากเปิดใช้งาน Prisma
    if (this.db.dbAvailable) {
      await this.db.prisma.account.update({
        where: { id: user.id },
        data: {
          name: acc.name,
          nickname: acc.nickname,
          position: acc.position,
          department: acc.department,
          phone: acc.phone,
        },
      }).catch(() => {});

      if (acc.email) {
        await this.db.prisma.$executeRawUnsafe(
          `UPDATE "accounts" SET "email" = $1 WHERE "id" = $2`,
          acc.email,
          user.id,
        ).catch(() => {});
      }
    }

    return this.db.toPublic(acc);
  }

  /**
   * ถอนความยินยอม PDPA (สิทธิของเจ้าของข้อมูลส่วนบุคคล)
   * POST /users/me/consents/withdraw
   */
  @Post('me/consents/withdraw')
  async withdrawConsent(
    @CurrentUser() user: Account,
    @Body() body: WithdrawConsentDto,
  ) {
    // ป้องกันการถอนความยินยอมที่เป็นเงื่อนไขพื้นฐานในการให้บริการ
    if (body.consentType === 'TERMS_OF_SERVICE' || body.consentType === 'PRIVACY_POLICY') {
      throw new BadRequestException('ไม่สามารถถอนความยินยอมที่เป็นข้อกำหนดจำเป็นในการให้บริการได้');
    }

    // บันทึกการถอนความยินยอมในฐานข้อมูล
    const updated = await this.db.withdrawConsent(user.id, body.consentType);
    return { ok: true, withdrawn: updated };
  }
}
