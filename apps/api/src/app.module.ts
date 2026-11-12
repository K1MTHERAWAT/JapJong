import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { SidebarServicesController } from './admin/sidebar-services.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { EmailService } from './auth/email.service';
import { DbModule } from './db/db.module';
import { DocumentsModule } from './documents/documents.module';
import { LineAuthModule } from './auth/line/line-auth.module';
import { GovSsoModule } from './auth/gov-sso/gov-sso.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { RequestsController } from './requests/requests.controller';
import { ResourcesController } from './resources/resources.controller';
import { StorageModule } from './storage/storage.module';
import { HealthController } from './health/health.controller';

/**
 * =====================================================================
 * โมดูลหลักระดับรากของระบบ (Root Application Module)
 * =====================================================================
 * รวมโมดูลทางธุรกิจ, คอนโทรลเลอร์ และการป้องกันความปลอดภัยระดับโกลบอล:
 * 1. ThrottlerModule: ป้องกันการยิงสแปม (Rate Limiting) 100 req/min ทั่วไป และ 10 req/min สำหรับ Auth
 * 2. AuthGuard: การตรวจสิทธิ์การเข้าถึง (Bearer Token, RBAC Roles & Permissions) ระดับโกลบอล
 * 3. DbModule: การเชื่อมต่อและการจัดเก็บฐานข้อมูล
 * 4. Sub-modules: Notifications, Documents, LineAuth, GovSso, Users, Storage
 */

@Module({
  imports: [
    DbModule,
    NotificationsModule,
    DocumentsModule,
    LineAuthModule,
    GovSsoModule,
    UsersModule,
    StorageModule,
    // การจำกัดอัตราการส่งคำขอเพื่อป้องกัน Brute-force และ DoS Attacks
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [
    AuthController,
    ResourcesController,
    RequestsController,
    AdminController,
    SidebarServicesController,
    HealthController,
  ],
  providers: [
    EmailService,
    // เปิดใช้งาน ThrottlerGuard ระดับโกลบอล
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // เปิดใช้งาน AuthGuard ระดับโกลบอล (ตรวจสอบ Decorator @Public() และ Roles)
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
