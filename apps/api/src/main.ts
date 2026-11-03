import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as express from 'express';

// โหลดค่าจากไฟล์ .env ในโฟลเดอร์ apps/api (กรณีรันผ่าน nest start ที่ไม่ได้โหลด .env อัตโนมัติ)
(() => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
        if (m && process.env[m[1]] === undefined) {
          let val = m[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[m[1]] = val;
        }
      }
      break;
    }
  }
})();

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  // รองรับทั้ง /auth/line, /line/webhook (ตาม LINE Developer Console) และ /api/*
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.url.startsWith('/auth/line') || req.url.startsWith('/line/webhook')) {
      req.url = '/api' + req.url;
    }
    next();
  });

  // ตรวจสอบและแปลง Type ข้อมูลที่ส่งเข้ามาด้วย ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // รองรับ Reverse Proxy / PaaS (เช่น Cloud Run, Nginx, Railway) ให้ throttler จับ IP จริงผ่าน X-Forwarded-For
  app.set('trust proxy', 1);

  // Security headers ด้วย helmet
  app.use(helmet());

  // ตั้ง body limit ให้ตรงกับขนาดข้อมูลรวมภาพลายเซ็น และเก็บ rawBody สำหรับตรวจสอบ X-Line-Signature
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '2mb', extended: true }));

  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('ไม่อนุญาตการเชื่อมต่อข้ามโดเมน (CORS)'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `🚀 Jongwen API running at http://localhost:${port}/api (DEMO_MODE: ${process.env.DEMO_MODE === 'true'})`,
  );
}
bootstrap();
