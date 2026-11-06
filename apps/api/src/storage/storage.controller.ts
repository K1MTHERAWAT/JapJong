import { Controller, Get, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { StorageService } from './storage.service';
import { Public } from '../auth/auth.guard';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get('files/*path')
  async serveFile(@Req() req: Request, @Res() res: Response) {
    try {
      // Extract key after /api/storage/files/ or /storage/files/
      // req.params.path can be a string, string[], or empty depending on router version
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

      key = decodeURIComponent(String(key).split('?')[0]).replace(/^\/+/, '');

      if (!key) {
        return res.status(404).send('Not Found');
      }

      const { stream, contentType, contentLength } = await this.storageService.getFile(key);

      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      // Cache for 1 day in browser, 7 days in CDN
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(404).send('File not found');
        }
      });

      stream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        const status = err?.getStatus ? err.getStatus() : 404;
        res.status(status).send('File not found');
      }
    }
  }
}


