import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.guard';
import { DbService } from '../db/db.service';

@ApiTags('Admin')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'japjong-api',
      dbAvailable: this.db.dbAvailable,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}

