import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.guard';
import { DbService } from '../db/db.service';

/**
 * =====================================================================
 * ตัวตรวจสอบสถานะการทำงานของระบบ (Healthcheck Controller)
 * =====================================================================
 * Endpoint: `GET /api/health`
 * ใช้สำหรับ Container Orchestration (เช่น Kubernetes Liveness/Readiness Probe, Cloud Run)
 * รายงานสถานะความพร้อมของฐานข้อมูล, จำนวนผู้ใช้, ทรัพยากร, Uptime และวันเวลาปัจจุบัน
 */

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
      lastDbError: this.db.lastDbError,
      databaseUrlPrefix: (process.env.DATABASE_URL || '').slice(0, 35),
      accountsCount: this.db.accounts.length,
      venuesCount: this.db.venues.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
