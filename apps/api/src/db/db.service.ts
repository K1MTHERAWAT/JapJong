import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
} from '@japjong/shared';
import {
  mockAccounts,
  mockActivities,
  mockEquipment,
  mockNotifications,
  mockRequests,
  mockVenues,
} from '../demo-data';
import { hashSecret } from '../auth/secret';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  // แปลง Supabase Direct Host (db.<ref>.supabase.co ซึ่งเป็น IPv6-only)
  // ให้เป็น Supabase Session Pooler (IPv4) อัตโนมัติ เพื่อให้ Railway / Cloud ที่ไม่มี IPv6 เชื่อมต่อฐานข้อมูลจริงได้
  const m = /^(postgresql:\/\/)postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co:5432\/(.*)$/i.exec(raw.trim());
  if (m) {
    const [, proto, pass, projectRef, rest] = m;
    const region = process.env.SUPABASE_POOLER_REGION || 'ap-northeast-1';
    return `${proto}postgres.${projectRef}:${pass}@aws-0-${region}.pooler.supabase.com:5432/${rest}`;
  }
  return raw;
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

  private seq = { BK: 0, BR: 0, RP: 0, n: 0, l: 0, u: 100, v: 100, e: 100 };
  private resetCronTimer?: NodeJS.Timeout;
  private lastDemoResetDateUtc?: string;
  dbAvailable = false;
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
           ADD COLUMN IF NOT EXISTS "email" TEXT,
           ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "venues"
           ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "equipments"
           ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
        `ALTER TABLE "requests"
           ADD COLUMN IF NOT EXISTS "requester_phone" TEXT`,
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
           "otp_hash" TEXT NOT NULL,
           "expires_at" TIMESTAMPTZ(3) NOT NULL,
           "consumed_at" TIMESTAMPTZ(3),
           "failed_attempts" INTEGER NOT NULL DEFAULT 0,
           "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
        `CREATE TABLE IF NOT EXISTS "sign_verified_sessions" (
           "id" TEXT PRIMARY KEY,
           "account_id" TEXT NOT NULL,
           "session_token" TEXT NOT NULL,
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
      ];
      for (const stmt of initStatements) {
        await this.prisma.$executeRawUnsafe(stmt).catch((err: any) => {
          this.logger.debug('Schema init notice: ' + (err?.message || err));
        });
      }
      const count = await this.prisma.account.count();
      if (count === 0) {
        if (process.env.DEMO_MODE === 'true' || process.env.SEED_DEMO === 'true') {
          this.logger.log('DEMO_MODE=true: Seeding demo data into PostgreSQL...');
          await this.seedDatabase();
        } else {
          this.logger.log('Seeding initial production admin account into PostgreSQL...');
          await this.seedProductionAdmin();
        }
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
    this.handovers = [];
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
      pickupDate: r.type === 'borrow' ? new Date(`${r.pickupDate}T00:00:00.000Z`) : null,
      returnDate: r.type === 'borrow' ? new Date(`${r.returnDate}T00:00:00.000Z`) : null,
      returnRequestedAt: r.type === 'borrow' && r.returnRequestedAt ? new Date(r.returnRequestedAt) : null,
      returnedAt: r.type === 'borrow' && r.returnedAt ? new Date(r.returnedAt) : null,
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
      repairAcceptedAt: r.type === 'repair' && r.acceptedAt ? new Date(r.acceptedAt) : null,
      repairStartedAt: r.type === 'repair' && r.startedAt ? new Date(r.startedAt) : null,
      repairFinishedAt: r.type === 'repair' && r.finishedAt ? new Date(r.finishedAt) : null,
      repairAcceptedByReqAt:
        r.type === 'repair' && r.acceptedByRequesterAt ? new Date(r.acceptedByRequesterAt) : null,
      createdByStaffId: r.createdByStaffId ?? null,
      createdByStaffSignature: r.createdByStaffSignature ?? null,
      rejectReason: r.rejectReason ?? null,
      approvalRound: r.approvalRound ?? 1,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };

    await this.prisma.$transaction(async (tx: any) => {
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
        if (itemList.length > 0) {
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

    await this.prisma.$executeRaw`
      UPDATE "requests" SET "requester_phone" = ${r.requesterPhone ?? null} WHERE "id" = ${r.id}
    `.catch(() => {});
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
        (this.prisma.$queryRaw`SELECT "id", "address_house_no", "address_moo", "address_subdistrict", "address_district", "address_province", "email", "email_verified" FROM "accounts"` as Promise<
          {
            id: string;
            address_house_no: string | null;
            address_moo: string | null;
            address_subdistrict: string | null;
            address_district: string | null;
            address_province: string | null;
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
    let reqPhoneMap = new Map<string, string>();
    try {
      const [vRows, eRows, rPhoneRows] = await Promise.all([
        this.prisma.$queryRaw<{ id: string; images: string[] | null }[]>`SELECT "id", "images" FROM "venues"`,
        this.prisma.$queryRaw<{ id: string; images: string[] | null }[]>`SELECT "id", "images" FROM "equipments"`,
        this.prisma.$queryRaw<{ id: string; requester_phone: string | null }[]>`SELECT "id", "requester_phone" FROM "requests"`,
      ]);
      venueImagesMap = new Map((vRows || []).map((r) => [r.id, Array.isArray(r.images) ? r.images : []]));
      equipmentImagesMap = new Map((eRows || []).map((r) => [r.id, Array.isArray(r.images) ? r.images : []]));
      reqPhoneMap = new Map((rPhoneRows || []).filter((r) => r.requester_phone).map((r) => [r.id, r.requester_phone as string]));
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
      const base = {
        id: r.id,
        code: r.code,
        status: r.status,
        requesterId: r.requesterId,
        requesterName: r.requesterName,
        requesterPhone: reqPhoneMap.get(r.id) ?? undefined,
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

    await this.syncSequences();
    await this.cleanExpiredSessions();
  }
}
