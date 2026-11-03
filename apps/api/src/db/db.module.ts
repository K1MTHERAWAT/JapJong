import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

/**
 * DbService ต้องเป็น Singleton เดียวทั้งแอป
 * เพราะเก็บ cache ของ accounts / sessions ไว้ในหน่วยความจำ
 * หากแต่ละ Module ประกาศ DbService ใน providers เอง จะได้คนละ instance
 * ทำให้บัญชีที่สร้างใน Module หนึ่งไม่ปรากฏใน AuthGuard
 */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}

