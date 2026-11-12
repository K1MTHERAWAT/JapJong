import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * =====================================================================
 * ไฟล์หลักเริ่มต้นระบบเซิร์ฟเวอร์ Backend API (Server Bootstrap Entrypoint)
 * =====================================================================
 * ระบบจับจอง (JapJong) Backend API บน NestJS Framework:
 * 1. โหลดค่า Environment Variables (.env) อัตโนมัติจากหลายตำแหน่ง
 * 2. ตั้งค่า Global Prefix เป็น '/api' พร้อม URL Rewriting รองรับ LINE Webhook & SSO
 * 3. ระบบรักษาความปลอดภัย: Helmet headers, CORS Whitelist, Body Limit 8MB, rawBody สำหรับ LINE Webhook
 * 4. การตรวจสอบความถูกต้องของข้อมูล (ValidationPipe)
 * 5. Swagger OpenAPI 3.0 Interactive Documentation ที่ `/api/docs`
 */

// โหลดค่าจากไฟล์ .env ในโฟลเดอร์ apps/api และโปรเจกต์หลัก
(() => {
  const candidates = [
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
        if (m) {
          let val = m[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val && (!process.env[m[1]] || process.env[m[1]] === '')) {
            process.env[m[1]] = val;
          }
        }
      }
    }
  }
})();

import { AppModule } from './app.module';

async function bootstrap() {
  // สร้างอินสแตนซ์ของ NestJS Express Application ปิด bodyParser อัตโนมัติเพื่อปรับแต่งเอง
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // กำหนดคำนำหน้าเส้นทาง API ทั้งหมดเป็น /api
  app.setGlobalPrefix('api');

  // URL Rewriting Middleware: ปรับเส้นทาง /auth/line, /line/webhook, /auth/sso-* ให้ชี้ไปที่ /api/* อัตโนมัติ
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (
      req.url.startsWith('/auth/line') ||
      req.url.startsWith('/line/webhook') ||
      req.url.startsWith('/auth/sso-callback') ||
      req.url.startsWith('/auth/sso-login') ||
      req.url.startsWith('/auth/sso-session') ||
      req.url.startsWith('/auth/me')
    ) {
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

  // รองรับ Reverse Proxy / PaaS (เช่น Cloud Run, Nginx, Railway) ให้จับ IP จริงผ่าน X-Forwarded-For
  app.set('trust proxy', 1);

  // Security headers ด้วย helmet (ปิด CSP เฉพาะในระดับ global เพื่อให้ Swagger UI แสดงผลได้)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ตั้ง body limit เป็น 8MB รองรับภาพลายเซ็นและรูปภาพประกอบ พร้อมเก็บ rawBody สำหรับตรวจ X-Line-Signature
  app.use(
    express.json({
      limit: '8mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '8mb', extended: true }));

  // จัดการ Cross-Origin Resource Sharing (CORS) ตามรายการโดเมนที่ได้รับอนุญาต
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

  // ส่วนหัวความปลอดภัย HTTP ป้องกัน Clickjacking และ MIME-type Sniffing
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ตั้งค่า OpenAPI Interactive (Swagger UI) สำหรับทดสอบ API
  const swaggerConfig = new DocumentBuilder()
    .setTitle('JapJong API Documentation')
    .setDescription(
      'ระบบบริหารจัดการขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ แจ้งซ่อมบำรุง และระบบแจ้งเตือน LINE Official Account — ระบบจับจอง (JapJong)',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        name: 'Authorization',
        description: 'กรอก Session Token (เช่น ได้จาก POST /api/auth/login)',
        in: 'header',
      },
      'bearer',
    )
    .addTag('Authentication', 'เข้าสู่ระบบ, ลงทะเบียน, LINE Login, และจัดการโปรไฟล์')
    .addTag('Requests', 'คำขอจองสถานที่, ยืม-คืนครุภัณฑ์, แจ้งซ่อมบำรุง และการลงนาม')
    .addTag('Notifications', 'ศูนย์การแจ้งเตือน, การตั้งค่าช่องทางรับแจ้งเตือน, และ LINE OA Push Message')
    .addTag('Resources', 'ข้อมูลสถานที่และครุภัณฑ์ ตรวจสอบคิวว่างและสต็อก')
    .addTag('Documents', 'การตรวจสอบเอกสารราชการอิเล็กทรอนิกส์ด้วย QR Code')
    .addTag('Admin', 'ภาพรวมระบบ จัดการบัญชีผู้ใช้งาน สิทธิ์ และ Logs')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customSiteTitle: 'JapJong API · OpenAPI Interactive',
    customCss: `
      .swagger-ui .topbar { background-color: #047857; }
      .swagger-ui .topbar .topbar-wrapper a span { display: inline-block; font-weight: bold; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      filter: true,
      tagsSorter: 'alpha',
    },
  });

  // เริ่มต้นเปิดรับการเชื่อมต่อที่พอร์ตที่กำหนด
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `🚀 JapJong API running at http://localhost:${port}/api (DEMO_MODE: ${process.env.DEMO_MODE === 'true'})`,
  );
  // eslint-disable-next-line no-console
  console.log(`📚 OpenAPI Interactive Docs at http://localhost:${port}/api/docs`);
}
bootstrap();
