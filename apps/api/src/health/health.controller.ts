import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.guard';

@ApiTags('Admin')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'japjong-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}

