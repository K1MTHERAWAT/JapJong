import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  ActivityLog,
  Account,
  AnyRequest,
  AppNotification,
  BookingRequest,
  BorrowRequest,
  DEFAULT_PERMISSIONS,
  DocumentScanLog,
  DocumentVerification,
  Equipment,
  HandoverRecord,
  LineDeliveryStatus,
  LineFriendshipStatus,
  LineNotificationLog,
  LineWebhookEventRecord,
  NotificationCategory,
  NotificationChannel,
  OfficialFormPurposeItem,
  PermissionKey,
  PublicAccount,
  RepairRequest,
  Role,
  UserNotificationPreference,
  Venue,
  CreateSidebarServiceDto,
  ServiceRelationCheckResult,
  SidebarServiceItem,
  UpdateSidebarServiceDto,
  RoleItem,
  CreateRoleDto,
  UpdateRoleDto,
  BulkAssignRoleDto,
  DocumentTemplateCategory,
  DocumentTemplateStatus,
  DocumentTemplateItem,
  DocumentTemplateVersionItem,
  GeneratedDocumentItem,
} from '@japjong/shared';
import {
  mockAccounts,
  mockActivities,
  mockEquipment,
  mockNotifications,
  mockRequests,
  mockRoles,
  mockSidebarServices,
  mockVenues,
} from '../demo-data';
import { hashSecret } from '../auth/secret';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function resolveDatabaseUrl(): string | undefined {
  let url = process.env.DATABASE_URL?.trim();
  if (!url) return undefined;
  // แปลง Supabase Direct Host (db.<ref>.supabase.co ซึ่งเป็น IPv6-only)
  // ให้เป็น Supabase Session Pooler (IPv4) อัตโนมัติ เพื่อให้ Railway / Cloud ที่ไม่มี IPv6 เชื่อมต่อฐานข้อมูลจริงได้
  const m = /^(postgresql:\/\/)postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co:5432\/(.*)$/i.exec(url);
  if (m) {
    const [, proto, pass, projectRef, rest] = m;
    const region = process.env.SUPABASE_POOLER_REGION || 'ap-northeast-1';
    url = `${proto}postgres.${projectRef}:${pass}@aws-0-${region}.pooler.supabase.com:5432/${rest}`;
  }

  // ป้องกัน Prisma เปิด connection ค้างเกินขีดจำกัดของ Supabase Pooler (EMAXCONNSESSION pool_size: 15)
  if (!url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}connection_limit=5`;
  }
  return url;
}

/**
 * บริการฐานข้อมูล PostgreSQL ผ่าน Prisma ORM
 * - เมื่อเริ่มต้นระบบ (OnModuleInit) หากตารางยังว่างอยู่ จะ Seed ข้อมูลเริ่มต้นให้อัตโนมัติ
 * - โหลดข้อมูลเข้าหน่วยความจำเพื่อให้การอ่านรวดเร็ว และบันทึกทุกการเปลี่ยนแปลงลง PostgreSQL ทันที
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly prisma = new PrismaClient({
    datasources: resolveDatabaseUrl() ? { db: { url: resolveDatabaseUrl() } } : undefined,
  });

  accounts: Account[] = [];
  venues: Venue[] = [];
  equipment: Equipment[] = [];
  requests: AnyRequest[] = [];
  notifications: AppNotification[] = [];
  activities: ActivityLog[] = [];
  handovers: HandoverRecord[] = [];
  verifications: DocumentVerification[] = [];
  scanLogs: DocumentScanLog[] = [];
  signOtpCodes: {
    id: string;
    accountId: string;
    email: string;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
    consumedAt: Date | null;
    createdAt: Date;
  }[] = [];
  signVerifiedSessions: {
    id: string;
    accountId: string;
    sessionToken: string;
    verifiedAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }[] = [];
  userLineAccounts: {
    id: string;
    userId: string;
    lineUserId: string;
    displayName: string;
    pictureUrl: string | null;
    friendshipStatus: LineFriendshipStatus;
    statusUpdatedAt: Date | null;
    linkedAt: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  userConsents: {
    id: string;
    userId: string;
    consentType: string;
    consentVersion: string;
    consentStatus: 'GRANTED' | 'WITHDRAWN';
    consentedAt: Date;
    withdrawnAt: Date | null;
    createdAt: Date;
  }[] = [];
  userNotificationPreferences: UserNotificationPreference[] = [];
  lineNotificationLogs: (LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null })[] = [];
  lineWebhookEvents: LineWebhookEventRecord[] = [];
  sidebarServices: SidebarServiceItem[] = [];
  roles: RoleItem[] = [];
  documentTemplates: DocumentTemplateItem[] = [];
  documentTemplateVersions: DocumentTemplateVersionItem[] = [];
  generatedDocuments: GeneratedDocumentItem[] = [];



  private seq = { BK: 0, BR: 0, RP: 0, n: 0, l: 0, u: 100, v: 100, e: 100 };
  private resetCronTimer?: NodeJS.Timeout;
  private lastDemoResetDateUtc?: string;
  dbAvailable = false;
  lastDbError?: string;
  private memorySessions = new Map<string, { accountId: string; expiresAt: Date }>();
  private memoryOtps: {
    id: string;
    phone: string;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
    consumedAt: Date | null;
    createdAt: Date;
  }[] = [];

  async onModuleInit() {
    try {
      await this.prisma.$connect();
      this.dbAvailable = true;
      const initStatements = [
        `ALTER TABLE "accounts"
           ADD COLUMN IF NOT EXISTS "address_house_no" TEXT,
           ADD COLUMN IF NOT EXISTS "address_moo" TEXT,
           ADD COLUMN IF NOT EXISTS "address_subdistrict" TEXT,
           ADD COLUMN IF NOT EXISTS "address_district" TEXT,
           ADD COLUMN IF NOT EXISTS "address_province" TEXT,
           ADD COLUMN IF NOT EXISTS "address_subdistrict_id" TEXT,
           ADD COLUMN IF NOT EXISTS "address_district_id" TEXT,
           ADD COLUMN IF NOT EXISTS "address_province_id" TEXT,
           ADD COLUMN IF NOT EXISTS "email" TEXT,
           ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "venues"
           ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "equipments"
           ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "requests"
           ADD COLUMN IF NOT EXISTS "requester_phone" TEXT,
           ADD COLUMN IF NOT EXISTS "address_subdistrict_id" TEXT,
           ADD COLUMN IF NOT EXISTS "address_district_id" TEXT,
           ADD COLUMN IF NOT EXISTS "address_province_id" TEXT,
           ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ(3),
           ADD COLUMN IF NOT EXISTS "received_by_id" TEXT,
           ADD COLUMN IF NOT EXISTS "received_by_name" TEXT,
           ADD COLUMN IF NOT EXISTS "receive_photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
           ADD COLUMN IF NOT EXISTS "receive_note" TEXT,
           ADD COLUMN IF NOT EXISTS "return_submitted_at" TIMESTAMPTZ(3),
           ADD COLUMN IF NOT EXISTS "return_submitted_by_id" TEXT,
           ADD COLUMN IF NOT EXISTS "return_submitted_by_name" TEXT,
           ADD COLUMN IF NOT EXISTS "return_photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
           ADD COLUMN IF NOT EXISTS "return_note" TEXT,
           ADD COLUMN IF NOT EXISTS "inspected_at" TIMESTAMPTZ(3),
           ADD COLUMN IF NOT EXISTS "inspector_id" TEXT,
           ADD COLUMN IF NOT EXISTS "inspector_name" TEXT,
           ADD COLUMN IF NOT EXISTS "inspect_result" TEXT,
           ADD COLUMN IF NOT EXISTS "inspect_note" TEXT,
           ADD COLUMN IF NOT EXISTS "inspect_photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `CREATE TABLE IF NOT EXISTS "thai_provinces" (
           "id" TEXT PRIMARY KEY,
           "name_th" TEXT NOT NULL
         )`,
        `CREATE TABLE IF NOT EXISTS "thai_districts" (
           "id" TEXT PRIMARY KEY,
           "province_id" TEXT NOT NULL REFERENCES "thai_provinces"("id") ON DELETE CASCADE,
           "name_th" TEXT NOT NULL
         )`,
        `CREATE TABLE IF NOT EXISTS "thai_subdistricts" (
           "id" TEXT PRIMARY KEY,
           "district_id" TEXT NOT NULL REFERENCES "thai_districts"("id") ON DELETE CASCADE,
           "province_id" TEXT NOT NULL,
           "name_th" TEXT NOT NULL,
           "zip_code" TEXT NOT NULL DEFAULT ''
         )`,
        `CREATE INDEX IF NOT EXISTS "thai_districts_province_id_idx" ON "thai_districts"("province_id")`,
        `CREATE INDEX IF NOT EXISTS "thai_subdistricts_district_id_idx" ON "thai_subdistricts"("district_id")`,
        `DO $$ BEGIN
           CREATE TYPE "VerificationStatus" AS ENUM ('VALID', 'REVOKED', 'INVALID');
         EXCEPTION
           WHEN duplicate_object THEN null;
         END $$;`,
        `CREATE TABLE IF NOT EXISTS "document_verifications" (
           "id" TEXT PRIMARY KEY,
           "document_id" TEXT NOT NULL,
           "verification_token" TEXT NOT NULL UNIQUE,
           "document_number" TEXT NOT NULL,
           "document_hash" TEXT NOT NULL,
           "version" INTEGER NOT NULL DEFAULT 1,
           "status" "VerificationStatus" NOT NULL DEFAULT 'VALID',
           "document_type" TEXT NOT NULL,
           "title" TEXT NOT NULL DEFAULT '',
           "issuing_org" TEXT NOT NULL DEFAULT 'องค์การบริหารส่วนตำบล (อบต.)',
           "metadata" JSONB,
           "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "revoked_at" TIMESTAMPTZ(3),
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS "document_scan_logs" (
           "id" TEXT PRIMARY KEY,
           "verification_id" TEXT NOT NULL,
           "scanned_by" TEXT,
           "scanned_by_name" TEXT,
           "scanned_by_role" TEXT,
           "result" TEXT NOT NULL,
           "note" TEXT,
           "ip" TEXT,
           "user_agent" TEXT,
           "scanned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS "sign_otp_codes" (
           "id" TEXT PRIMARY KEY,
           "account_id" TEXT NOT NULL,
           "email" TEXT NOT NULL,
           "code_hash" TEXT NOT NULL,
           "attempts" INTEGER NOT NULL DEFAULT 0,
           "expires_at" TIMESTAMPTZ(3) NOT NULL,
           "consumed_at" TIMESTAMPTZ(3),
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS "sign_verified_sessions" (
           "id" TEXT PRIMARY KEY,
           "account_id" TEXT NOT NULL,
           "session_token" TEXT NOT NULL,
           "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "expires_at" TIMESTAMPTZ(3) NOT NULL,
           "revoked_at" TIMESTAMPTZ(3),
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE INDEX IF NOT EXISTS "document_verifications_document_id_idx" ON "document_verifications"("document_id")`,
        `CREATE INDEX IF NOT EXISTS "document_verifications_token_idx" ON "document_verifications"("verification_token")`,
        `CREATE INDEX IF NOT EXISTS "document_verifications_doc_no_idx" ON "document_verifications"("document_number")`,
        `CREATE INDEX IF NOT EXISTS "document_scan_logs_verification_id_idx" ON "document_scan_logs"("verification_id")`,
        `CREATE INDEX IF NOT EXISTS "document_scan_logs_scanned_at_idx" ON "document_scan_logs"("scanned_at")`,
        `CREATE INDEX IF NOT EXISTS "sign_otp_codes_account_email_idx" ON "sign_otp_codes"("account_id", "email")`,
        `CREATE INDEX IF NOT EXISTS "sign_verified_sessions_acc_token_idx" ON "sign_verified_sessions"("account_id", "session_token")`,
        `CREATE TABLE IF NOT EXISTS "sidebar_services" (
           "id" TEXT PRIMARY KEY,
           "slug" TEXT UNIQUE,
           "label" TEXT NOT NULL,
           "description" TEXT DEFAULT '',
           "icon" TEXT NOT NULL DEFAULT 'FolderTree',
           "href" TEXT NOT NULL UNIQUE,
           "category" TEXT NOT NULL DEFAULT 'บริการหลัก',
           "sort_order" INTEGER NOT NULL DEFAULT 0,
           "enabled" BOOLEAN NOT NULL DEFAULT true,
           "is_system" BOOLEAN NOT NULL DEFAULT false,
           "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
           "allowed_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
           "denied_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
           "permissions" JSONB NOT NULL DEFAULT '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"manage":false}'::jsonb,
           "exact" BOOLEAN NOT NULL DEFAULT false,
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE INDEX IF NOT EXISTS "sidebar_services_cat_order_idx" ON "sidebar_services"("category", "sort_order")`,
        `CREATE INDEX IF NOT EXISTS "sidebar_services_enabled_idx" ON "sidebar_services"("enabled")`,
        `CREATE TABLE IF NOT EXISTS "role_definitions" (
           "id" TEXT PRIMARY KEY,
           "key" TEXT NOT NULL UNIQUE,
           "name" TEXT NOT NULL,
           "description" TEXT DEFAULT '',
           "tone" TEXT NOT NULL DEFAULT 'gray',
           "enabled" BOOLEAN NOT NULL DEFAULT true,
           "is_system" BOOLEAN NOT NULL DEFAULT false,
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS "document_templates" (
           "id" TEXT PRIMARY KEY,
           "name" TEXT NOT NULL,
           "description" TEXT DEFAULT '',
           "category" TEXT NOT NULL DEFAULT 'venue',
           "status" TEXT NOT NULL DEFAULT 'draft',
           "current_version" INTEGER NOT NULL DEFAULT 1,
           "structure" JSONB NOT NULL DEFAULT '{}'::jsonb,
           "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
           "created_by" TEXT,
           "updated_by" TEXT,
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE INDEX IF NOT EXISTS "document_templates_cat_idx" ON "document_templates"("category")`,
        `CREATE INDEX IF NOT EXISTS "document_templates_status_idx" ON "document_templates"("status")`,
      ];
      for (const stmt of initStatements) {
        await this.prisma.$executeRawUnsafe(stmt).catch((err: any) => {
          this.logger.debug('Schema init notice: ' + (err?.message || err));
        });
      }
      await this.loadFromDatabase();
      if (process.env.ENABLE_NIGHTLY_DEMO_RESET === 'true') {
        const bkkNow = this.getBangkokTime();
        this.lastDemoResetDateUtc = new Date(bkkNow.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
        this.scheduleNightlyReset();
      }
      this.logger.log(
        `PostgreSQL connected: ${this.accounts.length} accounts, ${this.venues.length} venues, ${this.equipment.length} equipment, ${this.requests.length} requests`,
      );
    } catch (err: any) {
      this.dbAvailable = false;
      this.lastDbError = err?.message || String(err);
      this.logger.error('Failed to initialize PostgreSQL connection: ' + (err?.message || err), err?.stack);
      if (process.env.REQUIRE_DB === 'true') {
        this.logger.error('REQUIRE_DB=true is set; throwing initialization error', err);
        throw err;
      }
      this.logger.warn(
        'Failed to initialize PostgreSQL connection — falling back to in-memory cache',
      );
      await this.seedInMemoryFallback();
      if (process.env.ENABLE_NIGHTLY_DEMO_RESET === 'true') {
        const bkkNow = this.getBangkokTime();
        this.lastDemoResetDateUtc = new Date(bkkNow.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
        this.scheduleNightlyReset();
      }
      this.logger.log(
        `In-memory cache ready: ${this.accounts.length} accounts, ${this.venues.length} venues, ${this.equipment.length} equipment, ${this.requests.length} requests`,
      );
    }
  }

  async seedInMemoryFallback() {
    if (process.env.DEMO_MODE === 'false' && process.env.SEED_DEMO !== 'true') {
      await this.seedProductionAdmin();
      if (this.venues.length === 0) {
        this.venues = clone(mockVenues);
      }
      if (this.equipment.length === 0) {
        this.equipment = clone(mockEquipment);
      }
      if (this.sidebarServices.length === 0) {
        this.sidebarServices = clone(mockSidebarServices);
      }
      if (this.roles.length === 0) {
        this.roles = clone(mockRoles);
      }
      this.initDefaultDocumentTemplates();
      return;
    }
    const hashedAccounts: Account[] = [];
    for (const a of clone(mockAccounts)) {
      const hashedPassword = a.password.startsWith('$argon2') ? a.password : await hashSecret(a.password);
      const hashedPin = a.pin ? (a.pin.startsWith('$argon2') ? a.pin : await hashSecret(a.pin)) : null;
      hashedAccounts.push({ ...a, password: hashedPassword, pin: hashedPin });
    }
    this.accounts = hashedAccounts;
    this.venues = clone(mockVenues);
    this.equipment = clone(mockEquipment);
    this.requests = clone(mockRequests);
    this.notifications = clone(mockNotifications);
    this.activities = clone(mockActivities);
    this.sidebarServices = clone(mockSidebarServices);
    this.roles = clone(mockRoles);
    this.handovers = [];
    this.initDefaultDocumentTemplates();
    this.syncMemorySequences();
  }

  private syncMemorySequences() {
    for (const prefix of ['BK', 'BR', 'RP'] as const) {
      let maxVal = 0;
      for (const r of this.requests) {
        const m = new RegExp(`^${prefix}-\\d+-(\\d+)$`).exec(r.code);
        if (m) {
          const val = Number(m[1]);
          if (val > maxVal) maxVal = val;
        }
      }
      this.seq[prefix] = Math.max(this.seq[prefix], maxVal);
    }
  }

  getBangkokTime(date = new Date()): Date {
    return new Date(date.getTime() + 7 * 60 * 60 * 1000);
  }

  getBuddhistYear(date = new Date()): number {
    return this.getBangkokTime(date).getUTCFullYear() + 543;
  }

  scheduleNightlyReset() {
    const now = new Date();
    // 03:00 น. กรุงเทพฯ (UTC+7) ตรงกับ 20:00:00 UTC
    const nextResetUtc = new Date(now);
    nextResetUtc.setUTCHours(20, 0, 0, 0);
    if (nextResetUtc.getTime() <= now.getTime()) {
      nextResetUtc.setUTCDate(nextResetUtc.getUTCDate() + 1);
    }
    const msUntilReset = nextResetUtc.getTime() - now.getTime();
    this.logger.log(
      `DEMO_MODE: Nightly reset scheduled in ${(msUntilReset / (1000 * 60)).toFixed(0)} minutes (03:00 AM Bangkok Time / 20:00 UTC)`,
    );
    this.resetCronTimer = setTimeout(async () => {
      try {
        this.logger.log('DEMO_MODE: Running nightly automatic reset (03:00 AM Bangkok)...');
        await this.reset();
        const bkkNow = this.getBangkokTime();
        this.lastDemoResetDateUtc = new Date(bkkNow.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
        this.logger.log('DEMO_MODE: Nightly reset completed.');
      } catch (err) {
        this.logger.error('DEMO_MODE: Failed to run nightly reset', err);
      }
      this.scheduleNightlyReset();
    }, msUntilReset);
  }

  /** ตรวจสอบและรีเซ็ตกรณี instance ตื่นจากการหลับ (Serverless / Free tier) */
  async checkPendingDemoReset() {
    if (process.env.ENABLE_NIGHTLY_DEMO_RESET !== 'true') return;
    const bkkNow = this.getBangkokTime();
    const currentDemoDay = new Date(bkkNow.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (this.lastDemoResetDateUtc && this.lastDemoResetDateUtc < currentDemoDay) {
      this.logger.log(`DEMO_MODE: Woke up after reset deadline for ${currentDemoDay}. Triggering reset now...`);
      await this.reset();
      this.lastDemoResetDateUtc = currentDemoDay;
    }
  }

  async seedProductionAdmin() {
    const adminPassword = (process.env.ADMIN_INITIAL_PASSWORD || '').trim() || 'Admin@123456';
    if (!process.env.ADMIN_INITIAL_PASSWORD) {
      this.logger.warn('ADMIN_INITIAL_PASSWORD not set; defaulted initial admin password to Admin@123456. Please change it in /admin.');
    }
    const hashedPassword = await hashSecret(adminPassword);
    const adminAccount: Account = {
      id: 'ad-admin',
      username: 'admin',
      password: hashedPassword,
      name: 'ผู้ดูแลระบบ',
      nickname: 'แอดมิน',
      initial: 'อ',
      role: 'ADMIN',
      position: 'ผู้ดูแลระบบ',
      department: 'ฝ่ายเทคโนโลยีสารสนเทศ',
      phone: '085-000-0000',
      permissions: { ...DEFAULT_PERMISSIONS.ADMIN },
      signature: null,
      pin: null,
      isDemo: false,
      createdAt: new Date().toISOString(),
    };
    this.accounts.push(adminAccount);
    await this.persistAccount(adminAccount);
    if (this.venues.length === 0) {
      this.venues = clone(mockVenues);
    }
    if (this.equipment.length === 0) {
      this.equipment = clone(mockEquipment);
    }
    this.logger.log('Created initial admin account (username: admin) with password from ADMIN_INITIAL_PASSWORD');
  }

  async onModuleDestroy() {
    if (this.resetCronTimer) {
      clearTimeout(this.resetCronTimer);
    }
    if (this.dbAvailable) {
      await this.prisma.$disconnect().catch(() => {});
    }
  }

  // ===================== Session Management (PostgreSQL Backed) =====================

  async createSession(accountId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    this.memorySessions.set(token, { accountId, expiresAt });
    if (this.dbAvailable) {
      await this.prisma.session
        .create({
          data: {
            token,
            accountId,
            expiresAt,
          },
        })
        .catch((err) => this.logger.error('Failed to persist session', err));
    }
    return token;
  }

  async revokeSession(token: string): Promise<void> {
    this.memorySessions.delete(token);
    await this.revokeSignVerifiedSession(token);
    if (this.dbAvailable) {
      await this.prisma.session.delete({ where: { token } }).catch(() => {});
    }
  }

  async getSession(token: string): Promise<{ accountId: string; expiresAt: Date } | null> {
    if (!this.dbAvailable) {
      const mem = this.memorySessions.get(token);
      if (!mem) return null;
      if (mem.expiresAt.getTime() < Date.now()) {
        this.memorySessions.delete(token);
        return null;
      }
      return mem;
    }
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { token } }).catch(() => {});
      return null;
    }
    return session;
  }

  async cleanExpiredSessions(): Promise<void> {
    const now = Date.now();
    for (const [token, s] of this.memorySessions.entries()) {
      if (s.expiresAt.getTime() < now) this.memorySessions.delete(token);
    }
    if (this.dbAvailable) {
      await this.prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      }).catch(() => {});
    }
  }

  // ===================== Sequence Management (PostgreSQL Atomic) =====================

  async nextCode(prefix: 'BK' | 'BR' | 'RP'): Promise<string> {
    const buddhistYear = this.getBuddhistYear();
    if (!this.dbAvailable) {
      this.seq[prefix] += 1;
      return `${prefix}-${buddhistYear}-${String(this.seq[prefix]).padStart(4, '0')}`;
    }
    const key = `${prefix}-${buddhistYear}`;
    const seq = await this.prisma.sequence.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
    });
    this.seq[prefix] = seq.value;
    return `${prefix}-${buddhistYear}-${String(seq.value).padStart(4, '0')}`;
  }

  async nextId(kind: 'n' | 'l' | 'u' | 'v' | 'e'): Promise<string> {
    if (!this.dbAvailable) {
      this.seq[kind] += 1;
      return `${kind}-${this.seq[kind]}`;
    }
    const key = `id-${kind}`;
    const seq = await this.prisma.sequence.upsert({
      where: { key },
      create: { key, value: 101 },
      update: { value: { increment: 1 } },
    });
    return `${kind}-${seq.value}`;
  }

  async syncSequences() {
    if (!this.dbAvailable) {
      this.syncMemorySequences();
      return;
    }
    const buddhistYear = this.getBuddhistYear();
    const requests = await this.prisma.request.findMany({ select: { code: true } });
    for (const prefix of ['BK', 'BR', 'RP'] as const) {
      let maxVal = 0;
      for (const r of requests) {
        const m = new RegExp(`^${prefix}-${buddhistYear}-(\\d+)$`).exec(r.code);
        if (m) {
          const val = Number(m[1]);
          if (val > maxVal) maxVal = val;
        }
      }
      const key = `${prefix}-${buddhistYear}`;
      await this.prisma.sequence.upsert({
        where: { key },
        create: { key, value: maxVal },
        update: {},
      });
      const current = await this.prisma.sequence.findUnique({ where: { key } });
      if (current && current.value < maxVal) {
        await this.prisma.sequence.update({ where: { key }, data: { value: maxVal } });
      }
      this.seq[prefix] = Math.max(this.seq[prefix], maxVal);
    }
  }

  /** ล้างข้อมูลใน PostgreSQL และ Seed ข้อมูลตัวอย่างเริ่มต้นใหม่ทั้งหมด */
  async reset() {
    this.memorySessions.clear();
    if (!this.dbAvailable) {
      await this.seedInMemoryFallback();
      return;
    }
    this.accounts = clone(mockAccounts);
    this.venues = clone(mockVenues);
    this.equipment = clone(mockEquipment);
    this.requests = clone(mockRequests);
    this.notifications = clone(mockNotifications);
    this.activities = clone(mockActivities);
    this.handovers = [];
    await this.seedDatabase(true);
    await this.loadFromDatabase();
  }

  /** ล้างเฉพาะข้อมูลคำขอและประวัติ (requests, handovers, notifications, activities, sessions) */
  async clearTransactions() {
    this.memorySessions.clear();
    if (this.dbAvailable) {
      await this.prisma.$transaction([
        this.prisma.session.deleteMany(),
        this.prisma.handoverRecord.deleteMany(),
        this.prisma.signatureRecord.deleteMany(),
        this.prisma.requestItem.deleteMany(),
        this.prisma.requestPeriod.deleteMany(),
        this.prisma.requestVenue.deleteMany(),
        this.prisma.request.deleteMany(),
        this.prisma.notification.deleteMany(),
        this.prisma.activityLog.deleteMany(),
        this.prisma.sequence.deleteMany(),
      ]);
    }
    this.requests = [];
    this.notifications = [];
    this.activities = [];
    this.handovers = [];
    this.seq = { BK: 0, BR: 0, RP: 0, n: 0, l: 0, u: this.accounts.length, v: this.venues.length, e: this.equipment.length };
  }

  toPublic(a: Account): PublicAccount {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, pin, ...rest } = a;
    return { ...rest, hasPin: !!pin };
  }

  async notify(
    userId: string,
    title: string,
    body: string,
    link?: string,
    options?: {
      notificationType?: NotificationCategory | string;
      referenceType?: string | null;
      referenceId?: string | null;
    },
  ): Promise<AppNotification | null> {
    const notificationType = (options?.notificationType || 'SYSTEM') as NotificationCategory;
    const isEnabled = await this.isChannelEnabled(userId, 'IN_APP', notificationType);
    if (!isEnabled) {
      return null;
    }

    const id = await this.nextId('n');
    const nowIso = new Date().toISOString();
    const item: AppNotification = {
      id,
      userId,
      title,
      body,
      message: body,
      notificationType,
      referenceType: options?.referenceType ?? null,
      referenceId: options?.referenceId ?? null,
      link,
      at: nowIso,
      createdAt: nowIso,
      read: false,
      isRead: false,
      readAt: null,
    };
    this.notifications.unshift(item);
    if (!this.dbAvailable) return item;
    void this.prisma.notification
      .create({
        data: {
          id: item.id,
          userId: item.userId,
          title: item.title,
          body: item.body,
          read: item.read,
          link: item.link ?? null,
          createdAt: new Date(item.at),
        },
      })
      .then(() =>
        this.prisma.$executeRawUnsafe(
          `UPDATE "notifications" SET "notification_type" = $1, "reference_type" = $2, "reference_id" = $3 WHERE "id" = $4`,
          notificationType,
          item.referenceType ?? null,
          item.referenceId ?? null,
          item.id,
        ),
      )
      .catch((err: any) => this.logger.error('Failed to persist notification', err));
    return item;
  }

  notifyRole(
    role: Account['role'],
    title: string,
    body: string,
    link?: string,
    options?: {
      notificationType?: NotificationCategory | string;
      referenceType?: string | null;
      referenceId?: string | null;
    },
  ) {
    this.accounts
      .filter((a) => a.role === role && a.active !== false)
      .forEach((a) => void this.notify(a.id, title, body, link, options));
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<AppNotification | null> {
    const now = new Date();
    const nowIso = now.toISOString();
    const target = this.notifications.find((n) => n.id === notificationId && n.userId === userId);
    if (!target) return null;
    target.read = true;
    target.isRead = true;
    target.readAt = nowIso;
    if (this.dbAvailable) {
      await this.prisma
        .$executeRawUnsafe(
          `UPDATE "notifications" SET "read" = true, "read_at" = $1::timestamptz WHERE "id" = $2 AND "user_id" = $3`,
          now,
          notificationId,
          userId,
        )
        .catch((err: any) => this.logger.error('Failed to mark notification read', err));
    }
    return target;
  }

  markAllNotificationsRead(userId: string) {
    const now = new Date();
    const nowIso = now.toISOString();
    this.notifications
      .filter((n) => n.userId === userId)
      .forEach((n) => {
        n.read = true;
        n.isRead = true;
        if (!n.readAt) n.readAt = nowIso;
      });
    if (!this.dbAvailable) return;
    void this.prisma
      .$executeRawUnsafe(
        `UPDATE "notifications" SET "read" = true, "read_at" = COALESCE("read_at", $1::timestamptz) WHERE "user_id" = $2 AND "read" = false`,
        now,
        userId,
      )
      .catch((err: any) => this.logger.error('Failed to mark notifications read', err));
  }

  async log(
    kind: ActivityLog['kind'],
    title: string,
    detail: string,
    actor?: { id?: string; name?: string; role?: Role; ip?: string },
  ) {
    const id = await this.nextId('l');
    const entry: ActivityLog = {
      id,
      kind,
      title,
      detail,
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      ip: actor?.ip,
      at: new Date().toISOString(),
    };
    this.activities.unshift(entry);
    if (!this.dbAvailable) return;
    void this.prisma.activityLog
      .create({
        data: {
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          detail: entry.detail,
          actorId: entry.actorId ?? null,
          actorName: entry.actorName ?? null,
          actorRole: entry.actorRole ?? null,
          ip: entry.ip ?? null,
          createdAt: new Date(entry.at),
        },
      })
      .catch((err: any) => this.logger.error('Failed to persist activity log', err));
  }

  // ===================== Persistence Helpers =====================

  async persistAccount(a: Account) {
    if (!this.dbAvailable) return;
    try {
      const existingByUsername = await this.prisma.account.findUnique({
        where: { username: a.username },
        select: { id: true },
      });
      if (existingByUsername && existingByUsername.id !== a.id) {
        a.id = existingByUsername.id;
      }

      await this.prisma.account.upsert({
        where: { id: a.id },
        create: {
          id: a.id,
          username: a.username,
          password: a.password,
          name: a.name,
          nickname: a.nickname,
          initial: a.initial,
          role: a.role,
          position: a.position,
          department: a.department,
          phone: a.phone,
          lineName: a.lineName ?? null,
          permissions: a.permissions as any,
          signature: a.signature ?? null,
          pin: a.pin ?? null,
          isDemo: a.isDemo ?? false,
          active: a.active ?? true,
          createdAt: new Date(a.createdAt),
        },
        update: {
          username: a.username,
          password: a.password,
          name: a.name,
          nickname: a.nickname,
          initial: a.initial,
          role: a.role,
          position: a.position,
          department: a.department,
          phone: a.phone,
          lineName: a.lineName ?? null,
          permissions: a.permissions as any,
          signature: a.signature ?? null,
          pin: a.pin ?? null,
          isDemo: a.isDemo ?? false,
          active: a.active ?? true,
        },
      });
      await this.prisma.$executeRaw`
        UPDATE "accounts"
        SET "address_house_no" = ${a.addressHouseNo ?? null},
            "address_moo" = ${a.addressMoo ?? null},
            "address_subdistrict" = ${a.addressSubdistrict ?? null},
            "address_district" = ${a.addressDistrict ?? null},
            "address_province" = ${a.addressProvince ?? null},
            "address_subdistrict_id" = ${a.addressSubdistrictId ?? null},
            "address_district_id" = ${a.addressDistrictId ?? null},
            "address_province_id" = ${a.addressProvinceId ?? null},
            "email" = ${a.email ?? null},
            "email_verified" = ${a.emailVerified ?? false}
        WHERE "id" = ${a.id}
      `;
    } catch (err) {
      this.logger.error('Failed to persistAccount in DB', err);
    }
  }

  async persistVenue(v: Venue) {
    if (!this.dbAvailable) return;
    await this.prisma.venue.upsert({
      where: { id: v.id },
      create: {
        id: v.id,
        name: v.name,
        type: v.type,
        building: v.building,
        floor: v.floor,
        capacity: v.capacity,
        status: v.status,
        enabled: v.enabled,
        facilities: v.facilities,
        openTime: v.openTime,
        closeTime: v.closeTime,
        openDays: v.openDays,
        advanceDays: v.advanceDays,
        formName: v.formName,
        approvalLevels: v.approvalLevels,
      },
      update: {
        name: v.name,
        type: v.type,
        building: v.building,
        floor: v.floor,
        capacity: v.capacity,
        status: v.status,
        enabled: v.enabled,
        facilities: v.facilities,
        openTime: v.openTime,
        closeTime: v.closeTime,
        openDays: v.openDays,
        advanceDays: v.advanceDays,
        formName: v.formName,
        approvalLevels: v.approvalLevels,
      },
    });
    const imgs = Array.isArray(v.images) ? v.images.filter(Boolean).slice(0, 3) : [];
    await this.prisma.$executeRaw`
      UPDATE "venues" SET "images" = ${imgs}::text[] WHERE "id" = ${v.id}
    `.catch(() => {});
  }

  async deleteVenue(id: string) {
    this.venues = this.venues.filter((v) => v.id !== id);
    if (!this.dbAvailable) return;
    await this.prisma.$executeRaw`DELETE FROM "request_venues" WHERE "venueId" = ${id}`.catch(() => {});
    await this.prisma.venue.delete({ where: { id } }).catch(() => {});
  }

  async deleteEquipment(id: string) {
    this.equipment = this.equipment.filter((e) => e.id !== id);
    if (!this.dbAvailable) return;
    await this.prisma.$executeRaw`DELETE FROM "request_items" WHERE "itemId" = ${id}`.catch(() => {});
    await this.prisma.equipment.delete({ where: { id } }).catch(() => {});
  }

  async persistEquipment(e: Equipment) {
    if (!this.dbAvailable) return;
    await this.prisma.equipment.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        name: e.name,
        category: e.category,
        stock: e.stock,
        enabled: e.enabled,
      },
      update: {
        name: e.name,
        category: e.category,
        stock: e.stock,
        enabled: e.enabled,
      },
    });
    const imgs = Array.isArray(e.images) ? e.images.filter(Boolean).slice(0, 3) : [];
    await this.prisma.$executeRaw`
      UPDATE "equipments" SET "images" = ${imgs}::text[] WHERE "id" = ${e.id}
    `.catch(() => {});
  }

  async persistRequest(r: AnyRequest) {
    if (!this.dbAvailable) return;
    const parseDateSafe = (val?: string | Date | null): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
      const str = String(val).trim();
      if (!str) return null;
      const iso = str.includes('T') ? str : `${str}T00:00:00.000Z`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const commonData = {
      code: r.code,
      type: r.type,
      status: r.status,
      requesterId: r.requesterId,
      requesterName: r.requesterName,
      organization: r.organization,
      requesterSignature: r.requesterSignature ?? null,
      writtenAt: r.writtenAt ?? null,
      requesterPosition: r.requesterPosition ?? null,
      addressHouseNo: r.addressHouseNo ?? null,
      addressMoo: r.addressMoo ?? null,
      addressSubdistrict: r.addressSubdistrict ?? null,
      addressDistrict: r.addressDistrict ?? null,
      addressProvince: r.addressProvince ?? null,
      purposeItems: r.purposeItems ? (r.purposeItems as any) : null,
      purpose: r.type === 'booking' || r.type === 'borrow' ? r.purpose : null,
      activity: r.type === 'booking' ? r.activity : null,
      attendees: r.type === 'booking' ? r.attendees : null,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      pickupDate: r.type === 'borrow' ? parseDateSafe(r.pickupDate) : null,
      returnDate: r.type === 'borrow' ? parseDateSafe(r.returnDate) : null,
      returnRequestedAt: r.type === 'borrow' ? parseDateSafe(r.returnRequestedAt) : null,
      returnedAt: r.type === 'borrow' ? parseDateSafe(r.returnedAt) : null,
      repairBuilding: r.type === 'repair' ? r.building : null,
      repairFloor: r.type === 'repair' ? r.floor : null,
      repairLocation: r.type === 'repair' ? r.location : null,
      repairCategory: r.type === 'repair' ? r.category : null,
      repairDetail: r.type === 'repair' ? r.detail : null,
      repairPhotos: r.type === 'repair' ? r.photos : null,
      repairResolution: r.type === 'repair' ? r.resolution ?? null : null,
      repairStaffSignature: r.type === 'repair' ? r.staffSignature ?? null : null,
      repairStaffSignerName: r.type === 'repair' ? r.staffSignerName ?? null : null,
      repairAcceptSignature: r.type === 'repair' ? r.acceptanceSignature ?? null : null,
      repairAcceptedAt: r.type === 'repair' ? parseDateSafe(r.acceptedAt) : null,
      repairStartedAt: r.type === 'repair' ? parseDateSafe(r.startedAt) : null,
      repairFinishedAt: r.type === 'repair' ? parseDateSafe(r.finishedAt) : null,
      repairAcceptedByReqAt: r.type === 'repair' ? parseDateSafe(r.acceptedByRequesterAt) : null,
      createdByStaffId: r.createdByStaffId ?? null,
      createdByStaffSignature: r.createdByStaffSignature ?? null,
      rejectReason: r.rejectReason ?? null,
      approvalRound: r.approvalRound ?? 1,
      createdAt: parseDateSafe(r.createdAt) || new Date(),
      updatedAt: parseDateSafe(r.updatedAt) || new Date(),
    };

    await this.prisma.$transaction(async (tx: any) => {
      // 1. ตรวจสอบว่า requesterId มีอยู่ในฐานข้อมูล Account หรือไม่ (ป้องกัน FK violation เช่น walk-in citizens)
      if (r.requesterId) {
        const accExists = await tx.account.findUnique({
          where: { id: r.requesterId },
          select: { id: true },
        });
        if (!accExists) {
          const fallbackUser = this.accounts.find((a) => a.id === r.requesterId);
          await tx.account.create({
            data: {
              id: r.requesterId,
              username: fallbackUser?.username || `walkin_${r.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              password: fallbackUser?.password || '-',
              name: fallbackUser?.name || r.requesterName || 'ผู้มาติดต่อหน้าเคาน์เตอร์',
              nickname: fallbackUser?.nickname || null,
              initial: (fallbackUser?.name || r.requesterName || 'W').trim().slice(0, 2).toUpperCase(),
              role: fallbackUser?.role || 'CITIZEN',
              position: fallbackUser?.position || r.requesterPosition || 'ประชาชน/ผู้มาติดต่อ',
              department: fallbackUser?.department || r.organization || 'ประชาชนทั่วไป',
              phone: fallbackUser?.phone || r.requesterPhone || '-',
              lineName: fallbackUser?.lineName || null,
              permissions: (fallbackUser?.permissions as any) || {},
              signature: fallbackUser?.signature || r.requesterSignature || null,
              pin: fallbackUser?.pin || null,
              isDemo: fallbackUser?.isDemo ?? false,
              active: fallbackUser?.active ?? true,
              createdAt: fallbackUser?.createdAt ? new Date(fallbackUser.createdAt) : new Date(r.createdAt),
            },
          });
        }
      }

      await tx.request.upsert({
        where: { id: r.id },
        create: { id: r.id, ...commonData },
        update: commonData,
      });

      if (r.type === 'booking') {
        await tx.requestVenue.deleteMany({ where: { requestId: r.id } });
        if (r.venueIds.length > 0) {
          await tx.requestVenue.createMany({
            data: r.venueIds.map((venueId: any) => ({ requestId: r.id, venueId })),
            skipDuplicates: true,
          });
        }

        await tx.requestPeriod.deleteMany({ where: { requestId: r.id } });
        const periodRows: any[] = r.periods.map((p: any, idx: number) => ({
          requestId: r.id,
          kind: 'current',
          sortOrder: idx,
          startTime: new Date(p.start),
          endTime: new Date(p.end),
        }));
        if (r.rescheduleTo?.length) {
          r.rescheduleTo.forEach((p, idx) => {
            periodRows.push({
              requestId: r.id,
              kind: 'reschedule',
              sortOrder: idx,
              startTime: new Date(p.start),
              endTime: new Date(p.end),
            });
          });
        }
        if (periodRows.length > 0) {
          await tx.requestPeriod.createMany({ data: periodRows });
        }
      }

      if (r.type === 'booking' || r.type === 'borrow') {
        await tx.requestItem.deleteMany({ where: { requestId: r.id } });
        const itemList = r.type === 'booking' ? r.extraItems : r.items;
        if (itemList && itemList.length > 0) {
          // ตรวจสอบความถูกต้องของ equipmentId ในฐานข้อมูล ป้องกัน FK violation
          for (const it of itemList) {
            const eqExists = await tx.equipment.findUnique({
              where: { id: it.equipmentId },
              select: { id: true },
            });
            if (!eqExists) {
              const memEq = this.equipment.find((e) => e.id === it.equipmentId);
              if (memEq) {
                await tx.equipment.create({
                  data: {
                    id: memEq.id,
                    name: memEq.name,
                    category: memEq.category,
                    stock: memEq.stock,
                    enabled: memEq.enabled,
                  },
                });
              }
            }
          }
          await tx.requestItem.createMany({
            data: itemList.map((it) => ({
              requestId: r.id,
              equipmentId: it.equipmentId,
              qty: it.qty,
            })),
          });
        }

        // รักษาร่องรอยและหลักฐานการลงนาม (Audit Trail) โดยไม่อนุญาตให้ deleteMany ทิ้ง
        if (r.signatures.length > 0) {
          const currentRound = r.approvalRound ?? 1;
          for (const s of r.signatures) {
            const sigRound = s.round ?? currentRound;
            await tx.signatureRecord.upsert({
              where: {
                requestId_level_round: {
                  requestId: r.id,
                  level: s.level,
                  round: sigRound,
                },
              },
              create: {
                requestId: r.id,
                level: s.level,
                round: sigRound,
                signerId: s.signerId,
                signerName: s.signerName,
                title: s.title,
                decision: s.decision,
                signature: s.signature ?? null,
                note: s.note ?? null,
                signedAt: new Date(s.at),
              },
              update: {
                signerId: s.signerId,
                signerName: s.signerName,
                title: s.title,
                decision: s.decision,
                signature: s.signature ?? null,
                note: s.note ?? null,
                signedAt: new Date(s.at),
              },
            });
          }
        }
      }
    });

    const receivedAtDate = r.type === 'borrow' ? parseDateSafe(r.receivedAt) : null;
    const receivedById = r.type === 'borrow' ? (r.receivedById ?? null) : null;
    const receivedByName = r.type === 'borrow' ? (r.receivedByName ?? null) : null;
    const receivePhotos = r.type === 'borrow' && Array.isArray(r.receivePhotos) ? r.receivePhotos.filter(Boolean) : [];
    const receiveNote = r.type === 'borrow' ? (r.receiveNote ?? null) : null;
    const returnSubmittedAtDate = r.type === 'borrow' ? parseDateSafe(r.returnSubmittedAt) : null;
    const returnSubmittedById = r.type === 'borrow' ? (r.returnSubmittedById ?? null) : null;
    const returnSubmittedByName = r.type === 'borrow' ? (r.returnSubmittedByName ?? null) : null;
    const returnPhotos = r.type === 'borrow' && Array.isArray(r.returnPhotos) ? r.returnPhotos.filter(Boolean) : [];
    const returnNote = r.type === 'borrow' ? (r.returnNote ?? null) : null;
    const inspectedAtDate = r.type === 'borrow' ? parseDateSafe(r.inspectedAt) : null;
    const inspectorId = r.type === 'borrow' ? (r.inspectorId ?? null) : null;
    const inspectorName = r.type === 'borrow' ? (r.inspectorName ?? null) : null;
    const inspectResult = r.type === 'borrow' ? (r.inspectResult ?? null) : null;
    const inspectNote = r.type === 'borrow' ? (r.inspectNote ?? null) : null;
    const inspectPhotos = r.type === 'borrow' && Array.isArray(r.inspectPhotos) ? r.inspectPhotos.filter(Boolean) : [];

    await this.prisma.$executeRaw`
      UPDATE "requests"
      SET "requester_phone" = ${r.requesterPhone ?? null},
          "address_subdistrict_id" = ${r.addressSubdistrictId ?? null},
          "address_district_id" = ${r.addressDistrictId ?? null},
          "address_province_id" = ${r.addressProvinceId ?? null},
          "received_at" = ${receivedAtDate},
          "received_by_id" = ${receivedById},
          "received_by_name" = ${receivedByName},
          "receive_photos" = ${receivePhotos}::text[],
          "receive_note" = ${receiveNote},
          "return_submitted_at" = ${returnSubmittedAtDate},
          "return_submitted_by_id" = ${returnSubmittedById},
          "return_submitted_by_name" = ${returnSubmittedByName},
          "return_photos" = ${returnPhotos}::text[],
          "return_note" = ${returnNote},
          "inspected_at" = ${inspectedAtDate},
          "inspector_id" = ${inspectorId},
          "inspector_name" = ${inspectorName},
          "inspect_result" = ${inspectResult},
          "inspect_note" = ${inspectNote},
          "inspect_photos" = ${inspectPhotos}::text[]
      WHERE "id" = ${r.id}
    `.catch((err) => this.logger.warn('Failed to persist extra request columns', err));
  }

  async persistHandover(h: HandoverRecord) {
    if (!this.dbAvailable) return;
    await this.prisma.handoverRecord.upsert({
      where: {
        requestId_phase: {
          requestId: h.requestId,
          phase: h.phase,
        },
      },
      create: {
        requestId: h.requestId,
        phase: h.phase,
        checklist: h.items as any,
        note: h.note,
        staffId: h.staffId,
        staffName: h.staffName ?? null,
        citizenSignature: h.citizenSignature ?? null,
        staffSignature: h.staffSignature ?? null,
        createdAt: new Date(h.at),
      },
      update: {
        checklist: h.items as any,
        note: h.note,
        staffId: h.staffId,
        staffName: h.staffName ?? null,
        citizenSignature: h.citizenSignature ?? null,
        staffSignature: h.staffSignature ?? null,
        createdAt: new Date(h.at),
      },
    });
  }

  async persistVerification(v: DocumentVerification) {
    const existingIdx = this.verifications.findIndex((x) => x.id === v.id);
    if (existingIdx >= 0) {
      this.verifications[existingIdx] = v;
    } else {
      this.verifications.unshift(v);
    }
    if (!this.dbAvailable) return;
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "document_verifications" ("id", "document_id", "verification_token", "document_number", "document_hash", "version", "status", "document_type", "title", "issuing_org", "metadata", "issued_at", "revoked_at", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7::"VerificationStatus", $8, $9, $10, $11::jsonb, $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::timestamptz)
         ON CONFLICT ("id") DO UPDATE SET
           "status" = EXCLUDED."status",
           "version" = EXCLUDED."version",
           "document_hash" = EXCLUDED."document_hash",
           "revoked_at" = EXCLUDED."revoked_at",
           "metadata" = EXCLUDED."metadata",
           "updated_at" = EXCLUDED."updated_at"`,
        v.id,
        v.documentId,
        v.verificationToken,
        v.documentNumber,
        v.documentHash,
        v.version,
        v.status,
        v.documentType,
        v.title,
        v.issuingOrg,
        v.metadata ? JSON.stringify(v.metadata) : null,
        v.issuedAt,
        v.revokedAt ?? null,
        v.createdAt,
        v.updatedAt,
      );
    } catch (err) {
      this.logger.error('Failed to persist verification', err);
    }
  }

  async persistScanLog(l: DocumentScanLog) {
    this.scanLogs.unshift(l);
    if (!this.dbAvailable) return;
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "document_scan_logs" ("id", "verification_id", "scanned_by", "scanned_by_name", "scanned_by_role", "result", "note", "ip", "user_agent", "scanned_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
         ON CONFLICT ("id") DO NOTHING`,
        l.id,
        l.verificationId,
        l.scannedBy ?? null,
        l.scannedByName ?? null,
        l.scannedByRole ?? null,
        l.result,
        l.note ?? null,
        l.ip ?? null,
        l.userAgent ?? null,
        l.scannedAt,
      );
    } catch (err) {
      this.logger.error('Failed to persist scan log', err);
    }
  }

  // ===================== Email OTP for Signing (Resend) =====================

  async createSignOtp(accountId: string, email: string, codeHash: string, expiresAt: Date) {
    const id = `sotp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      accountId,
      email,
      codeHash,
      attempts: 0,
      expiresAt,
      consumedAt: null as Date | null,
      createdAt: new Date(),
    };
    this.signOtpCodes.push(record);
    if (this.dbAvailable) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "sign_otp_codes" ("id", "account_id", "email", "code_hash", "attempts", "expires_at", "consumed_at", "created_at")
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8::timestamptz)
         ON CONFLICT ("id") DO NOTHING`,
        record.id,
        record.accountId,
        record.email,
        record.codeHash,
        record.attempts,
        record.expiresAt,
        record.consumedAt,
        record.createdAt,
      ).catch((err: any) => this.logger.error('Failed to persist sign OTP code', err));
    }
    return record;
  }

  async getLatestSignOtp(accountId: string) {
    const mem = [...this.signOtpCodes]
      .filter((o) => o.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!this.dbAvailable) return mem ?? null;

    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT "id", "account_id", "email", "code_hash", "attempts", "expires_at", "consumed_at", "created_at"
         FROM "sign_otp_codes"
         WHERE "account_id" = $1
         ORDER BY "created_at" DESC
         LIMIT 1`,
        accountId,
      )) as {
        id: string;
        account_id: string;
        email: string;
        code_hash: string;
        attempts: number;
        expires_at: Date;
        consumed_at: Date | null;
        created_at: Date;
      }[];
      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          accountId: r.account_id,
          email: r.email,
          codeHash: r.code_hash,
          attempts: r.attempts,
          expiresAt: new Date(r.expires_at),
          consumedAt: r.consumed_at ? new Date(r.consumed_at) : null,
          createdAt: new Date(r.created_at),
        };
      }
    } catch (err) {
      this.logger.error('Failed to query latest sign OTP', err);
    }
    return mem ?? null;
  }

  async recordSignOtpAttempt(id: string, attempts: number) {
    const item = this.signOtpCodes.find((o) => o.id === id);
    if (item) item.attempts = attempts;
    if (this.dbAvailable) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "sign_otp_codes" SET "attempts" = $1 WHERE "id" = $2`,
        attempts,
        id,
      ).catch((err: any) => this.logger.error('Failed to update sign OTP attempts', err));
    }
  }

  async consumeSignOtp(id: string) {
    const now = new Date();
    const item = this.signOtpCodes.find((o) => o.id === id);
    if (item) item.consumedAt = now;
    if (this.dbAvailable) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "sign_otp_codes" SET "consumed_at" = $1::timestamptz WHERE "id" = $2`,
        now,
        id,
      ).catch((err: any) => this.logger.error('Failed to consume sign OTP', err));
    }
  }

  async createSignVerifiedSession(accountId: string, sessionToken: string, expiresAt: Date) {
    const id = `svs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    await this.revokeSignVerifiedSession(sessionToken);

    const record = {
      id,
      accountId,
      sessionToken,
      verifiedAt: now,
      expiresAt,
      revokedAt: null as Date | null,
      createdAt: now,
    };
    this.signVerifiedSessions.push(record);
    if (this.dbAvailable) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "sign_verified_sessions" ("id", "account_id", "session_token", "verified_at", "expires_at", "revoked_at", "created_at")
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::timestamptz)
         ON CONFLICT ("id") DO NOTHING`,
        record.id,
        record.accountId,
        record.sessionToken,
        record.verifiedAt,
        record.expiresAt,
        record.revokedAt,
        record.createdAt,
      ).catch((err: any) => this.logger.error('Failed to persist sign verified session', err));
    }
    return record;
  }

  async getSignVerifiedSession(accountId: string, sessionToken: string) {
    const now = new Date();
    if (!this.dbAvailable) {
      const active = this.signVerifiedSessions.find(
        (s) =>
          s.accountId === accountId &&
          s.sessionToken === sessionToken &&
          !s.revokedAt &&
          s.expiresAt > now,
      );
      return active ?? null;
    }
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT "id", "account_id", "session_token", "verified_at", "expires_at", "revoked_at", "created_at"
         FROM "sign_verified_sessions"
         WHERE "account_id" = $1 AND "session_token" = $2 AND "revoked_at" IS NULL AND "expires_at" > $3::timestamptz
         ORDER BY "created_at" DESC
         LIMIT 1`,
        accountId,
        sessionToken,
        now,
      )) as {
        id: string;
        account_id: string;
        session_token: string;
        verified_at: Date;
        expires_at: Date;
        revoked_at: Date | null;
        created_at: Date;
      }[];
      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          accountId: r.account_id,
          sessionToken: r.session_token,
          verifiedAt: new Date(r.verified_at),
          expiresAt: new Date(r.expires_at),
          revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
          createdAt: new Date(r.created_at),
        };
      }
    } catch (err) {
      this.logger.error('Failed to query sign verified session', err);
    }
    const mem = this.signVerifiedSessions.find(
      (s) =>
        s.accountId === accountId &&
        s.sessionToken === sessionToken &&
        !s.revokedAt &&
        s.expiresAt > now,
    );
    return mem ?? null;
  }

  async revokeSignVerifiedSession(sessionToken: string) {
    const now = new Date();
    for (const s of this.signVerifiedSessions) {
      if (s.sessionToken === sessionToken && !s.revokedAt) {
        s.revokedAt = now;
      }
    }
    if (this.dbAvailable) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "sign_verified_sessions" SET "revoked_at" = $1::timestamptz WHERE "session_token" = $2 AND "revoked_at" IS NULL`,
        now,
        sessionToken,
      ).catch(() => {});
    }
  }

  async revokeSignVerifiedSessionByAccount(accountId: string) {
    const now = new Date();
    for (const s of this.signVerifiedSessions) {
      if (s.accountId === accountId && !s.revokedAt) {
        s.revokedAt = now;
      }
    }
    if (this.dbAvailable) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "sign_verified_sessions" SET "revoked_at" = $1::timestamptz WHERE "account_id" = $2 AND "revoked_at" IS NULL`,
        now,
        accountId,
      ).catch(() => {});
    }
  }

  // ===================== LINE Account Management =====================

  async findUserByLineUserId(lineUserId: string): Promise<Account | null> {
    const trimmed = String(lineUserId || '').trim();
    if (!trimmed) return null;

    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT "user_id" FROM "user_line_accounts" WHERE "line_user_id" = $1 AND "is_active" = true LIMIT 1`,
          trimmed,
        )) as any[];
        if (rows && rows.length > 0) {
          const user = this.accounts.find((a) => a.id === rows[0].user_id && a.active !== false);
          if (user) return user;
        }
      } catch {
        // Fallback to in-memory check
      }
    }

    const inMem = this.userLineAccounts.find((l) => l.lineUserId === trimmed && l.isActive);
    if (inMem) {
      const user = this.accounts.find((a) => a.id === inMem.userId && a.active !== false);
      if (user) return user;
    }

    // Legacy check: Account.lineUserId
    const legacy = this.accounts.find((a) => a.lineUserId === trimmed && a.active !== false);
    return legacy ?? null;
  }

  async getLineAccount(userId: string): Promise<{
    id: string;
    userId: string;
    lineUserId: string;
    displayName: string;
    pictureUrl: string | null;
    friendshipStatus: LineFriendshipStatus;
    statusUpdatedAt: Date | null;
    linkedAt: Date;
    isActive: boolean;
  } | null> {
    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT "id", "user_id", "line_user_id", "display_name", "picture_url", "friendship_status", "status_updated_at", "linked_at", "is_active"
           FROM "user_line_accounts" WHERE "user_id" = $1 AND "is_active" = true LIMIT 1`,
          userId,
        )) as any[];
        if (rows && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            userId: r.user_id,
            lineUserId: r.line_user_id,
            displayName: r.display_name,
            pictureUrl: r.picture_url,
            friendshipStatus: (r.friendship_status || 'UNKNOWN') as LineFriendshipStatus,
            statusUpdatedAt: r.status_updated_at ? new Date(r.status_updated_at) : null,
            linkedAt: new Date(r.linked_at),
            isActive: Boolean(r.is_active),
          };
        }
      } catch {
        // Fallback
      }
    }

    const inMem = this.userLineAccounts.find((l) => l.userId === userId && l.isActive);
    if (inMem) return inMem;

    // Check account lineUserId
    const acc = this.accounts.find((a) => a.id === userId);
    if (acc?.lineUserId) {
      return {
        id: `legacy-${acc.id}`,
        userId: acc.id,
        lineUserId: acc.lineUserId,
        displayName: acc.lineName || acc.name,
        pictureUrl: null,
        friendshipStatus: 'UNKNOWN',
        statusUpdatedAt: null,
        linkedAt: new Date(),
        isActive: true,
      };
    }

    return null;
  }

  async linkLineAccount(
    userId: string,
    data: {
      lineUserId: string;
      displayName: string;
      pictureUrl?: string | null;
      friendshipStatus?: LineFriendshipStatus;
    },
  ): Promise<{
    id: string;
    userId: string;
    lineUserId: string;
    displayName: string;
    pictureUrl: string | null;
    friendshipStatus: LineFriendshipStatus;
    statusUpdatedAt: Date | null;
    linkedAt: Date;
    isActive: boolean;
  }> {
    const now = new Date();
    const existing = this.userLineAccounts.find((l) => l.userId === userId || l.lineUserId === data.lineUserId);
    const id = existing?.id || `line-${randomBytes(8).toString('hex')}`;
    const friendshipStatus: LineFriendshipStatus =
      data.friendshipStatus || existing?.friendshipStatus || 'UNKNOWN';
    const record = {
      id,
      userId,
      lineUserId: data.lineUserId,
      displayName: data.displayName,
      pictureUrl: data.pictureUrl ?? null,
      friendshipStatus,
      statusUpdatedAt: existing?.statusUpdatedAt ?? null,
      linkedAt: now,
      isActive: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.userLineAccounts = this.userLineAccounts.filter(
      (l) => l.userId !== userId && l.lineUserId !== data.lineUserId,
    );
    this.userLineAccounts.push(record);

    for (const acc of this.accounts) {
      if (acc.lineUserId === data.lineUserId && acc.id !== userId) {
        acc.lineUserId = undefined;
        acc.lineName = undefined;
      }
    }
    const user = this.accounts.find((a) => a.id === userId);
    if (user) {
      user.lineUserId = data.lineUserId;
      user.lineName = data.displayName;
    }

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM "user_line_accounts" WHERE "line_user_id" = $1 AND "user_id" <> $2`,
          data.lineUserId,
          userId,
        ).catch(() => {});
        await this.prisma.$executeRawUnsafe(
          `UPDATE "accounts" SET "line_user_id" = NULL, "line_name" = NULL WHERE "line_user_id" = $1 AND "id" <> $2`,
          data.lineUserId,
          userId,
        ).catch(() => {});
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "user_line_accounts" ("id", "user_id", "line_user_id", "display_name", "picture_url", "linked_at", "is_active", "created_at", "updated_at")
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, true, $7::timestamptz, $8::timestamptz)
           ON CONFLICT ("user_id") DO UPDATE
           SET "line_user_id" = EXCLUDED."line_user_id",
               "display_name" = EXCLUDED."display_name",
               "picture_url" = EXCLUDED."picture_url",
               "linked_at" = EXCLUDED."linked_at",
               "is_active" = true,
               "updated_at" = EXCLUDED."updated_at"`,
          id,
          userId,
          data.lineUserId,
          data.displayName,
          data.pictureUrl ?? null,
          now,
          now,
          now,
        );
        await this.prisma.$executeRawUnsafe(
          `UPDATE "accounts" SET "line_user_id" = $1, "line_name" = $2 WHERE "id" = $3`,
          data.lineUserId,
          data.displayName,
          userId,
        ).catch(() => {});
      } catch (err) {
        this.logger.error('Failed to persist LINE account link', err);
      }
    }

    return record;
  }

  async unlinkLineAccount(userId: string): Promise<void> {
    this.userLineAccounts = this.userLineAccounts.filter((l) => l.userId !== userId);
    const user = this.accounts.find((a) => a.id === userId);
    if (user) {
      user.lineUserId = undefined;
      user.lineName = undefined;
    }
    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM "user_line_accounts" WHERE "user_id" = $1`,
          userId,
        );
        await this.prisma.$executeRawUnsafe(
          `UPDATE "accounts" SET "line_user_id" = NULL, "line_name" = NULL WHERE "id" = $1`,
          userId,
        ).catch(() => {});
      } catch {
        // Ignored
      }
    }
  }

  // ===================== PDPA Consent Management =====================

  async saveUserConsents(
    userId: string,
    consents: { consentType: string; consentVersion: string; agreed: boolean }[],
  ): Promise<void> {
    const now = new Date();
    for (const c of consents) {
      const status = c.agreed ? 'GRANTED' : 'WITHDRAWN';
      const id = `cst-${randomBytes(8).toString('hex')}`;
      const record = {
        id,
        userId,
        consentType: c.consentType,
        consentVersion: c.consentVersion,
        consentStatus: status as 'GRANTED' | 'WITHDRAWN',
        consentedAt: now,
        withdrawnAt: c.agreed ? null : now,
        createdAt: now,
      };
      this.userConsents.push(record);

      if (this.dbAvailable) {
        try {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO "user_consents" ("id", "user_id", "consent_type", "consent_version", "consent_status", "consented_at", "withdrawn_at", "created_at")
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz)`,
            id,
            userId,
            c.consentType,
            c.consentVersion,
            status,
            now,
            c.agreed ? null : now,
            now,
          );
        } catch {
          // Handled
        }
      }
    }
  }

  async getUserConsents(userId: string) {
    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT "id", "user_id", "consent_type", "consent_version", "consent_status", "consented_at", "withdrawn_at", "created_at"
           FROM "user_consents" WHERE "user_id" = $1 ORDER BY "consented_at" DESC`,
          userId,
        )) as any[];
        if (rows && rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            consentType: r.consent_type,
            consentVersion: r.consent_version,
            consentStatus: r.consent_status,
            consentedAt: new Date(r.consented_at).toISOString(),
            withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at).toISOString() : null,
            createdAt: new Date(r.created_at).toISOString(),
          }));
        }
      } catch {
        // Fallback
      }
    }

    return this.userConsents
      .filter((c) => c.userId === userId)
      .map((c) => ({
        id: c.id,
        userId: c.userId,
        consentType: c.consentType,
        consentVersion: c.consentVersion,
        consentStatus: c.consentStatus,
        consentedAt: c.consentedAt.toISOString(),
        withdrawnAt: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
      }));
  }

  async withdrawConsent(userId: string, consentType: string): Promise<boolean> {
    const now = new Date();
    let updated = false;
    for (const c of this.userConsents) {
      if (c.userId === userId && c.consentType === consentType && c.consentStatus === 'GRANTED') {
        c.consentStatus = 'WITHDRAWN';
        c.withdrawnAt = now;
        updated = true;
      }
    }

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "user_consents" SET "consent_status" = 'WITHDRAWN', "withdrawn_at" = $1::timestamptz
           WHERE "user_id" = $2 AND "consent_type" = $3 AND "consent_status" = 'GRANTED'`,
          now,
          userId,
          consentType,
        );
        updated = true;
      } catch {
        // Fallback
      }
    }
    return updated;
  }

  async createLineCitizenAccount(data: {
    name: string;
    phone: string;
    lineUserId: string;
    displayName: string;
    pictureUrl?: string | null;
    consents: { consentType: string; consentVersion: string; agreed: boolean }[];
  }): Promise<Account> {
    const now = new Date();
    const id = await this.nextId('u');
    const cleanPhone = data.phone.trim();
    const username = `line_${data.lineUserId.slice(-8)}_${cleanPhone.slice(-4)}`;
    const nickname = data.displayName.slice(0, 8);
    const initial = data.name.trim().charAt(0) || 'ป';
    const pwdHash = await hashSecret(randomBytes(16).toString('hex'));

    const newAccount: Account = {
      id,
      username,
      password: pwdHash,
      name: data.name.trim(),
      nickname,
      initial,
      role: 'USER',
      position: 'ประชาชน',
      department: 'ประชาชนทั่วไป',
      phone: cleanPhone,
      lineName: data.displayName,
      lineUserId: data.lineUserId,
      permissions: { ...DEFAULT_PERMISSIONS['USER'] },
      signature: null,
      pin: null,
      isDemo: false,
      active: true,
      accountStatus: 'ACTIVE',
      registrationCompletedAt: now.toISOString(),
      createdAt: now.toISOString(),
    };

    this.accounts.push(newAccount);

    if (this.dbAvailable) {
      try {
        await this.prisma.account.create({
          data: {
            id,
            username,
            password: pwdHash,
            name: newAccount.name,
            nickname,
            initial,
            role: 'USER',
            position: 'ประชาชน',
            department: 'ประชาชนทั่วไป',
            phone: cleanPhone,
            lineName: data.displayName,
            lineUserId: data.lineUserId,
            permissions: newAccount.permissions as any,
            signature: null,
            pin: null,
            isDemo: false,
            active: true,
            createdAt: now,
          },
        });

        await this.prisma.$executeRawUnsafe(
          `UPDATE "accounts" SET "registration_completed_at" = $1::timestamptz, "account_status" = 'ACTIVE' WHERE "id" = $2`,
          now,
          id,
        ).catch(() => {});
      } catch (err) {
        this.logger.error('Failed to create account in database:', err);
      }
    }

    // ต้องเชื่อม LINE และบันทึก Consent หลังสร้างแถว accounts แล้ว (Foreign Key)
    await this.linkLineAccount(id, {
      lineUserId: data.lineUserId,
      displayName: data.displayName,
      pictureUrl: data.pictureUrl,
    });

    await this.saveUserConsents(id, data.consents);

    return newAccount;
  }

  // ===================== Phase 3: LINE Notification Helpers =====================

  static readonly NOTIFICATION_CATEGORIES: NotificationCategory[] = [
    'BOOKING_STATUS',
    'BORROW_STATUS',
    'BORROW_RETURN',
    'REPAIR_STATUS',
    'DOCUMENT_SIGNING',
  ];

  async updateLineFriendshipStatus(
    lineUserId: string,
    status: LineFriendshipStatus,
    eventTimestamp?: Date,
  ): Promise<boolean> {
    const trimmed = String(lineUserId || '').trim();
    if (!trimmed) return false;
    const now = eventTimestamp || new Date();
    let updated = false;
    for (const acc of this.userLineAccounts) {
      if (acc.lineUserId === trimmed) {
        // Event ordering: Do not let older events overwrite newer status
        if (acc.statusUpdatedAt && eventTimestamp && acc.statusUpdatedAt > eventTimestamp) {
          return false;
        }
        acc.friendshipStatus = status;
        acc.statusUpdatedAt = now;
        acc.updatedAt = new Date();
        updated = true;
      }
    }

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "user_line_accounts" 
           SET "friendship_status" = $1, 
               "status_updated_at" = $2::timestamptz, 
               "updated_at" = NOW() 
           WHERE "line_user_id" = $3 
             AND ("status_updated_at" IS NULL OR "status_updated_at" <= $2::timestamptz)`,
          status,
          now,
          trimmed,
        );
        updated = true;
      } catch (err) {
        this.logger.warn('Failed to update LINE friendship status in DB', err);
      }
    }

    return updated;
  }

  async getUserNotificationPreferences(userId: string): Promise<UserNotificationPreference[]> {
    const nowIso = new Date().toISOString();
    let saved: UserNotificationPreference[] = [];

    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "user_notification_preferences" WHERE "user_id" = $1`,
          userId,
        )) as any[];
        if (Array.isArray(rows)) {
          saved = rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            channel: r.channel as NotificationChannel,
            notificationType: r.notification_type as NotificationCategory,
            isEnabled: Boolean(r.is_enabled),
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
          }));
        }
      } catch {
        // Fallback to in-memory
      }
    }

    if (saved.length === 0) {
      saved = this.userNotificationPreferences.filter((p) => p.userId === userId);
    }

    const result: UserNotificationPreference[] = [];
    const channels: NotificationChannel[] = ['IN_APP', 'LINE'];

    for (const category of DbService.NOTIFICATION_CATEGORIES) {
      for (const channel of channels) {
        const match = saved.find((p) => p.channel === channel && p.notificationType === category);
        if (match) {
          result.push(match);
        } else {
          // Policy (Section 6): IN_APP defaults to true, LINE defaults to false (must opt-in explicitly)
          result.push({
            id: `pref-default-${userId}-${channel}-${category}`,
            userId,
            channel,
            notificationType: category,
            isEnabled: channel === 'IN_APP',
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }
    }

    return result;
  }

  async isChannelEnabled(
    userId: string,
    channel: NotificationChannel,
    notificationType: NotificationCategory | string,
  ): Promise<boolean> {
    const category = DbService.NOTIFICATION_CATEGORIES.includes(notificationType as NotificationCategory)
      ? (notificationType as NotificationCategory)
      : null;

    if (!category) {
      // SYSTEM notifications default to enabled for IN_APP
      const memMatch = this.userNotificationPreferences.find(
        (p) => p.userId === userId && p.channel === channel && p.notificationType === notificationType,
      );
      if (memMatch) return memMatch.isEnabled;
      return channel === 'IN_APP';
    }

    // Check in-memory first
    const mem = this.userNotificationPreferences.find(
      (p) => p.userId === userId && p.channel === channel && p.notificationType === category,
    );
    if (mem) return mem.isEnabled;

    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT "is_enabled" FROM "user_notification_preferences" WHERE "user_id" = $1 AND "channel" = $2 AND "notification_type" = $3 LIMIT 1`,
          userId,
          channel,
          category,
        )) as any[];
        if (rows && rows.length > 0) {
          return Boolean(rows[0].is_enabled);
        }
      } catch {
        // Fallback
      }
    }

    return channel === 'IN_APP';
  }

  async upsertUserNotificationPreferences(
    userId: string,
    items: { channel: NotificationChannel; notificationType: NotificationCategory; isEnabled: boolean }[],
  ): Promise<UserNotificationPreference[]> {
    const now = new Date();
    const nowIso = now.toISOString();

    for (const item of items) {
      if (item.channel !== 'IN_APP' && item.channel !== 'LINE') continue;
      const existingIdx = this.userNotificationPreferences.findIndex(
        (p) =>
          p.userId === userId &&
          p.channel === item.channel &&
          p.notificationType === item.notificationType,
      );
      const id =
        existingIdx >= 0
          ? this.userNotificationPreferences[existingIdx].id
          : `pref-${randomBytes(8).toString('hex')}`;
      const record: UserNotificationPreference = {
        id,
        userId,
        channel: item.channel,
        notificationType: item.notificationType,
        isEnabled: Boolean(item.isEnabled),
        createdAt: existingIdx >= 0 ? this.userNotificationPreferences[existingIdx].createdAt : nowIso,
        updatedAt: nowIso,
      };
      if (existingIdx >= 0) {
        this.userNotificationPreferences[existingIdx] = record;
      } else {
        this.userNotificationPreferences.push(record);
      }

      if (this.dbAvailable) {
        try {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO "user_notification_preferences" ("id", "user_id", "channel", "notification_type", "is_enabled", "created_at", "updated_at")
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz)
             ON CONFLICT ("user_id", "channel", "notification_type") DO UPDATE
             SET "is_enabled" = EXCLUDED."is_enabled", "updated_at" = EXCLUDED."updated_at"`,
            id,
            userId,
            item.channel,
            item.notificationType,
            Boolean(item.isEnabled),
            now,
          );
        } catch (err) {
          this.logger.warn('Failed to upsert notification preference in DB', err);
        }
      }
    }

    return this.getUserNotificationPreferences(userId);
  }

  async getLineNotificationLogByEventKey(
    eventKey: string,
  ): Promise<(LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null }) | null> {
    if (!eventKey) return null;
    const inMem = this.lineNotificationLogs.find((l) => l.eventKey === eventKey);
    if (inMem) return inMem;

    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "line_notification_logs" WHERE "event_key" = $1 LIMIT 1`,
          eventKey,
        )) as any[];
        if (rows && rows.length > 0) {
          return this.mapLineLogRow(rows[0]);
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  async getLineNotificationLogById(
    id: string,
  ): Promise<(LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null }) | null> {
    const inMem = this.lineNotificationLogs.find((l) => l.id === id);
    if (inMem) return inMem;

    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "line_notification_logs" WHERE "id" = $1 LIMIT 1`,
          id,
        )) as any[];
        if (rows && rows.length > 0) {
          const mapped = this.mapLineLogRow(rows[0]);
          this.lineNotificationLogs.unshift(mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  async createLineNotificationLog(data: {
    userId: string;
    notificationId?: string | null;
    lineUserId: string;
    notificationType: string;
    eventKey?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    messagePayload?: any;
    status: LineDeliveryStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null }> {
    const now = new Date();
    const id = `lnl-${randomBytes(8).toString('hex')}`;
    const user = this.accounts.find((a) => a.id === data.userId);
    const record: LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null } = {
      id,
      userId: data.userId,
      userName: user?.name,
      notificationId: data.notificationId ?? null,
      lineUserId: data.lineUserId,
      notificationType: data.notificationType,
      eventKey: data.eventKey ?? null,
      referenceType: data.referenceType ?? null,
      referenceId: data.referenceId ?? null,
      messagePayload: data.messagePayload ?? null,
      status: data.status,
      providerMessageId: null,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
      attemptCount: 0,
      nextRetryAt: null,
      sentAt: null,
      createdAt: now.toISOString(),
    };

    this.lineNotificationLogs.unshift(record);

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "line_notification_logs"
           ("id", "user_id", "notification_id", "line_user_id", "notification_type", "event_key", "reference_type", "reference_id", "message_payload", "status", "error_code", "error_message", "attempt_count", "created_at")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, 0, $13::timestamptz)`,
          id,
          record.userId,
          record.notificationId,
          record.lineUserId,
          record.notificationType,
          record.eventKey,
          record.referenceType,
          record.referenceId,
          record.messagePayload ? JSON.stringify(record.messagePayload) : null,
          record.status,
          record.errorCode,
          record.errorMessage,
          now,
        );
      } catch (err) {
        this.logger.warn('Failed to persist line_notification_log in DB', err);
      }
    }

    return record;
  }

  async updateLineNotificationLog(
    id: string,
    patch: {
      status?: LineDeliveryStatus;
      providerMessageId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      attemptCount?: number;
      nextRetryAt?: Date | null;
      sentAt?: Date | null;
    },
  ): Promise<(LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null }) | null> {
    const target = await this.getLineNotificationLogById(id);
    if (!target) return null;

    if (patch.status !== undefined) target.status = patch.status;
    if (patch.providerMessageId !== undefined) target.providerMessageId = patch.providerMessageId;
    if (patch.errorCode !== undefined) target.errorCode = patch.errorCode;
    if (patch.errorMessage !== undefined) target.errorMessage = patch.errorMessage;
    if (patch.attemptCount !== undefined) target.attemptCount = patch.attemptCount;
    if (patch.nextRetryAt !== undefined) {
      target.nextRetryAt = patch.nextRetryAt ? patch.nextRetryAt.toISOString() : null;
    }
    if (patch.sentAt !== undefined) {
      target.sentAt = patch.sentAt ? patch.sentAt.toISOString() : null;
    }

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "line_notification_logs"
           SET "status" = $1,
               "provider_message_id" = $2,
               "error_code" = $3,
               "error_message" = $4,
               "attempt_count" = $5,
               "next_retry_at" = $6::timestamptz,
               "sent_at" = $7::timestamptz
           WHERE "id" = $8`,
          target.status,
          target.providerMessageId ?? null,
          target.errorCode ?? null,
          target.errorMessage ?? null,
          target.attemptCount,
          target.nextRetryAt ? new Date(target.nextRetryAt) : null,
          target.sentAt ? new Date(target.sentAt) : null,
          id,
        );
      } catch (err) {
        this.logger.warn('Failed to update line_notification_log in DB', err);
      }
    }

    return target;
  }

  async getLineNotificationLogs(filter?: {
    status?: LineDeliveryStatus;
    userId?: string;
    limit?: number;
  }): Promise<LineNotificationLog[]> {
    const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
    if (this.dbAvailable && this.lineNotificationLogs.length === 0) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "line_notification_logs" ORDER BY "created_at" DESC LIMIT $1`,
          limit,
        )) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          this.lineNotificationLogs = rows.map((r) => this.mapLineLogRow(r));
        }
      } catch {
        // Fallback
      }
    }

    return this.lineNotificationLogs
      .filter((l) => {
        if (filter?.status && l.status !== filter.status) return false;
        if (filter?.userId && l.userId !== filter.userId) return false;
        return true;
      })
      .slice(0, limit)
      .map(({ messagePayload: _mp, nextRetryAt: _nr, ...publicLog }) => ({
        ...publicLog,
        userName: publicLog.userName || this.accounts.find((a) => a.id === publicLog.userId)?.name,
      }));
  }

  private mapLineLogRow(r: any): LineNotificationLog & { messagePayload?: any; nextRetryAt?: string | null } {
    const user = this.accounts.find((a) => a.id === r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      userName: user?.name,
      notificationId: r.notification_id ?? null,
      lineUserId: r.line_user_id,
      notificationType: r.notification_type,
      eventKey: r.event_key ?? null,
      referenceType: r.reference_type ?? null,
      referenceId: r.reference_id ?? null,
      messagePayload: r.message_payload
        ? typeof r.message_payload === 'string'
          ? JSON.parse(r.message_payload)
          : r.message_payload
        : null,
      status: r.status as LineDeliveryStatus,
      providerMessageId: r.provider_message_id ?? null,
      errorCode: r.error_code ?? null,
      errorMessage: r.error_message ?? null,
      attemptCount: Number(r.attempt_count) || 0,
      nextRetryAt: r.next_retry_at ? new Date(r.next_retry_at).toISOString() : null,
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async findWebhookEvent(webhookEventId: string): Promise<LineWebhookEventRecord | null> {
    if (!webhookEventId) return null;
    const inMem = this.lineWebhookEvents.find((e) => e.webhookEventId === webhookEventId);
    if (inMem) return inMem;

    if (this.dbAvailable) {
      try {
        const rows = (await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "line_webhook_events" WHERE "webhook_event_id" = $1 LIMIT 1`,
          webhookEventId,
        )) as any[];
        if (rows && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            webhookEventId: r.webhook_event_id,
            eventType: r.event_type,
            lineUserId: r.line_user_id ?? null,
            eventTimestamp: new Date(r.event_timestamp).toISOString(),
            processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : null,
            processingStatus: r.processing_status,
            createdAt: new Date(r.created_at).toISOString(),
          };
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  async recordWebhookEvent(data: {
    webhookEventId: string;
    eventType: string;
    lineUserId?: string | null;
    eventTimestamp: Date;
    processingStatus: 'PROCESSED' | 'IGNORED' | 'FAILED';
  }): Promise<LineWebhookEventRecord> {
    const now = new Date();
    const id = `lwe-${randomBytes(8).toString('hex')}`;
    const record: LineWebhookEventRecord = {
      id,
      webhookEventId: data.webhookEventId,
      eventType: data.eventType,
      lineUserId: data.lineUserId ?? null,
      eventTimestamp: data.eventTimestamp.toISOString(),
      processedAt: now.toISOString(),
      processingStatus: data.processingStatus,
      createdAt: now.toISOString(),
    };

    this.lineWebhookEvents.unshift(record);

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "line_webhook_events" ("id", "webhook_event_id", "event_type", "line_user_id", "event_timestamp", "processed_at", "processing_status", "created_at")
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8::timestamptz)
           ON CONFLICT ("webhook_event_id") DO NOTHING`,
          id,
          record.webhookEventId,
          record.eventType,
          record.lineUserId,
          data.eventTimestamp,
          now,
          record.processingStatus,
          now,
        );
      } catch (err) {
        this.logger.warn('Failed to persist line_webhook_event in DB', err);
      }
    }

    return record;
  }

  // ===================== Seed & Hydrate =====================

  async seedDatabase(forceClear = false) {
    if (forceClear) {
      await this.prisma.$transaction([
        this.prisma.handoverRecord.deleteMany(),
        this.prisma.signatureRecord.deleteMany(),
        this.prisma.requestItem.deleteMany(),
        this.prisma.requestPeriod.deleteMany(),
        this.prisma.requestVenue.deleteMany(),
        this.prisma.request.deleteMany(),
        this.prisma.notification.deleteMany(),
        this.prisma.activityLog.deleteMany(),
        this.prisma.venue.deleteMany(),
        this.prisma.equipment.deleteMany(),
        this.prisma.account.deleteMany(),
      ]);
    }

    for (const a of mockAccounts) {
      const hashedPassword = a.password.startsWith('$argon2') ? a.password : await hashSecret(a.password);
      const hashedPin = a.pin ? (a.pin.startsWith('$argon2') ? a.pin : await hashSecret(a.pin)) : null;
      await this.persistAccount({ ...a, password: hashedPassword, pin: hashedPin });
    }
    for (const v of mockVenues) {
      await this.persistVenue(v);
    }
    for (const e of mockEquipment) {
      await this.persistEquipment(e);
    }
    for (const r of mockRequests) {
      await this.persistRequest(r);
    }
    for (const n of mockNotifications) {
      await this.prisma.notification.upsert({
        where: { id: n.id },
        create: {
          id: n.id,
          userId: n.userId,
          title: n.title,
          body: n.body,
          read: n.read,
          link: n.link ?? null,
          createdAt: new Date(n.at),
        },
        update: {
          title: n.title,
          body: n.body,
          read: n.read,
          link: n.link ?? null,
        },
      });
    }
    for (const act of mockActivities) {
      await this.prisma.activityLog.upsert({
        where: { id: act.id },
        create: {
          id: act.id,
          kind: act.kind,
          title: act.title,
          detail: act.detail,
          createdAt: new Date(act.at),
        },
        update: {
          kind: act.kind,
          title: act.title,
          detail: act.detail,
        },
      });
    }
  }

  async loadFromDatabase() {
    const [dbAccounts, accountAddresses, dbVenues, dbEquipment, dbRequests, dbNotifications, dbActivities, dbHandovers] =
      await Promise.all([
        this.prisma.account.findMany({ orderBy: { createdAt: 'asc' } }),
        (this.prisma.$queryRaw`SELECT "id", "address_house_no", "address_moo", "address_subdistrict", "address_district", "address_province", "address_subdistrict_id", "address_district_id", "address_province_id", "email", "email_verified" FROM "accounts"` as Promise<
          {
            id: string;
            address_house_no: string | null;
            address_moo: string | null;
            address_subdistrict: string | null;
            address_district: string | null;
            address_province: string | null;
            address_subdistrict_id: string | null;
            address_district_id: string | null;
            address_province_id: string | null;
            email: string | null;
            email_verified: boolean | null;
          }[]
        >),
        this.prisma.venue.findMany({ orderBy: { createdAt: 'asc' } }),
        this.prisma.equipment.findMany({ orderBy: { createdAt: 'asc' } }),
        this.prisma.request.findMany({
          include: {
            venues: true,
            periods: { orderBy: { sortOrder: 'asc' } },
            items: true,
            signatures: { orderBy: { signedAt: 'asc' } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.handoverRecord.findMany({ orderBy: { createdAt: 'asc' } }),
      ]);

    const addrMap = new Map((accountAddresses as any[]).map((r: any) => [r.id, r]));

    this.accounts = (dbAccounts || []).map((a: any) => {
      const addr = addrMap.get(a.id) as any;
      return {
        id: a.id,
        username: a.username,
        password: a.password,
        name: a.name,
        nickname: a.nickname,
        initial: a.initial,
        role: a.role,
        position: a.position,
        department: a.department,
        phone: a.phone,
        lineName: a.lineName ?? undefined,
        lineUserId: a.lineUserId ?? undefined,
        email: addr?.email ?? undefined,
        emailVerified: addr?.email_verified ?? false,
        addressHouseNo: addr?.address_house_no ?? undefined,
        addressMoo: addr?.address_moo ?? undefined,
        addressSubdistrict: addr?.address_subdistrict ?? undefined,
        addressDistrict: addr?.address_district ?? undefined,
        addressProvince: addr?.address_province ?? undefined,
        addressSubdistrictId: addr?.address_subdistrict_id ?? undefined,
        addressDistrictId: addr?.address_district_id ?? undefined,
        addressProvinceId: addr?.address_province_id ?? undefined,
        permissions:
          a.permissions && typeof a.permissions === 'object'
            ? (a.permissions as Record<PermissionKey, boolean>)
            : { ...DEFAULT_PERMISSIONS[(a.role as Role) || 'USER'] },
        signature: a.signature,
        pin: a.pin,
        isDemo: a.isDemo,
        active: a.active,
        createdAt: a.createdAt.toISOString(),
      };
    });

    let venueImagesMap = new Map<string, string[]>();
    let equipmentImagesMap = new Map<string, string[]>();
    let reqExtraMap = new Map<string, any>();
    try {
      const [vRows, eRows, rExtraRows] = await Promise.all([
        this.prisma.$queryRaw<{ id: string; images: string[] | null }[]>`SELECT "id", "images" FROM "venues"`,
        this.prisma.$queryRaw<{ id: string; images: string[] | null }[]>`SELECT "id", "images" FROM "equipments"`,
        this.prisma.$queryRaw<any[]>`
          SELECT
            "id",
            "requester_phone",
            "address_subdistrict_id",
            "address_district_id",
            "address_province_id",
            "received_at",
            "received_by_id",
            "received_by_name",
            "receive_photos",
            "receive_note",
            "return_submitted_at",
            "return_submitted_by_id",
            "return_submitted_by_name",
            "return_photos",
            "return_note",
            "inspected_at",
            "inspector_id",
            "inspector_name",
            "inspect_result",
            "inspect_note",
            "inspect_photos"
          FROM "requests"
        `,
      ]);
      venueImagesMap = new Map((vRows || []).map((r) => [r.id, Array.isArray(r.images) ? r.images : []]));
      equipmentImagesMap = new Map((eRows || []).map((r) => [r.id, Array.isArray(r.images) ? r.images : []]));
      reqExtraMap = new Map((rExtraRows || []).map((r) => [r.id, r]));
    } catch {
      // ignore if column not yet migrated
    }

    this.venues = (dbVenues || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      building: v.building,
      floor: v.floor,
      capacity: v.capacity,
      status: v.status,
      enabled: v.enabled,
      facilities: v.facilities,
      openTime: v.openTime,
      closeTime: v.closeTime,
      openDays: v.openDays,
      advanceDays: v.advanceDays,
      formName: v.formName,
      approvalLevels: v.approvalLevels,
      images: venueImagesMap.get(v.id) ?? [],
    }));

    this.equipment = (dbEquipment || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      stock: e.stock,
      enabled: e.enabled,
      images: equipmentImagesMap.get(e.id) ?? [],
    }));

    this.requests = (dbRequests || []).map((r: any): AnyRequest => {
      const extra = reqExtraMap.get(r.id);
      const base = {
        id: r.id,
        code: r.code,
        status: r.status,
        requesterId: r.requesterId,
        requesterName: r.requesterName,
        requesterPhone: extra?.requester_phone ?? undefined,
        organization: r.organization,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        requesterSignature: r.requesterSignature ?? undefined,
        createdByStaffId: r.createdByStaffId ?? undefined,
        createdByStaffSignature: r.createdByStaffSignature ?? undefined,
        rejectReason: r.rejectReason ?? undefined,
        approvalRound: r.approvalRound,
        writtenAt: r.writtenAt ?? undefined,
        requesterPosition: r.requesterPosition ?? undefined,
        addressHouseNo: r.addressHouseNo ?? undefined,
        addressMoo: r.addressMoo ?? undefined,
        addressSubdistrict: r.addressSubdistrict ?? undefined,
        addressDistrict: r.addressDistrict ?? undefined,
        addressProvince: r.addressProvince ?? undefined,
        addressSubdistrictId: extra?.address_subdistrict_id ?? undefined,
        addressDistrictId: extra?.address_district_id ?? undefined,
        addressProvinceId: extra?.address_province_id ?? undefined,
        purposeItems: Array.isArray(r.purposeItems)
          ? (r.purposeItems as unknown as OfficialFormPurposeItem[])
          : undefined,
      };

      const currentRound = r.approvalRound ?? 1;
      const signatures = (r.signatures || [])
        .filter((s: any) => s.round === currentRound)
        .map((s: any) => ({
          level: s.level,
          round: s.round,
          signerId: s.signerId,
          signerName: s.signerName,
          title: s.title,
          at: s.signedAt.toISOString(),
          decision: s.decision,
          signature: s.signature ?? undefined,
          note: s.note ?? undefined,
        }));

      if (r.type === 'booking') {
        const currentPeriods = (r.periods || [])
          .filter((p: any) => p.kind === 'current')
          .map((p: any) => ({ start: p.startTime.toISOString(), end: p.endTime.toISOString() }));
        const reschedulePeriods = (r.periods || [])
          .filter((p: any) => p.kind === 'reschedule')
          .map((p: any) => ({ start: p.startTime.toISOString(), end: p.endTime.toISOString() }));

        const booking: BookingRequest = {
          ...base,
          type: 'booking',
          venueIds: (r.venues || []).map((v: any) => v.venueId),
          periods: currentPeriods,
          rescheduleTo: reschedulePeriods.length > 0 ? reschedulePeriods : undefined,
          attendees: r.attendees ?? 30,
          activity: r.activity ?? '',
          purpose: r.purpose ?? '',
          attachments: r.attachments,
          extraItems: (r.items || []).map((i: any) => ({ equipmentId: i.equipmentId, qty: i.qty })),
          signatures,
        };
        return booking;
      }

      if (r.type === 'borrow') {
        const borrow: BorrowRequest = {
          ...base,
          type: 'borrow',
          items: (r.items || []).map((i: any) => ({ equipmentId: i.equipmentId, qty: i.qty })),
          pickupDate: r.pickupDate ? r.pickupDate.toISOString().slice(0, 10) : '2026-10-22',
          returnDate: r.returnDate ? r.returnDate.toISOString().slice(0, 10) : '2026-10-25',
          purpose: r.purpose ?? '',
          attachments: r.attachments,
          signatures,
          returnRequestedAt: r.returnRequestedAt ? r.returnRequestedAt.toISOString() : undefined,
          returnedAt: r.returnedAt ? r.returnedAt.toISOString() : undefined,
          receivedAt: extra?.received_at ? new Date(extra.received_at).toISOString() : undefined,
          receivedById: extra?.received_by_id ?? undefined,
          receivedByName: extra?.received_by_name ?? undefined,
          receivePhotos: Array.isArray(extra?.receive_photos) && extra.receive_photos.length > 0 ? extra.receive_photos : undefined,
          receiveNote: extra?.receive_note ?? undefined,
          returnSubmittedAt: extra?.return_submitted_at ? new Date(extra.return_submitted_at).toISOString() : undefined,
          returnSubmittedById: extra?.return_submitted_by_id ?? undefined,
          returnSubmittedByName: extra?.return_submitted_by_name ?? undefined,
          returnPhotos: Array.isArray(extra?.return_photos) && extra.return_photos.length > 0 ? extra.return_photos : undefined,
          returnNote: extra?.return_note ?? undefined,
          inspectedAt: extra?.inspected_at ? new Date(extra.inspected_at).toISOString() : undefined,
          inspectorId: extra?.inspector_id ?? undefined,
          inspectorName: extra?.inspector_name ?? undefined,
          inspectResult: extra?.inspect_result ?? undefined,
          inspectNote: extra?.inspect_note ?? undefined,
          inspectPhotos: Array.isArray(extra?.inspect_photos) && extra.inspect_photos.length > 0 ? extra.inspect_photos : undefined,
        };
        return borrow;
      }

      const repair: RepairRequest = {
        ...base,
        type: 'repair',
        building: r.repairBuilding ?? 'อาคารสำนักงาน',
        floor: r.repairFloor ?? 'ชั้น 1',
        location: r.repairLocation ?? 'ทั่วไป',
        category: r.repairCategory ?? 'อื่น ๆ',
        detail: r.repairDetail ?? '',
        photos: r.repairPhotos ?? (Array.isArray(r.attachments) ? r.attachments.length : 0),
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
        acceptedAt: r.repairAcceptedAt ? r.repairAcceptedAt.toISOString() : undefined,
        startedAt: r.repairStartedAt ? r.repairStartedAt.toISOString() : undefined,
        finishedAt: r.repairFinishedAt ? r.repairFinishedAt.toISOString() : undefined,
        resolution: r.repairResolution ?? undefined,
        staffSignature: r.repairStaffSignature ?? undefined,
        staffSignerName: r.repairStaffSignerName ?? undefined,
        acceptanceSignature: r.repairAcceptSignature ?? undefined,
        acceptedByRequesterAt: r.repairAcceptedByReqAt ? r.repairAcceptedByReqAt.toISOString() : undefined,
      };
      return repair;
    });

    this.notifications = dbNotifications.map((n: any) => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      body: n.body,
      message: n.body,
      notificationType: n.notificationType || n.notification_type || 'SYSTEM',
      referenceType: n.referenceType || n.reference_type || null,
      referenceId: n.referenceId || n.reference_id || null,
      at: n.createdAt.toISOString(),
      createdAt: n.createdAt.toISOString(),
      read: n.read,
      isRead: n.read,
      readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
      link: n.link ?? undefined,
    }));

    this.activities = (dbActivities || []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      detail: a.detail,
      actorId: a.actorId ?? undefined,
      actorName: a.actorName ?? undefined,
      actorRole: a.actorRole ?? undefined,
      ip: a.ip ?? undefined,
      at: a.createdAt.toISOString(),
    }));

    this.handovers = (dbHandovers || []).map((h: any) => ({
      requestId: h.requestId,
      phase: h.phase,
      items: Array.isArray(h.checklist) ? (h.checklist as { label: string; ok: boolean }[]) : [],
      note: h.note,
      at: h.createdAt.toISOString(),
      staffId: h.staffId,
      staffName: h.staffName ?? undefined,
      citizenSignature: h.citizenSignature ?? undefined,
      staffSignature: h.staffSignature ?? undefined,
    }));

    try {
      const dbVers = (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "document_verifications" ORDER BY "created_at" DESC`,
      )) as any[];
      if (Array.isArray(dbVers)) {
        this.verifications = dbVers.map((r: any) => ({
          id: r.id,
          documentId: r.document_id,
          verificationToken: r.verification_token,
          documentNumber: r.document_number,
          documentHash: r.document_hash,
          version: Number(r.version) || 1,
          status: r.status,
          documentType: r.document_type,
          title: r.title || '',
          issuingOrg: r.issuing_org || 'องค์การบริหารส่วนตำบล (อบต.)',
          metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : undefined,
          issuedAt: new Date(r.issued_at).toISOString(),
          revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : undefined,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      }

      const dbLogs = (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "document_scan_logs" ORDER BY "scanned_at" DESC LIMIT 100`,
      )) as any[];
      if (Array.isArray(dbLogs)) {
        this.scanLogs = dbLogs.map((r: any) => ({
          id: r.id,
          verificationId: r.verification_id,
          scannedBy: r.scanned_by ?? undefined,
          scannedByName: r.scanned_by_name ?? undefined,
          scannedByRole: r.scanned_by_role ?? undefined,
          result: r.result,
          note: r.note ?? undefined,
          ip: r.ip ?? undefined,
          userAgent: r.user_agent ?? undefined,
          scannedAt: new Date(r.scanned_at).toISOString(),
        }));
      }
    } catch (err) {
      this.logger.warn('Could not load verifications from DB, using memory state:', err);
    }

    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "sidebar_services" ORDER BY "sort_order" ASC, "created_at" ASC`,
      )) as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        this.sidebarServices = rows.map((r: any) => ({
          id: r.id,
          slug: r.slug ?? undefined,
          label: r.label,
          description: r.description ?? '',
          icon: r.icon || 'FolderTree',
          href: r.href,
          category: r.category || 'บริการหลัก',
          sortOrder: Number(r.sort_order ?? 0),
          enabled: Boolean(r.enabled),
          isSystem: Boolean(r.is_system),
          roles: Array.isArray(r.roles) ? r.roles : [],
          allowedUserIds: Array.isArray(r.allowed_user_ids) ? r.allowed_user_ids : [],
          deniedUserIds: Array.isArray(r.denied_user_ids) ? r.denied_user_ids : [],
          permissions: r.permissions
            ? typeof r.permissions === 'string'
              ? JSON.parse(r.permissions)
              : r.permissions
            : { view: true, create: false, edit: false, delete: false, approve: false, manage: false },
          exact: Boolean(r.exact),
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      } else {
        this.sidebarServices = clone(mockSidebarServices);
        for (const s of this.sidebarServices) {
          await this.prisma
            .$executeRawUnsafe(
              `INSERT INTO "sidebar_services" ("id", "slug", "label", "description", "icon", "href", "category", "sort_order", "enabled", "is_system", "roles", "allowed_user_ids", "denied_user_ids", "permissions", "exact", "created_at", "updated_at")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT ("id") DO NOTHING`,
              s.id,
              s.slug || s.id,
              s.label,
              s.description || '',
              s.icon,
              s.href,
              s.category,
              s.sortOrder,
              s.enabled,
              s.isSystem ?? false,
              s.roles,
              s.allowedUserIds,
              s.deniedUserIds || [],
              JSON.stringify(s.permissions),
              s.exact ?? false,
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      this.logger.warn('Could not load sidebar_services from DB, using fallback mock:', err);
      if (this.sidebarServices.length === 0) {
        this.sidebarServices = clone(mockSidebarServices);
      }
    }

    try {
      const roleRows = (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "role_definitions" ORDER BY "created_at" ASC`,
      )) as any[];
      if (Array.isArray(roleRows) && roleRows.length > 0) {
        this.roles = roleRows.map((r: any) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description ?? '',
          tone: r.tone || 'gray',
          userCount: 0,
          enabled: Boolean(r.enabled),
          isSystem: Boolean(r.is_system),
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      } else {
        this.roles = clone(mockRoles);
        for (const role of this.roles) {
          await this.prisma
            .$executeRawUnsafe(
              `INSERT INTO "role_definitions" ("id", "key", "name", "description", "tone", "enabled", "is_system", "created_at", "updated_at")
               VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT ("id") DO NOTHING`,
              role.id,
              role.key,
              role.name,
              role.description,
              role.tone,
              role.enabled,
              role.isSystem,
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      this.logger.warn('Could not load role_definitions from DB, using fallback mock:', err);
      if (this.roles.length === 0) {
        this.roles = clone(mockRoles);
      }
    }

    try {
      const docTplRows = (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "document_templates" ORDER BY "updated_at" DESC`,
      )) as any[];
      if (Array.isArray(docTplRows) && docTplRows.length > 0) {
        this.documentTemplates = docTplRows.map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description ?? '',
          category: r.category || 'venue',
          status: r.status || 'draft',
          currentVersion: Number(r.current_version ?? 1),
          structure: typeof r.structure === 'string' ? JSON.parse(r.structure) : (r.structure || {}),
          settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : (r.settings || {}),
          createdBy: r.created_by || 'ADMIN',
          updatedBy: r.updated_by || 'ADMIN',
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      } else {
        this.initDefaultDocumentTemplates();
        for (const t of this.documentTemplates) {
          await this.prisma
            .$executeRawUnsafe(
              `INSERT INTO "document_templates" ("id", "name", "description", "category", "status", "current_version", "structure", "settings", "created_by", "updated_by", "created_at", "updated_at")
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT ("id") DO NOTHING`,
              t.id,
              t.name,
              t.description || '',
              t.category,
              t.status,
              t.currentVersion,
              JSON.stringify(t.structure),
              JSON.stringify(t.settings),
              t.createdBy || 'ADMIN',
              t.updatedBy || 'ADMIN',
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      this.logger.warn('Could not load document_templates from DB, using fallback mock:', err);
      if (this.documentTemplates.length === 0) {
        this.initDefaultDocumentTemplates();
      }
    }

    await this.syncSequences();
    await this.cleanExpiredSessions();
  }

  // ===================== Sidebar & Services Management =====================

  listSidebarServices(): SidebarServiceItem[] {
    return clone(this.sidebarServices).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getSidebarServicesForUser(account: Account | null): SidebarServiceItem[] {
    return this.sidebarServices
      .filter((item) => {
        if (!item.enabled) return false;
        if (account?.id && item.deniedUserIds?.includes(account.id)) return false;
        if (account?.id && item.allowedUserIds?.includes(account.id)) return true;
        if (account) {
          return item.roles.includes(account.role);
        } else {
          return item.roles.includes('USER') && ['/', '/booking', '/borrow', '/repair'].includes(item.href);
        }
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getSidebarServiceById(id: string): SidebarServiceItem | undefined {
    return this.sidebarServices.find((s) => s.id === id);
  }

  isServiceRouteEnabled(route: string): boolean {
    const matched = this.sidebarServices.find((s) =>
      s.exact || s.href === '/' ? route === s.href : route.startsWith(s.href),
    );
    if (!matched) return true;
    return matched.enabled;
  }

  async createSidebarService(dto: CreateSidebarServiceDto, actor: Account): Promise<SidebarServiceItem> {
    const href = dto.href.trim();
    if (this.sidebarServices.some((s) => s.href === href)) {
      throw new BadRequestException(`URL หรือ Route "${href}" มีอยู่ในระบบแล้ว`);
    }

    const id = `nav-${randomBytes(6).toString('hex')}`;
    const maxOrder = this.sidebarServices.reduce((max, s) => Math.max(max, s.sortOrder), 0);
    const newItem: SidebarServiceItem = {
      id,
      slug: id,
      label: dto.label.trim(),
      description: dto.description?.trim() || '',
      icon: dto.icon || 'FolderTree',
      href,
      category: dto.category.trim() || 'บริการทั่วไป',
      sortOrder: typeof dto.sortOrder === 'number' ? dto.sortOrder : maxOrder + 1,
      enabled: dto.enabled !== false,
      isSystem: false,
      roles: Array.isArray(dto.roles) ? dto.roles : ['ADMIN'],
      allowedUserIds: Array.isArray(dto.allowedUserIds) ? dto.allowedUserIds : [],
      deniedUserIds: Array.isArray(dto.deniedUserIds) ? dto.deniedUserIds : [],
      permissions: {
        view: true,
        create: Boolean(dto.permissions?.create),
        edit: Boolean(dto.permissions?.edit),
        delete: Boolean(dto.permissions?.delete),
        approve: Boolean(dto.permissions?.approve),
        manage: Boolean(dto.permissions?.manage),
      },
      exact: Boolean(dto.exact),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sidebarServices.push(newItem);

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "sidebar_services" ("id", "slug", "label", "description", "icon", "href", "category", "sort_order", "enabled", "is_system", "roles", "allowed_user_ids", "denied_user_ids", "permissions", "exact", "created_at", "updated_at")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          newItem.id,
          newItem.slug,
          newItem.label,
          newItem.description,
          newItem.icon,
          newItem.href,
          newItem.category,
          newItem.sortOrder,
          newItem.enabled,
          newItem.isSystem,
          newItem.roles,
          newItem.allowedUserIds,
          newItem.deniedUserIds,
          JSON.stringify(newItem.permissions),
          newItem.exact,
        );
      } catch (err: any) {
        this.logger.error('Failed to insert sidebar_service into PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'resource',
      'เพิ่มบริการ/เมนูใหม่',
      `เพิ่มบริการ "${newItem.label}" (${newItem.href}) ในหมวดหมู่ "${newItem.category}"`,
      actor,
    );

    return newItem;
  }

  async updateSidebarService(id: string, dto: UpdateSidebarServiceDto, actor: Account): Promise<SidebarServiceItem> {
    const item = this.sidebarServices.find((s) => s.id === id);
    if (!item) throw new NotFoundException('ไม่พบบริการหรือเมนูที่ระบุ');

    // ตรวจสอบความปลอดภัย: ป้องกันไม่ให้แอดมินปิดหรือลบสิทธิ์ Admin ในเมนูผู้ดูแลระบบ (/admin, /admin/*)
    const isAdminSystemMenu = item.href === '/admin' || item.href.startsWith('/admin/');
    if (isAdminSystemMenu) {
      if (dto.roles && !dto.roles.includes('ADMIN')) {
        throw new ForbiddenException('ไม่สามารถยกเลิกสิทธิ์ของผู้ดูแลระบบ (ADMIN) ในเมนูระบบหลักได้');
      }
      if (dto.enabled === false && (item.href === '/admin' || item.href === '/admin/services' || item.href === '/admin/permissions')) {
        throw new ForbiddenException('ไม่สามารถปิดการใช้งานเมนูหลักของผู้ดูแลระบบได้ เพื่อป้องกันไม่ให้ระบบไม่มีผู้ดูแล');
      }
    }

    if (dto.href && dto.href !== item.href) {
      const nextHref = dto.href.trim();
      if (this.sidebarServices.some((s) => s.id !== id && s.href === nextHref)) {
        throw new BadRequestException(`URL หรือ Route "${nextHref}" มีอยู่ในระบบแล้ว`);
      }
      item.href = nextHref;
    }

    if (dto.label !== undefined) item.label = dto.label.trim();
    if (dto.description !== undefined) item.description = dto.description.trim();
    if (dto.icon !== undefined) item.icon = dto.icon.trim();
    if (dto.category !== undefined) item.category = dto.category.trim();
    if (typeof dto.sortOrder === 'number') item.sortOrder = dto.sortOrder;
    if (typeof dto.enabled === 'boolean') item.enabled = dto.enabled;
    if (Array.isArray(dto.roles)) item.roles = dto.roles;
    if (Array.isArray(dto.allowedUserIds)) item.allowedUserIds = dto.allowedUserIds;
    if (Array.isArray(dto.deniedUserIds)) item.deniedUserIds = dto.deniedUserIds;
    if (dto.permissions) {
      item.permissions = {
        ...item.permissions,
        ...dto.permissions,
      };
    }
    if (typeof dto.exact === 'boolean') item.exact = dto.exact;
    item.updatedAt = new Date().toISOString();

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "sidebar_services"
           SET "label" = $1, "description" = $2, "icon" = $3, "href" = $4, "category" = $5,
               "sort_order" = $6, "enabled" = $7, "roles" = $8, "allowed_user_ids" = $9,
               "denied_user_ids" = $10, "permissions" = $11::jsonb, "exact" = $12, "updated_at" = CURRENT_TIMESTAMP
           WHERE "id" = $13`,
          item.label,
          item.description,
          item.icon,
          item.href,
          item.category,
          item.sortOrder,
          item.enabled,
          item.roles,
          item.allowedUserIds,
          item.deniedUserIds,
          JSON.stringify(item.permissions),
          item.exact,
          item.id,
        );
      } catch (err: any) {
        this.logger.error('Failed to update sidebar_service in PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'resource',
      'แก้ไขบริการ/เมนู',
      `แก้ไขบริการ "${item.label}" (${item.href}) สถานะ=${item.enabled ? 'เปิด' : 'ปิด'} สิทธิ์=[${item.roles.join(', ')}]`,
      actor,
    );

    return item;
  }

  async toggleSidebarService(id: string, actor: Account): Promise<SidebarServiceItem> {
    const item = this.sidebarServices.find((s) => s.id === id);
    if (!item) throw new NotFoundException('ไม่พบบริการหรือเมนูที่ระบุ');

    if (item.enabled && (item.href === '/admin' || item.href === '/admin/services' || item.href === '/admin/permissions')) {
      throw new ForbiddenException('ไม่สามารถปิดการใช้งานเมนูผู้ดูแลระบบหลักได้ เพื่อป้องกันไม่ให้ระบบไม่มีผู้ดูแล');
    }

    item.enabled = !item.enabled;
    item.updatedAt = new Date().toISOString();

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "sidebar_services" SET "enabled" = $1, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $2`,
          item.enabled,
          item.id,
        );
      } catch (err: any) {
        this.logger.error('Failed to toggle sidebar_service in PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'resource',
      item.enabled ? 'เปิดใช้งานบริการ' : 'ปิดใช้งานบริการ',
      `${item.enabled ? 'เปิด' : 'ปิด'}การแสดงผลบริการ "${item.label}" (${item.href})`,
      actor,
    );

    return item;
  }

  async reorderSidebarServices(orderUpdates: { id: string; sortOrder: number; category?: string }[], actor: Account): Promise<void> {
    for (const update of orderUpdates) {
      const item = this.sidebarServices.find((s) => s.id === update.id);
      if (item) {
        item.sortOrder = update.sortOrder;
        if (update.category) item.category = update.category;
        item.updatedAt = new Date().toISOString();
        if (this.dbAvailable) {
          await this.prisma
            .$executeRawUnsafe(
              `UPDATE "sidebar_services" SET "sort_order" = $1, "category" = $2, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $3`,
              item.sortOrder,
              item.category,
              item.id,
            )
            .catch(() => {});
        }
      }
    }

    await this.log(
      'resource',
      'จัดเรียงลำดับเมนู Sidebar',
      `อัปเดตการจัดเรียงลำดับและหมวดหมู่เมนูจำนวน ${orderUpdates.length} รายการ`,
      actor,
    );
  }

  async checkServiceRelations(id: string): Promise<ServiceRelationCheckResult> {
    const item = this.sidebarServices.find((s) => s.id === id);
    if (!item) throw new NotFoundException('ไม่พบบริการหรือเมนูที่ระบุ');

    const reasons: string[] = [];
    let canDelete = true;
    let relatedRequestsCount = 0;
    let relatedResourcesCount = 0;

    // 1. ตรวจสอบเมนูระบบหลัก
    if (
      item.isSystem ||
      item.href === '/admin' ||
      item.href === '/admin/services' ||
      item.href === '/admin/permissions' ||
      item.href === '/account'
    ) {
      canDelete = false;
      reasons.push('เมนูนี้เป็นบริการหลักของระบบ ไม่สามารถลบได้ เพื่อรักษาเสถียรภาพและความปลอดภัยของระบบ');
    }

    // 2. ตรวจสอบความสัมพันธ์กับคำขอและทรัพยากร
    if (item.href.includes('/booking')) {
      relatedRequestsCount = this.requests.filter((r) => r.type === 'booking').length;
      relatedResourcesCount = this.venues.length;
      if (relatedRequestsCount > 0) {
        canDelete = false;
        reasons.push(
          `พบบันทึกคำขอใช้สถานที่ในระบบจำนวน ${relatedRequestsCount} รายการ และสถานที่ ${relatedResourcesCount} แห่ง (แนะนำให้ "ปิดใช้งาน" แทนการลบเพื่อรักษาความสมบูรณ์ของข้อมูล)`,
        );
      }
    } else if (item.href.includes('/borrow')) {
      relatedRequestsCount = this.requests.filter((r) => r.type === 'borrow').length;
      relatedResourcesCount = this.equipment.length;
      if (relatedRequestsCount > 0) {
        canDelete = false;
        reasons.push(
          `พบบันทึกคำขอยืม-คืนอุปกรณ์ในระบบจำนวน ${relatedRequestsCount} รายการ และอุปกรณ์ ${relatedResourcesCount} รายการ (แนะนำให้ "ปิดใช้งาน" แทนการลบเพื่อรักษาความสมบูรณ์ของข้อมูล)`,
        );
      }
    } else if (item.href.includes('/repair')) {
      relatedRequestsCount = this.requests.filter((r) => r.type === 'repair').length;
      if (relatedRequestsCount > 0) {
        canDelete = false;
        reasons.push(
          `พบบันทึกแจ้งซ่อมในระบบจำนวน ${relatedRequestsCount} รายการ (แนะนำให้ "ปิดใช้งาน" แทนการลบเพื่อรักษาความสมบูรณ์ของข้อมูล)`,
        );
      }
    }

    return {
      canDelete,
      isSystem: Boolean(item.isSystem),
      reasons,
      relatedRequestsCount,
      relatedResourcesCount,
    };
  }

  async deleteSidebarService(id: string, actor: Account): Promise<void> {
    const item = this.sidebarServices.find((s) => s.id === id);
    if (!item) throw new NotFoundException('ไม่พบบริการหรือเมนูที่ระบุ');

    const check = await this.checkServiceRelations(id);
    if (!check.canDelete) {
      throw new BadRequestException(
        `ไม่สามารถลบบริการ "${item.label}" ได้: ${check.reasons.join(' | ')}`,
      );
    }

    this.sidebarServices = this.sidebarServices.filter((s) => s.id !== id);

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM "sidebar_services" WHERE "id" = $1`,
          id,
        );
      } catch (err: any) {
        this.logger.error('Failed to delete sidebar_service from PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'resource',
      'ลบบริการ/เมนู',
      `ลบบริการ "${item.label}" (${item.href}) ออกจากระบบ`,
      actor,
    );
  }

  // ==================== Role Management ====================

  listRoles(): RoleItem[] {
    return this.roles.map((r) => {
      const count = this.accounts.filter((a) => a.role === r.key).length;
      return {
        ...r,
        userCount: count,
      };
    });
  }

  getRoleById(id: string): RoleItem | null {
    const role = this.roles.find((r) => r.id === id);
    if (!role) return null;
    return {
      ...role,
      userCount: this.accounts.filter((a) => a.role === role.key).length,
    };
  }

  getRoleByKey(key: string): RoleItem | null {
    const role = this.roles.find((r) => r.key === key);
    if (!role) return null;
    return {
      ...role,
      userCount: this.accounts.filter((a) => a.role === role.key).length,
    };
  }

  async createRole(dto: CreateRoleDto, actor: Account): Promise<RoleItem> {
    const name = (dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('กรุณาระบุชื่อบทบาท');
    }

    let key = (dto.key || '').trim().toUpperCase();
    if (!key) {
      key = 'ROLE_' + Date.now().toString(36).toUpperCase();
    } else {
      key = key.replace(/[^A-Z0-9_]/g, '_');
      if (this.roles.some((r) => r.key === key)) {
        throw new BadRequestException(`รหัสบทบาท "${key}" มีอยู่ในระบบแล้ว`);
      }
    }

    const now = new Date().toISOString();
    const newRole: RoleItem = {
      id: 'role-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      key,
      name,
      description: (dto.description || '').trim(),
      tone: dto.tone || 'blue',
      enabled: dto.enabled !== false,
      isSystem: false,
      userCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.roles.push(newRole);

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "role_definitions" ("id", "key", "name", "description", "tone", "enabled", "is_system", "created_at", "updated_at")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          newRole.id,
          newRole.key,
          newRole.name,
          newRole.description,
          newRole.tone,
          newRole.enabled,
          newRole.isSystem,
          new Date(now),
          new Date(now),
        );
      } catch (err: any) {
        this.logger.error('Failed to insert role_definitions to PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'role',
      'สร้างบทบาทใหม่',
      `สร้างบทบาท "${newRole.name}" (${newRole.key})`,
      actor,
    );

    return newRole;
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: Account): Promise<RoleItem> {
    const idx = this.roles.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundException('ไม่พบบทบาทที่ระบุ');
    }

    const existing = this.roles[idx];

    if (dto.enabled === false && existing.key === 'ADMIN') {
      throw new BadRequestException('ไม่สามารถปิดการใช้งานบทบาทผู้ดูแลระบบ (ADMIN) ได้');
    }

    const now = new Date().toISOString();
    const updated: RoleItem = {
      ...existing,
      name: typeof dto.name === 'string' && dto.name.trim() ? dto.name.trim() : existing.name,
      description: typeof dto.description === 'string' ? dto.description.trim() : existing.description,
      tone: dto.tone || existing.tone,
      enabled: typeof dto.enabled === 'boolean' ? dto.enabled : existing.enabled,
      updatedAt: now,
    };

    this.roles[idx] = updated;

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "role_definitions"
           SET "name" = $1, "description" = $2, "tone" = $3, "enabled" = $4, "updated_at" = $5
           WHERE "id" = $6`,
          updated.name,
          updated.description,
          updated.tone,
          updated.enabled,
          new Date(now),
          id,
        );
      } catch (err: any) {
        this.logger.error('Failed to update role_definitions in PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'role',
      'แก้ไขบทบาท',
      `แก้ไขข้อมูลบทบาท "${updated.name}" (${updated.key})`,
      actor,
    );

    return {
      ...updated,
      userCount: this.accounts.filter((a) => a.role === updated.key).length,
    };
  }

  async toggleRole(id: string, actor: Account): Promise<RoleItem> {
    const role = this.roles.find((r) => r.id === id);
    if (!role) {
      throw new NotFoundException('ไม่พบบทบาทที่ระบุ');
    }

    if (role.key === 'ADMIN' && role.enabled) {
      throw new BadRequestException('ไม่สามารถปิดการใช้งานบทบาทผู้ดูแลระบบ (ADMIN) ได้');
    }

    return this.updateRole(id, { enabled: !role.enabled }, actor);
  }

  async deleteRole(id: string, actor: Account): Promise<void> {
    const role = this.roles.find((r) => r.id === id);
    if (!role) {
      throw new NotFoundException('ไม่พบบทบาทที่ระบุ');
    }

    if (role.isSystem) {
      throw new BadRequestException('ไม่สามารถลบบทบาทของระบบ (System Role) ได้');
    }

    const userCount = this.accounts.filter((a) => a.role === role.key).length;
    if (userCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบบทบาท "${role.name}" ได้ เนื่องจากมีผู้ใช้งาน ${userCount} คนกำลังใช้บทบาทนี้อยู่ กรุณาย้ายบทบาทของผู้ใช้ก่อนลบ`,
      );
    }

    this.roles = this.roles.filter((r) => r.id !== id);

    if (this.dbAvailable) {
      try {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM "role_definitions" WHERE "id" = $1`,
          id,
        );
      } catch (err: any) {
        this.logger.error('Failed to delete role_definitions from PostgreSQL: ' + err?.message);
      }
    }

    await this.log(
      'role',
      'ลบบทบาท',
      `ลบบทบาท "${role.name}" (${role.key}) ออกจากระบบ`,
      actor,
    );
  }

  async bulkAssignRole(
    userIds: string[],
    roleKey: Role,
    actor: Account,
  ): Promise<{ updatedCount: number; errors: string[] }> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestException('กรุณาเลือกผู้ใช้งานอย่างน้อย 1 คน');
    }

    const roleDef = this.roles.find((r) => r.key === roleKey);
    if (!roleDef) {
      throw new BadRequestException(`ไม่พบบทบาท "${roleKey}" ในระบบ`);
    }

    if (!roleDef.enabled) {
      throw new BadRequestException(`บทบาท "${roleDef.name}" ถูกปิดการใช้งานอยู่ ไม่สามารถกำหนดให้ผู้ใช้ได้`);
    }

    let updatedCount = 0;
    const errors: string[] = [];

    for (const uid of userIds) {
      const user = this.accounts.find((a) => a.id === uid);
      if (!user) {
        errors.push(`ไม่พบผู้ใช้งาน ID ${uid}`);
        continue;
      }

      if (user.id === actor.id && user.role === 'ADMIN' && roleKey !== 'ADMIN') {
        errors.push(`ไม่สามารถลดระดับบทบาทตนเอง (${user.name}) ได้`);
        continue;
      }

      const prevRole = user.role;
      user.role = roleKey;
      if (DEFAULT_PERMISSIONS[roleKey]) {
        user.permissions = { ...DEFAULT_PERMISSIONS[roleKey] };
      }

      await this.persistAccount(user);
      updatedCount++;

      await this.log(
        'role',
        'กำหนดบทบาท',
        `เปลี่ยนบทบาทของ ${user.name} จาก ${prevRole} เป็น ${roleDef.name} (${roleDef.key})`,
        actor,
      );
    }

    return { updatedCount, errors };
  }

  // ===================== Document Templates Management =====================

  private initDefaultDocumentTemplates() {
    if (this.documentTemplates.length > 0) return;
    const defaultTemplates: DocumentTemplateItem[] = [
      {
        id: 'tpl-venue',
        name: 'แบบขอใช้สถานที่ราชการ',
        description: 'แบบคำขออนุญาตใช้สถานที่ราชการและสิ่งอำนวยความสะดวก',
        category: 'venue',
        status: 'published',
        currentVersion: 1,
        structure: {
          title: 'แบบขอใช้สถานที่ราชการ',
          writtenAt: 'ที่ทำการองค์การบริหารส่วนตำบล',
          writtenDate: '',
          subject: 'ขออนุญาตใช้สถานที่ราชการ',
          recipient: 'ผู้มีอำนาจอนุมัติ',
          requesterClause: 'ข้าพเจ้า',
          requesterSlots: [
            { id: 'req_name', label: 'ชื่อ-นามสกุลผู้ขอ', width: 220, binding: 'requester.name' },
            { id: 'req_pos', label: 'ตำแหน่ง', width: 160, binding: 'requester.position' },
            { id: 'req_org', label: 'หน่วยงาน/สังกัด', width: 180, binding: 'requester.organization' },
            { id: 'req_phone', label: 'เบอร์โทรศัพท์', width: 140, binding: 'requester.phone' },
          ],
          purposeText: 'มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้',
          purposeItems: [{ id: 'p1', target: '', purpose: '' }],
          closingText: 'จึงเรียนมาเพื่อโปรดพิจารณาอนุญาต',
          signatures: [
            { id: 'sig1', role: 'requester', title: 'ผู้ยื่นคำขอ' },
            { id: 'sig2', role: 'staff', title: 'เจ้าหน้าที่ผู้ตรวจสอบ' },
            { id: 'sig3', role: 'approver_l2', title: 'ผู้อนุมัติระดับ 2 (ปลัด อบต.)' },
            { id: 'sig4', role: 'approver_l1', title: 'ผู้อนุมัติระดับ 1 (นายก อบต.)' },
          ],
        },
        settings: {
          paperSize: 'A4',
          orientation: 'portrait',
          fontFamily: 'TH Sarabun New',
          fontSize: 16,
          margins: { top: 25, bottom: 25, left: 25, right: 20 },
        },
        createdBy: 'ADMIN',
        updatedBy: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl-equipment',
        name: 'แบบคำขอยืมครุภัณฑ์ราชการ',
        description: 'แบบคำขอยืม-คืนอุปกรณ์และครุภัณฑ์ของทางราชการ',
        category: 'equipment',
        status: 'published',
        currentVersion: 1,
        structure: {
          title: 'แบบคำขอยืมครุภัณฑ์ราชการ',
          writtenAt: 'ที่ทำการองค์การบริหารส่วนตำบล',
          writtenDate: '',
          subject: 'ขออนุญาตยืมอุปกรณ์และครุภัณฑ์ของทางราชการ',
          recipient: 'ผู้มีอำนาจอนุมัติ',
          requesterClause: 'ข้าพเจ้า',
          requesterSlots: [
            { id: 'req_name', label: 'ชื่อ-นามสกุลผู้ขอ', width: 220, binding: 'requester.name' },
            { id: 'req_pos', label: 'ตำแหน่ง', width: 160, binding: 'requester.position' },
            { id: 'req_org', label: 'หน่วยงาน/สังกัด', width: 180, binding: 'requester.organization' },
            { id: 'req_phone', label: 'เบอร์โทรศัพท์', width: 140, binding: 'requester.phone' },
          ],
          purposeText: 'มีความประสงค์ขอยืมอุปกรณ์และครุภัณฑ์ของทางราชการ ดังต่อไปนี้',
          purposeItems: [{ id: 'p1', target: '', purpose: '' }],
          closingText: 'ทั้งนี้ ข้าพเจ้าจะดูแลรักษาครุภัณฑ์ดังกล่าวให้อยู่ในสภาพเรียบร้อย จึงเรียนมาเพื่อโปรดพิจารณาอนุญาต',
          signatures: [
            { id: 'sig1', role: 'requester', title: 'ผู้ยื่นคำขอ' },
            { id: 'sig2', role: 'staff', title: 'เจ้าหน้าที่ผู้ตรวจสอบ' },
            { id: 'sig3', role: 'approver_l2', title: 'ผู้อนุมัติระดับ 2 (ปลัด อบต.)' },
            { id: 'sig4', role: 'approver_l1', title: 'ผู้อนุมัติระดับ 1 (นายก อบต.)' },
          ],
        },
        settings: {
          paperSize: 'A4',
          orientation: 'portrait',
          fontFamily: 'TH Sarabun New',
          fontSize: 16,
          margins: { top: 25, bottom: 25, left: 25, right: 20 },
        },
        createdBy: 'ADMIN',
        updatedBy: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl-memo',
        name: 'แบบบันทึกข้อความ',
        description: 'แบบบันทึกข้อความราชการภายใน',
        category: 'memo',
        status: 'published',
        currentVersion: 1,
        structure: {
          title: 'บันทึกข้อความ',
          writtenAt: 'ส่วนราชการ องค์การบริหารส่วนตำบล',
          writtenDate: '',
          subject: 'ข้อราชการ',
          recipient: 'ผู้มีอำนาจอนุมัติ',
          requesterClause: 'ตามที่',
          requesterSlots: [
            { id: 'req_name', label: 'ผู้รายงาน', width: 220, binding: 'requester.name' },
            { id: 'req_pos', label: 'ตำแหน่ง', width: 160, binding: 'requester.position' },
          ],
          purposeText: 'จึงขอนำเรียนรายละเอียดดังต่อไปนี้',
          purposeItems: [{ id: 'p1', target: '', purpose: '' }],
          closingText: 'จึงเรียนมาเพื่อโปรดทราบและพิจารณา',
          signatures: [
            { id: 'sig1', role: 'requester', title: 'ผู้เสนอ' },
            { id: 'sig2', role: 'staff', title: 'หัวหน้าสำนักปลัด' },
            { id: 'sig3', role: 'approver_l2', title: 'ปลัด อบต.' },
            { id: 'sig4', role: 'approver_l1', title: 'นายก อบต.' },
          ],
        },
        settings: {
          paperSize: 'A4',
          orientation: 'portrait',
          fontFamily: 'TH Sarabun New',
          fontSize: 16,
          margins: { top: 25, bottom: 25, left: 25, right: 20 },
        },
        createdBy: 'ADMIN',
        updatedBy: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl-general',
        name: 'แบบฟอร์มเอกสารทั่วไป',
        description: 'แบบฟอร์มคำร้องและเอกสารทั่วไป',
        category: 'general',
        status: 'draft',
        currentVersion: 1,
        structure: {
          title: 'แบบฟอร์มคำร้องทั่วไป',
          writtenAt: 'ที่ทำการองค์การบริหารส่วนตำบล',
          writtenDate: '',
          subject: 'ยื่นคำร้องทั่วไป',
          recipient: 'ผู้บริหารองค์การบริหารส่วนตำบล',
          requesterClause: 'ข้าพเจ้า',
          requesterSlots: [
            { id: 'req_name', label: 'ชื่อ-นามสกุลผู้ขอ', width: 220, binding: 'requester.name' },
            { id: 'req_phone', label: 'เบอร์โทรศัพท์', width: 140, binding: 'requester.phone' },
          ],
          purposeText: 'มีความประสงค์ขอยื่นคำร้องดังนี้',
          purposeItems: [{ id: 'p1', target: '', purpose: '' }],
          closingText: 'จึงเรียนมาเพื่อโปรดพิจารณา',
          signatures: [
            { id: 'sig1', role: 'requester', title: 'ผู้ยื่นคำร้อง' },
            { id: 'sig2', role: 'staff', title: 'เจ้าหน้าที่ผู้รับเรื่อง' },
          ],
        },
        settings: {
          paperSize: 'A4',
          orientation: 'portrait',
          fontFamily: 'TH Sarabun New',
          fontSize: 16,
          margins: { top: 25, bottom: 25, left: 25, right: 20 },
        },
        createdBy: 'ADMIN',
        updatedBy: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    this.documentTemplates = defaultTemplates;
    for (const t of defaultTemplates) {
      if (t.status === 'published') {
        this.documentTemplateVersions.push({
          id: `ver-${t.id}-1`,
          templateId: t.id,
          version: 1,
          structure: clone(t.structure),
          settings: clone(t.settings),
          note: 'เวอร์ชันแรกเริ่มต้นระบบ',
          publishedAt: t.createdAt,
          publishedBy: 'ADMIN',
        });
      }
    }
  }

  listDocumentTemplates(query?: { category?: string; status?: string; search?: string }): DocumentTemplateItem[] {
    let list = clone(this.documentTemplates);
    if (query?.category && query.category !== 'all') {
      list = list.filter((t: DocumentTemplateItem) => t.category === query.category);
    }
    if (query?.status && query.status !== 'all') {
      list = list.filter((t: DocumentTemplateItem) => t.status === query.status);
    }
    if (query?.search) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (t: DocumentTemplateItem) =>
          t.name.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)),
      );
    }
    return list.sort(
      (a: DocumentTemplateItem, b: DocumentTemplateItem) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  getDocumentTemplateById(id: string): DocumentTemplateItem {
    const t = this.documentTemplates.find((x) => x.id === id);
    if (!t) {
      throw new NotFoundException(`ไม่พบแม่แบบเอกสารรหัส ${id}`);
    }
    return clone(t);
  }

  createDocumentTemplate(
    dto: Partial<DocumentTemplateItem> & { name: string; category?: DocumentTemplateCategory },
    actor: Account,
  ): DocumentTemplateItem {
    const id = `tpl-${Date.now()}`;
    const now = new Date().toISOString();
    const newTemplate: DocumentTemplateItem = {
      id,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      category: dto.category || 'venue',
      status: dto.status || 'draft',
      currentVersion: 1,
      structure: dto.structure || {
        title: dto.name.trim(),
        writtenAt: 'ที่ทำการองค์การบริหารส่วนตำบล',
        writtenDate: '',
        subject: 'ขออนุญาต...',
        recipient: 'ผู้มีอำนาจอนุมัติ',
        requesterClause: 'ข้าพเจ้า',
        requesterSlots: [
          { id: 's1', label: 'ชื่อ-นามสกุลผู้ขอ', width: 220, binding: 'requester.name' },
        ],
        purposeText: 'มีความประสงค์ขออนุญาต ดังนี้',
        purposeItems: [{ id: 'p1', target: '', purpose: '' }],
        closingText: 'จึงเรียนมาเพื่อโปรดพิจารณาอนุญาต',
        signatures: [
          { id: 'sig1', role: 'requester', title: 'ผู้ยื่นคำขอ' },
          { id: 'sig2', role: 'staff', title: 'เจ้าหน้าที่ผู้ตรวจสอบ' },
          { id: 'sig3', role: 'approver_l2', title: 'ผู้อนุมัติระดับ 2 (ปลัด อบต.)' },
          { id: 'sig4', role: 'approver_l1', title: 'ผู้อนุมัติระดับ 1 (นายก อบต.)' },
        ],
      },
      settings: dto.settings || {
        paperSize: 'A4',
        orientation: 'portrait',
        fontFamily: 'TH Sarabun New',
        fontSize: 16,
        margins: { top: 25, bottom: 25, left: 25, right: 20 },
      },
      createdBy: actor.name,
      updatedBy: actor.name,
      createdAt: now,
      updatedAt: now,
    };

    this.documentTemplates.unshift(newTemplate);
    this.persistDocumentTemplate(newTemplate).catch(() => {});
    return clone(newTemplate);
  }

  updateDocumentTemplate(
    id: string,
    dto: Partial<DocumentTemplateItem>,
    actor: Account,
  ): DocumentTemplateItem {
    const idx = this.documentTemplates.findIndex((x) => x.id === id);
    if (idx === -1) {
      throw new NotFoundException(`ไม่พบแม่แบบเอกสารรหัส ${id}`);
    }
    const cur = this.documentTemplates[idx];
    const updated: DocumentTemplateItem = {
      ...cur,
      ...dto,
      name: dto.name !== undefined ? dto.name.trim() : cur.name,
      description: dto.description !== undefined ? dto.description : cur.description,
      structure: dto.structure ? clone(dto.structure) : cur.structure,
      settings: dto.settings ? clone(dto.settings) : cur.settings,
      updatedBy: actor.name,
      updatedAt: new Date().toISOString(),
    };
    this.documentTemplates[idx] = updated;
    this.persistDocumentTemplate(updated).catch(() => {});
    return clone(updated);
  }

  duplicateDocumentTemplate(id: string, actor: Account): DocumentTemplateItem {
    const orig = this.getDocumentTemplateById(id);
    const newId = `tpl-${Date.now()}`;
    const now = new Date().toISOString();
    const dup: DocumentTemplateItem = {
      ...clone(orig),
      id: newId,
      name: `${orig.name} (สำเนา)`,
      status: 'draft',
      currentVersion: 1,
      createdBy: actor.name,
      updatedBy: actor.name,
      createdAt: now,
      updatedAt: now,
    };
    this.documentTemplates.unshift(dup);
    this.persistDocumentTemplate(dup).catch(() => {});
    return clone(dup);
  }

  publishDocumentTemplate(id: string, note: string | undefined, actor: Account): DocumentTemplateItem {
    const idx = this.documentTemplates.findIndex((x) => x.id === id);
    if (idx === -1) {
      throw new NotFoundException(`ไม่พบแม่แบบเอกสารรหัส ${id}`);
    }
    const cur = this.documentTemplates[idx];
    const nextVersion = cur.status === 'published' ? cur.currentVersion + 1 : cur.currentVersion;
    const now = new Date().toISOString();

    const updated: DocumentTemplateItem = {
      ...cur,
      status: 'published',
      currentVersion: nextVersion,
      updatedBy: actor.name,
      updatedAt: now,
    };
    this.documentTemplates[idx] = updated;
    this.persistDocumentTemplate(updated).catch(() => {});

    // Archive old snapshot into DocumentTemplateVersion
    const versionItem: DocumentTemplateVersionItem = {
      id: `ver-${cur.id}-${nextVersion}`,
      templateId: cur.id,
      version: nextVersion,
      structure: clone(cur.structure),
      settings: clone(cur.settings),
      note: note?.trim() || `Published version ${nextVersion}`,
      publishedAt: now,
      publishedBy: actor.name,
    };
    this.documentTemplateVersions.push(versionItem);

    return clone(updated);
  }

  archiveDocumentTemplate(id: string, actor: Account): DocumentTemplateItem {
    return this.updateDocumentTemplate(id, { status: 'archived' }, actor);
  }

  deleteDocumentTemplate(id: string, actor: Account): { success: boolean; id: string } {
    const idx = this.documentTemplates.findIndex((x) => x.id === id);
    if (idx === -1) {
      throw new NotFoundException(`ไม่พบแม่แบบเอกสารรหัส ${id}`);
    }
    const t = this.documentTemplates[idx];
    // Check if this template is in use by generated documents
    const inUse = this.generatedDocuments.some((g) => g.templateId === id);
    if (inUse) {
      throw new BadRequestException('ไม่สามารถลบแม่แบบเอกสารนี้ได้ เนื่องจากถูกนำไปสร้างเอกสารคำขอแล้ว กรุณาเลือกจัดเก็บ (Archive) แทน');
    }
    this.documentTemplates.splice(idx, 1);
    this.documentTemplateVersions = this.documentTemplateVersions.filter((v) => v.templateId !== id);
    this.persistDeleteDocumentTemplate(id).catch(() => {});
    return { success: true, id };
  }

  async persistDocumentTemplate(t: DocumentTemplateItem) {
    if (!this.dbAvailable) return;
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "document_templates" ("id", "name", "description", "category", "status", "current_version", "structure", "settings", "created_by", "updated_by", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::timestamptz, CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO UPDATE SET
           "name" = EXCLUDED."name",
           "description" = EXCLUDED."description",
           "category" = EXCLUDED."category",
           "status" = EXCLUDED."status",
           "current_version" = EXCLUDED."current_version",
           "structure" = EXCLUDED."structure",
           "settings" = EXCLUDED."settings",
           "updated_by" = EXCLUDED."updated_by",
           "updated_at" = CURRENT_TIMESTAMP`,
        t.id,
        t.name,
        t.description || '',
        t.category,
        t.status,
        t.currentVersion,
        JSON.stringify(t.structure),
        JSON.stringify(t.settings),
        t.createdBy || 'ADMIN',
        t.updatedBy || 'ADMIN',
        t.createdAt,
      );
    } catch (err) {
      this.logger.debug('Failed to persist document template: ' + err);
    }
  }

  async persistDeleteDocumentTemplate(id: string) {
    if (!this.dbAvailable) return;
    try {
      await this.prisma.$executeRawUnsafe(`DELETE FROM "document_templates" WHERE "id" = $1`, id);
    } catch (err) {
      this.logger.debug('Failed to delete document template: ' + err);
    }
  }

  listTemplateVersions(templateId: string): DocumentTemplateVersionItem[] {
    return clone(
      this.documentTemplateVersions.filter((v) => v.templateId === templateId),
    ).sort((a: DocumentTemplateVersionItem, b: DocumentTemplateVersionItem) => b.version - a.version);
  }

  getTemplateVersion(templateId: string, version: number): DocumentTemplateVersionItem {
    const v = this.documentTemplateVersions.find(
      (x) => x.templateId === templateId && x.version === version,
    );
    if (!v) {
      throw new NotFoundException(`ไม่พบเวอร์ชัน ${version} ของแม่แบบรหัส ${templateId}`);
    }
    return clone(v);
  }

  rollbackTemplateVersion(templateId: string, version: number, actor: Account): DocumentTemplateItem {
    const ver = this.getTemplateVersion(templateId, version);
    const updated = this.updateDocumentTemplate(
      templateId,
      {
        structure: clone(ver.structure),
        settings: clone(ver.settings),
      },
      actor,
    );
    return updated;
  }

  // ===================== Generated Documents Management =====================

  listGeneratedDocuments(query?: { requestId?: string; search?: string }): GeneratedDocumentItem[] {
    let list = clone(this.generatedDocuments);
    if (query?.requestId) {
      list = list.filter((g: GeneratedDocumentItem) => g.requestId === query.requestId);
    }
    if (query?.search) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (g: GeneratedDocumentItem) =>
          g.documentNumber.toLowerCase().includes(q) ||
          g.snapshot.title.toLowerCase().includes(q),
      );
    }
    return list.sort(
      (a: GeneratedDocumentItem, b: GeneratedDocumentItem) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  getGeneratedDocumentById(id: string): GeneratedDocumentItem {
    const doc = this.generatedDocuments.find((x) => x.id === id);
    if (!doc) {
      throw new NotFoundException(`ไม่พบเอกสารรหัส ${id}`);
    }
    return clone(doc);
  }

  createGeneratedDocument(
    dto: {
      templateId: string;
      requestId: string;
      documentNumber?: string;
    },
    actor: Account,
  ): GeneratedDocumentItem {
    const template = this.getDocumentTemplateById(dto.templateId);
    const request = this.requests.find((r) => r.id === dto.requestId);
    if (!request) {
      throw new NotFoundException(`ไม่พบคำขอรหัส ${dto.requestId}`);
    }

    const docNum = dto.documentNumber || `DOC-${Date.now()}`;
    const id = `gdoc-${Date.now()}`;
    const now = new Date().toISOString();

    // Map snapshot with real booking/request data
    const snapshot = clone(template.structure);
    if (snapshot) {
      snapshot.writtenAt = request.writtenAt || snapshot.writtenAt || 'ที่ทำการองค์การบริหารส่วนตำบล';
      snapshot.subject = request.type === 'borrow' ? 'ขออนุญาตใช้อุปกรณ์ของทางราชการ' : (snapshot.subject || 'ขออนุญาตใช้สถานที่ราชการ');
      snapshot.recipient = snapshot.recipient || 'ผู้มีอำนาจอนุมัติ';
      
      // Hydrate requester slots with real values
      if (Array.isArray(snapshot.requesterSlots)) {
        snapshot.requesterSlots = snapshot.requesterSlots.map((s: any) => {
          let val = '';
          if (s.binding === 'requester.name') val = request.requesterName;
          else if (s.binding === 'requester.position') val = request.requesterPosition || '';
          else if (s.binding === 'requester.organization') val = request.organization || '';
          else if (s.binding === 'requester.phone') val = request.requesterPhone || '';
          else if (s.binding === 'requester.address') val = request.addressHouseNo || '';
          return { ...s, value: val };
        });
      }

      // Hydrate custom slots with real values
      if (Array.isArray(snapshot.customSlots)) {
        snapshot.customSlots = snapshot.customSlots.map((s: any) => {
          let val = '';
          if (s.fieldKey === 'requester_name') val = request.requesterName;
          else if (s.fieldKey === 'requester_position') val = request.requesterPosition || '';
          else if (s.fieldKey === 'organization') val = request.organization || '';
          else if (s.fieldKey === 'requester_phone') val = request.requesterPhone || '';
          else if (s.fieldKey === 'purpose') val = (request as any).purpose || '';
          return { ...s, value: val };
        });
      }
    }

    const generated: GeneratedDocumentItem = {
      id,
      templateId: template.id,
      templateVersionId: `ver-${template.id}-${template.currentVersion}`,
      requestId: request.id,
      documentNumber: docNum,
      snapshot,
      status: 'rendered',
      createdAt: now,
    };

    this.generatedDocuments.unshift(generated);
    return clone(generated);
  }
}
