import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { DbService } from './db/db.service';
import { DocumentsModule } from './documents/documents.module';
import { RequestsController } from './requests/requests.controller';
import { ResourcesController } from './resources/resources.controller';

@Module({
  imports: [
    DocumentsModule,
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
  controllers: [AuthController, ResourcesController, RequestsController, AdminController],
  providers: [
    DbService,
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
