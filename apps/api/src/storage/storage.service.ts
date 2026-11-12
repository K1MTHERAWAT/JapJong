import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

/**
 * Service บริหารจัดการ Cloud Object Storage ที่รองรับ S3-Compatible API (เช่น AWS S3, Cloudflare R2, หรือ Railway S3)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;
  private bucket: string = '';

  constructor() {
    // อ่านค่าตัวแปรสภาพแวดล้อมสำหรับการเชื่อมต่อ S3
    const endpoint = process.env.AWS_ENDPOINT_URL;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.AWS_S3_BUCKET_NAME;

    // ตรวจสอบความครบถ้วนของข้อมูลการตั้งค่า
    if (endpoint && accessKeyId && secretAccessKey && bucket) {
      this.bucket = bucket;
      this.s3 = new S3Client({
        endpoint,
        region: process.env.AWS_DEFAULT_REGION || 'auto',
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log(`Initialized Railway S3 Storage client for bucket: ${this.bucket}`);
    } else {
      this.logger.warn('Railway S3 Storage variables not fully set — storage features may be limited.');
    }
  }

  /**
   * ตรวจสอบว่าระบบจัดเก็บไฟล์ถูกตั้งค่าพร้อมใช้งานหรือไม่
   */
  isConfigured(): boolean {
    return !!this.s3 && !!this.bucket;
  }

  /**
   * อัปโหลดไฟล์ Buffer ขึ้น Cloud Storage
   * @param key คีย์หรือที่อยู่จัดเก็บไฟล์บน Bucket เช่น 'avatars/u1.png'
   * @param buffer ข้อมูลไบนารีของไฟล์
   * @param contentType ประเภท MIME Type ของไฟล์ (ค่าเริ่มต้นคือ image/jpeg)
   * @returns URL พาธสัมพัทธ์สำหรับการเข้าถึงไฟล์ผ่าน API
   */
  async uploadFile(key: string, buffer: Buffer, contentType: string = 'image/jpeg'): Promise<string> {
    if (!this.s3) throw new Error('Storage is not configured');
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return `/api/storage/files/${key}`;
  }

  /**
   * ดาวน์โหลดไฟล์จาก Cloud Storage ในรูปแบบ Readable Stream
   * @param key คีย์หรือที่อยู่จัดเก็บไฟล์บน Bucket
   * @returns Stream สำหรับส่งต่อข้อมูล พร้อม Content-Type และ Content-Length
   */
  async getFile(key: string): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
    if (!this.s3) throw new NotFoundException('Storage not configured');
    try {
      const res = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        stream: res.Body as unknown as Readable,
        contentType: res.ContentType || 'application/octet-stream',
        contentLength: res.ContentLength,
      };
    } catch (err: any) {
      this.logger.warn(`File not found or S3 error for key "${key}": ${err.message}`);
      throw new NotFoundException('File not found');
    }
  }
}
