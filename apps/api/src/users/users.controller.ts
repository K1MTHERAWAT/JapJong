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

export class UpdateUserMeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @Matches(/^0[689]\d{8}$/, {
    message: 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 06, 08 หรือ 09 และมีความยาว 10 หลัก',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class WithdrawConsentDto {
  @IsNotEmpty({ message: 'กรุณาระบุประเภทความยินยอมที่ต้องการถอน' })
  @IsString()
  consentType!: string;
}

@ApiTags('Authentication')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly db: DbService) {}

  @Get('me')
  async getMe(@CurrentUser() user: Account) {
    const freshUser = this.db.accounts.find((a) => a.id === user.id) || user;
    const lineAccount = await this.db.getLineAccount(user.id);
    const consents = await this.db.getUserConsents(user.id);

    return {
      account: this.db.toPublic(freshUser),
      lineAccount,
      consents,
    };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: Account,
    @Body() body: UpdateUserMeDto,
  ) {
    const acc = this.db.accounts.find((a) => a.id === user.id);
    if (!acc) throw new BadRequestException('ไม่พบบัญชีผู้ใช้งาน');

    if (body.name !== undefined) acc.name = body.name.trim();
    if (body.nickname !== undefined) acc.nickname = body.nickname.trim();
    if (body.position !== undefined) acc.position = body.position.trim();
    if (body.department !== undefined) acc.department = body.department.trim();
    if (body.phone !== undefined) acc.phone = body.phone.trim();
    if (body.email !== undefined) acc.email = body.email.trim();

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

  @Post('me/consents/withdraw')
  async withdrawConsent(
    @CurrentUser() user: Account,
    @Body() body: WithdrawConsentDto,
  ) {
    if (body.consentType === 'TERMS_OF_SERVICE' || body.consentType === 'PRIVACY_POLICY') {
      throw new BadRequestException('ไม่สามารถถอนความยินยอมที่เป็นข้อกำหนดจำเป็นในการให้บริการได้');
    }

    const updated = await this.db.withdrawConsent(user.id, body.consentType);
    return { ok: true, withdrawn: updated };
  }
}
