import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
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
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    DbModule,
    NotificationsModule,
    DocumentsModule,
    LineAuthModule,
    GovSsoModule,
    UsersModule,
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
  controllers: [AuthController, ResourcesController, RequestsController, AdminController, HealthController],
  providers: [
    EmailService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
