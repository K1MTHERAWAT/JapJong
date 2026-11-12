import { Module } from '@nestjs/common';
import { LineAuthController } from './line-auth.controller';
import { LineAuthService } from './line-auth.service';

/**
 * LineAuthModule: โมดูลจัดการระบบยืนยันตัวตนผ่าน LINE (LINE Login & LIFF SSO)
 * - DbService ถูกนำเข้าผ่าน DbModule (Global) จึงไม่จำเป็นต้องประกาศซ้ำ
 * - ส่งออก LineAuthService เพื่อให้โมดูลอื่นสามารถตรวจสอบสถานะการเชื่อมต่อบัญชี LINE ได้
 */
@Module({
  controllers: [LineAuthController],
  providers: [LineAuthService],
  exports: [LineAuthService],
})
export class LineAuthModule {}
