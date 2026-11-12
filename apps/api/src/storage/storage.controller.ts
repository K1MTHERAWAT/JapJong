import { Controller, Get, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { StorageService } from './storage.service';
import { Public } from '../auth/auth.guard';

/**
 * Controller ให้บริการสตรีมไฟล์สาธารณะจาก Cloud Object Storage ไปยัง Client
 */
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * ให้บริการส่งไฟล์ตาม Path ที่ระบุ (Public เข้าถึงได้โดยไม่ต้องล็อกอิน)
   * GET /storage/files/*path
   */
  @Public()
  @Get('files/*path')
  async serveFile(@Req() req: Request, @Res() res: Response) {
    try {
      // ดึงคีย์ไฟล์จาก URL หลังจาก /api/storage/files/ หรือ /storage/files/
      const rawParam = (req.params as any)?.path ?? (req.params as any)?.[0];
      let key = '';

      if (Array.isArray(rawParam)) {
        key = rawParam.join('/');
      } else if (typeof rawParam === 'string' && rawParam.trim()) {
        key = rawParam;
      } else {
        const fullUrl = req.originalUrl || req.url || '';
        const cleanUrl = fullUrl.split('?')[0];
        const match = cleanUrl.match(/\/files\/(.+)$/);
        key = match ? match[1] : '';
      }

      // ถอดรหัส URL encoding และตัดเครื่องหมาย / นำหน้าออก
      key = decodeURIComponent(String(key).split('?')[0]).replace(/^\/+/, '');

      if (!key) {
        return res.status(404).send('Not Found');
      }

      // ดึง Stream ของไฟล์จาก StorageService
      const { stream, contentType, contentLength } = await this.storageService.getFile(key);

      // กำหนด Header การตอบกลับ
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      // ตั้งค่า Cache: แคชในเบราว์เซอร์ 1 วัน และ CDN 7 วัน
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

      // ตรวจสอบกรณีเกิดข้อผิดพลาดระหว่างการสตรีม
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(404).send('File not found');
        }
      });

      // ส่งข้อมูลไบนารีผ่าน Pipe เข้าสู่ HTTP Response
      stream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        const status = err?.getStatus ? err.getStatus() : 404;
        res.status(status).send('File not found');
      }
    }
  }
}
