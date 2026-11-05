import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { Account } from '@japjong/shared';
import { CurrentUser, Public } from '../auth.guard';
import { DbService } from '../../db/db.service';
import { LineAuthService } from './line-auth.service';
import {
  LineCallbackQueryDto,
  LineLiffAuthDto,
  LineRegisterDto,
  LineRegistrationStatusQueryDto,
} from './line-auth.dto';

@ApiTags('Authentication')
@Controller('auth/line')
export class LineAuthController {
  constructor(
    private readonly lineAuthService: LineAuthService,
    private readonly db: DbService,
  ) {}

  /**
   * Initiate LINE Login
   * GET /auth/line
   */
  @Throttle({ auth: { limit: 15, ttl: 60000 } })
  @Public()
  @Get()
  initiateLineLogin(
    @Query('redirect') redirectQuery: string | undefined,
    @Query('linkUserId') linkUserId: string | undefined,
    @Res() res: Response,
  ) {
    const { url, state } = this.lineAuthService.generateAuthUrl(linkUserId);

    if (redirectQuery === 'false') {
      return res.status(200).json({ url, state });
    }

    return res.redirect(url);
  }

  /**
   * Generate LINE OAuth URL to link current authenticated user's account
   * GET /auth/line/link-url
   */
  @Get('link-url')
  getLinkUrl(@CurrentUser() user: Account) {
    return this.lineAuthService.generateAuthUrl(user.id);
  }

  /**
   * Unlink LINE account from current authenticated user
   * POST /auth/line/unlink
   */
  @Post('unlink')
  async unlinkLine(@CurrentUser() user: Account) {
    await this.db.unlinkLineAccount(user.id);
    return { ok: true };
  }

  /**
   * LINE OAuth2 Callback
   * GET /auth/line/callback
   */
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Public()
  @Get('callback')
  async lineCallback(
    @Query() query: LineCallbackQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.lineAuthService.handleCallback(
      query.code,
      query.state,
      query.error,
      query.error_description,
    );

    return res.redirect(result.redirectUrl);
  }

  /**
   * Check First-time Registration Ticket Status
   * GET /auth/line/registration-status
   */
  @Public()
  @Get('registration-status')
  getRegistrationStatus(@Query() query: LineRegistrationStatusQueryDto) {
    return this.lineAuthService.getRegistrationStatus(query.ticket);
  }

  /**
   * First-time Registration for Citizen with LINE & PDPA
   * POST /auth/line/register
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('register')
  async register(@Body() body: LineRegisterDto) {
    return this.lineAuthService.registerFirstTimeUser(body);
  }

  /**
   * LIFF Authentication & Token Verification
   * POST /auth/line/liff
   */
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Public()
  @Post('liff')
  async authenticateLiff(@Body() body: LineLiffAuthDto) {
    return this.lineAuthService.authenticateLiffUser(body.idToken);
  }

  /**
   * Get safe public LIFF configuration
   * GET /auth/line/liff/config
   */
  @Public()
  @Get('liff/config')
  getLiffConfig() {
    return this.lineAuthService.getLiffConfig();
  }

  /**
   * Get authenticated user profile via LIFF session
   * GET /auth/line/liff/profile
   */
  @Get('liff/profile')
  async getLiffProfile(@CurrentUser() user: Account) {
    const status = await this.lineAuthService.getStatus(user.id);
    return {
      account: this.db.toPublic(user),
      lineAccount: status.lineAccount,
    };
  }

  /**
   * Check LINE Account Linking Status
   * GET /auth/line/status
   */
  @Get('status')
  async getStatus(@CurrentUser() user: Account) {
    return this.lineAuthService.getStatus(user.id);
  }

  /**
   * Logout from LINE session
   * POST /auth/line/logout
   */
  @Post('logout')
  async logout(@Req() req: Request & { token?: string }) {
    if (req.token) {
      await this.db.revokeSession(req.token);
    }
    return { ok: true };
  }
}
