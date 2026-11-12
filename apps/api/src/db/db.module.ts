import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

/**
 * DbModule: โมดูลฐานข้อมูลหลักของระบบ
 * - กำหนดเป็น @Global() เพื่อให้ DbService เป็น Singleton ตัวเดียวตลอดทั้งแอปพลิเคชัน
 * - ป้องกันปัญหาการแยก Instance ของ in-memory cache/state ระหว่างโมดูลต่างๆ
 */
@Global()
@Module({
  // ลงทะเบียน DbService ในฐานะ Provider
  providers: [DbService],
  // ส่งออก DbService เพื่อให้ทุกโมดูลในระบบเรียกใช้งานได้โดยตรง
  exports: [DbService],
})
export class DbModule {}
