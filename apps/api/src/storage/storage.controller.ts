import { Controller, Get, Req, Res, Headers } from '@nestjs/common';
import { Response, Request } from 'express';
import { StorageService } from './storage.service';
import { Public } from '../auth/auth.guard';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get('files/*path')
  async serveFile(@Req() req: Request, @Res() res: Response) {
    // Extract key after /api/storage/files/ or /storage/files/
    const prefix = req.baseUrl ? `${req.baseUrl}/files/` : '/storage/files/';
    let key = (req.params as any)?.path || req.originalUrl.split(prefix)[1] || req.path.replace(/^\/files\//, '');
    key = decodeURIComponent(key.split('?')[0]);

    const { stream, contentType, contentLength } = await this.storageService.getFile(key);

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    // Cache for 1 day in browser, 7 days in CDN
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    stream.pipe(res);
  }
}

