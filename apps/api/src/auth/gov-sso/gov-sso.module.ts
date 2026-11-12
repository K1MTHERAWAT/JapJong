import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { GovResidenceController, GovSsoController } from './gov-sso.controller';
import { GovSsoService } from './gov-sso.service';

/**
 * GovSsoModule: โมดูลเชื่อมต่อระบบพิสูจน์และยืนยันตัวตนกลางภาครัฐ (IAM-GOV SSO)
 * และระบบทะเบียนราษฎร์/ที่อยู่อาศัย (Residence API)
 */
@Module({
  imports: [DbModule],
  controllers: [GovSsoController, GovResidenceController],
  providers: [GovSsoService],
  exports: [GovSsoService],
})
export class GovSsoModule {}
