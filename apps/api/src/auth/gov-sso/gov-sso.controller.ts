import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth.guard';
import { GovSsoCallbackDto, GovSsoExchangeDto, SearchResidenceDto } from './gov-sso.dto';
import { GovSsoService } from './gov-sso.service';

@ApiTags('GovCenter SSO')
@Controller('auth')
export class GovSsoController {
  constructor(private readonly ssoService: GovSsoService) {}

  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Public()
  @Post('sso-callback')
  @ApiOperation({ summary: 'รับ Authorization Code จาก Gov Center SSO เพื่อยืนยันตัวตนและเข้าสู่ระบบ' })
  async ssoCallback(@Body() body: GovSsoCallbackDto) {
    return this.ssoService.handleSsoCallback(body.code);
  }

  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Public()
  @Post('sso-session')
  @ApiOperation({ summary: 'แลก SSO session token จาก Gov Center เป็นเซสชันของระบบจับจอง' })
  async ssoSession(@Body() body: GovSsoExchangeDto) {
    return this.ssoService.exchangeSsoSession(body.sessionToken);
  }
}

@ApiTags('GovCenter Residences')
@Controller('residences')
export class GovResidenceController {
  constructor(private readonly ssoService: GovSsoService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'ค้นหาข้อมูลที่อยู่ / บ้านจาก IAM-GOV Residence API' })
  async search(@Query() query: SearchResidenceDto) {
    return this.ssoService.searchResidences(query);
  }
}

