import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

/**
 * StorageModule: โมดูลจัดการไฟล์และการจัดเก็บบน Cloud Object Storage (S3 / Railway S3)
 * ให้บริการอัปโหลดและดาวน์โหลดไฟล์ภาพถ่าย ทรัพย์สิน หรือเอกสารแนบ
 */
@Module({
  // Controller สำหรับให้บริการดาวน์โหลดไฟล์ผ่าน HTTP Stream
  controllers: [StorageController],
  // Provider สำหรับติดต่อสื่อสารกับ S3 Client SDK
  providers: [StorageService],
  // ส่งออก StorageService เพื่อให้โมดูลอื่น (เช่น เอกสาร, ทรัพยากร) เรียกใช้ได้
  exports: [StorageService],
})
export class StorageModule {}
