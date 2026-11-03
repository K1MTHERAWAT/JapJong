import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';

// DbService มาจาก DbModule (Global) — ห้ามประกาศซ้ำใน providers
@Module({
  controllers: [UsersController],
  providers: [],
  exports: [],
})
export class UsersModule {}
