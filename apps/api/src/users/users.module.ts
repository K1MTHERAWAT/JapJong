import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';

/**
 * UsersModule: โมดูลจัดการข้อมูลบัญชีผู้ใช้งานและสิทธิ์ความยินยอม PDPA
 * - DbService ถูกเรียกใช้งานจาก DbModule ซึ่งเป็น Global Module
 */
@Module({
  controllers: [UsersController],
  providers: [],
  exports: [],
})
export class UsersModule {}
