import { Module } from '@nestjs/common';
import { LineAuthController } from './line-auth.controller';
import { LineAuthService } from './line-auth.service';

// DbService มาจาก DbModule (Global) — ห้ามประกาศซ้ำใน providers
@Module({
  controllers: [LineAuthController],
  providers: [LineAuthService],
  exports: [LineAuthService],
})
export class LineAuthModule {}
