import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load apps/api/.env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const sourceUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const targetUrl = process.argv[2] || process.env.RAILWAY_DATABASE_URL;

if (!sourceUrl) {
  console.error('❌ ไม่พบ SUPABASE_DATABASE_URL หรือ DATABASE_URL ต้นทางใน apps/api/.env');
  process.exit(1);
}

if (!targetUrl) {
  console.error(
    '❌ กรุณาระบุ DATABASE_PUBLIC_URL ของ Railway:\n' +
      '   วิธีที่ 1: ตั้งค่า RAILWAY_DATABASE_URL="postgresql://..." ใน apps/api/.env\n' +
      '   วิธีที่ 2: รัน pnpm --filter @japjong/api prisma:migrate-railway "postgresql://postgres:..."',
  );
  process.exit(1);
}

if (sourceUrl === targetUrl) {
  console.error('❌ URL ต้นทาง (Supabase) และปลายทาง (Railway) เป็น URL เดียวกัน กรุณาตรวจสอบอีกครั้ง');
  process.exit(1);
}

const sourcePrisma = new PrismaClient({
  datasources: { db: { url: sourceUrl } },
});

const targetPrisma = new PrismaClient({
  datasources: { db: { url: targetUrl } },
});

async function runSqlStatements(prisma: PrismaClient, sql: string) {
  const statements = sql
    .split(/;\s*\r?\n/)
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('already exists') ||
        msg.includes('42710') ||
        msg.includes('42P07') ||
        msg.includes('42701')
      ) {
        continue;
      }
      throw err;
    }
  }
}

async function runSqlFile(prisma: PrismaClient, filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf-8');
  await runSqlStatements(prisma, sql);
}

async function applySchemaToTarget(prisma: PrismaClient) {
  console.log('📦 [1/3] กำลังสร้างโครงสร้างตาราง (Schema & Migrations) บน Railway...');

  const mig1 = path.resolve(__dirname, 'migrations/20261026091613_init/migration.sql');
  const mig2 = path.resolve(
    __dirname,
    'migrations/20261028080000_add_sessions_sequences_otp_sod_audit/migration.sql',
  );
  const mig8 = path.resolve(__dirname, 'migrations/20261104060000_phase5_rich_menu_flex/migration.sql');

  await runSqlFile(prisma, mig1);
  await runSqlFile(prisma, mig2);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "accounts"
      ADD COLUMN IF NOT EXISTS "address_house_no" TEXT,
      ADD COLUMN IF NOT EXISTS "address_moo" TEXT,
      ADD COLUMN IF NOT EXISTS "address_subdistrict" TEXT,
      ADD COLUMN IF NOT EXISTS "address_district" TEXT,
      ADD COLUMN IF NOT EXISTS "address_province" TEXT,
      ADD COLUMN IF NOT EXISTS "email" TEXT,
      ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "registration_completed_at" TIMESTAMPTZ(3),
      ADD COLUMN IF NOT EXISTS "account_status" TEXT NOT NULL DEFAULT 'ACTIVE';
  `);

  await prisma
    .$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "VerificationStatus" AS ENUM ('VALID', 'REVOKED', 'INVALID');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `)
    .catch(() => {});

  await runSqlStatements(
    prisma,
    `
    CREATE TABLE IF NOT EXISTS "document_verifications" (
      "id" TEXT PRIMARY KEY,
      "document_id" TEXT NOT NULL,
      "verification_token" TEXT NOT NULL UNIQUE,
      "document_number" TEXT NOT NULL,
      "document_hash" TEXT NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1,
      "status" "VerificationStatus" NOT NULL DEFAULT 'VALID',
      "document_type" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT '',
      "issuing_org" TEXT NOT NULL DEFAULT 'องค์การบริหารส่วนตำบลน้ำชำ',
      "metadata" JSONB,
      "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "revoked_at" TIMESTAMPTZ(3),
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "document_scan_logs" (
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
    );

    CREATE INDEX IF NOT EXISTS "document_verifications_document_id_idx" ON "document_verifications"("document_id");
    CREATE INDEX IF NOT EXISTS "document_verifications_token_idx" ON "document_verifications"("verification_token");
    CREATE INDEX IF NOT EXISTS "document_verifications_doc_no_idx" ON "document_verifications"("document_number");
    CREATE INDEX IF NOT EXISTS "document_scan_logs_verification_id_idx" ON "document_scan_logs"("verification_id");
    CREATE INDEX IF NOT EXISTS "document_scan_logs_scanned_at_idx" ON "document_scan_logs"("scanned_at");

    CREATE TABLE IF NOT EXISTS "sign_otp_codes" (
      "id" TEXT PRIMARY KEY,
      "account_id" TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
      "email" TEXT NOT NULL,
      "code_hash" TEXT NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "expires_at" TIMESTAMPTZ(3) NOT NULL,
      "consumed_at" TIMESTAMPTZ(3),
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "sign_verified_sessions" (
      "id" TEXT PRIMARY KEY,
      "account_id" TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
      "session_token" TEXT NOT NULL,
      "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expires_at" TIMESTAMPTZ(3) NOT NULL,
      "revoked_at" TIMESTAMPTZ(3),
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "sign_otp_codes_account_id_idx" ON "sign_otp_codes"("account_id");
    CREATE INDEX IF NOT EXISTS "sign_otp_codes_expires_at_idx" ON "sign_otp_codes"("expires_at");
    CREATE INDEX IF NOT EXISTS "sign_verified_sessions_acc_token_idx" ON "sign_verified_sessions"("account_id", "session_token");
    CREATE INDEX IF NOT EXISTS "sign_verified_sessions_expires_at_idx" ON "sign_verified_sessions"("expires_at");

    ALTER TABLE "sign_otp_codes"
      DROP COLUMN IF EXISTS "otp_hash",
      DROP COLUMN IF EXISTS "failed_attempts",
      ADD COLUMN IF NOT EXISTS "code_hash" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE "sign_verified_sessions"
      ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS "user_line_accounts" (
      "id" TEXT PRIMARY KEY,
      "user_id" TEXT NOT NULL UNIQUE REFERENCES "accounts"("id") ON DELETE CASCADE,
      "line_user_id" TEXT NOT NULL UNIQUE,
      "display_name" TEXT NOT NULL,
      "picture_url" TEXT,
      "friendship_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
      "status_updated_at" TIMESTAMPTZ(3),
      "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "user_line_accounts_user_id_idx" ON "user_line_accounts"("user_id");
    CREATE INDEX IF NOT EXISTS "user_line_accounts_line_user_id_idx" ON "user_line_accounts"("line_user_id");

    CREATE TABLE IF NOT EXISTS "user_consents" (
      "id" TEXT PRIMARY KEY,
      "user_id" TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
      "consent_type" TEXT NOT NULL,
      "consent_version" TEXT NOT NULL,
      "consent_status" TEXT NOT NULL,
      "consented_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "withdrawn_at" TIMESTAMPTZ(3),
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "user_consents_user_id_idx" ON "user_consents"("user_id");
    CREATE INDEX IF NOT EXISTS "user_consents_type_ver_idx" ON "user_consents"("consent_type", "consent_version");

    ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "notification_type" TEXT NOT NULL DEFAULT 'SYSTEM',
      ADD COLUMN IF NOT EXISTS "reference_type" TEXT,
      ADD COLUMN IF NOT EXISTS "reference_id" TEXT,
      ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMPTZ(3);

    CREATE INDEX IF NOT EXISTS "notifications_ref_idx" ON "notifications"("reference_type", "reference_id");

    CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
      "id" TEXT PRIMARY KEY,
      "user_id" TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
      "channel" TEXT NOT NULL,
      "notification_type" TEXT NOT NULL,
      "is_enabled" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("user_id", "channel", "notification_type")
    );

    CREATE INDEX IF NOT EXISTS "user_notification_preferences_user_id_idx" ON "user_notification_preferences"("user_id");

    CREATE TABLE IF NOT EXISTS "line_notification_logs" (
      "id" TEXT PRIMARY KEY,
      "user_id" TEXT NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
      "notification_id" TEXT REFERENCES "notifications"("id") ON DELETE SET NULL,
      "line_user_id" TEXT NOT NULL,
      "notification_type" TEXT NOT NULL,
      "event_key" TEXT UNIQUE,
      "reference_type" TEXT,
      "reference_id" TEXT,
      "message_payload" JSONB,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "provider_message_id" TEXT,
      "error_code" TEXT,
      "error_message" TEXT,
      "attempt_count" INTEGER NOT NULL DEFAULT 0,
      "next_retry_at" TIMESTAMPTZ(3),
      "sent_at" TIMESTAMPTZ(3),
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "line_notification_logs_user_id_idx" ON "line_notification_logs"("user_id");
    CREATE INDEX IF NOT EXISTS "line_notification_logs_status_idx" ON "line_notification_logs"("status");
    CREATE INDEX IF NOT EXISTS "line_notification_logs_created_at_idx" ON "line_notification_logs"("created_at");

    CREATE TABLE IF NOT EXISTS "line_webhook_events" (
      "id" TEXT PRIMARY KEY,
      "webhook_event_id" TEXT NOT NULL UNIQUE,
      "event_type" TEXT NOT NULL,
      "line_user_id" TEXT,
      "event_timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "processed_at" TIMESTAMPTZ(3),
      "processing_status" TEXT NOT NULL DEFAULT 'PROCESSED',
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "line_webhook_events_line_user_id_idx" ON "line_webhook_events"("line_user_id");
    CREATE INDEX IF NOT EXISTS "line_webhook_events_created_at_idx" ON "line_webhook_events"("created_at");
  `,
  );

  if (fs.existsSync(mig8)) {
    await runSqlFile(prisma, mig8);
  }

  console.log('✅ สร้างโครงสร้างตารางบน Railway สำเร็จ!');
}

async function copyTable<T>(
  label: string,
  fetchFn: () => Promise<T[]>,
  insertFn: (rows: T[]) => Promise<{ count: number }>,
) {
  let rows: T[];
  try {
    rows = await fetchFn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️ ${label}: ข้ามการดึงจากต้นทาง (${msg.split('\n').pop()})`);
    return;
  }
  if (rows.length === 0) {
    console.log(`   - ${label}: 0 รายการ (ข้าม)`);
    return;
  }
  try {
    const res = await insertFn(rows);
    console.log(`   - ${label}: ดึงมา ${rows.length} รายการ -> นำเข้าใหม่ ${res.count} รายการ`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️ ${label}: ข้ามการนำเข้าปลายทาง (${msg.split('\n').pop()})`);
  }
}

async function main() {
  console.log('🔌 กำลังเชื่อมต่อ Supabase (ต้นทาง) และ Railway (ปลายทาง)...');
  await sourcePrisma.$connect();
  await targetPrisma.$connect();
  console.log('✅ เชื่อมต่อทั้ง 2 ฐานข้อมูลสำเร็จ!');

  await applySchemaToTarget(targetPrisma);

  console.log('🚚 [2/3] กำลังคัดลอกข้อมูลทุกตารางจาก Supabase ไปยัง Railway...');

  await copyTable(
    'accounts',
    () => sourcePrisma.account.findMany(),
    (data) => targetPrisma.account.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'venues',
    () => sourcePrisma.venue.findMany(),
    (data) => targetPrisma.venue.createMany({ data, skipDuplicates: true }),
  );
  try {
    const venueImages = await sourcePrisma.$queryRawUnsafe<{ id: string; images: string[] }[]>(
      'SELECT id, images FROM venues WHERE images IS NOT NULL',
    );
    for (const v of venueImages) {
      if (v.images && v.images.length > 0) {
        await targetPrisma.$executeRawUnsafe('UPDATE venues SET images = $1 WHERE id = $2', v.images, v.id);
      }
    }
  } catch {}

  await copyTable(
    'equipments',
    () => sourcePrisma.equipment.findMany(),
    (data) => targetPrisma.equipment.createMany({ data, skipDuplicates: true }),
  );
  try {
    const equipImages = await sourcePrisma.$queryRawUnsafe<{ id: string; images: string[] }[]>(
      'SELECT id, images FROM equipments WHERE images IS NOT NULL',
    );
    for (const e of equipImages) {
      if (e.images && e.images.length > 0) {
        await targetPrisma.$executeRawUnsafe('UPDATE equipments SET images = $1 WHERE id = $2', e.images, e.id);
      }
    }
  } catch {}

  await copyTable(
    'sequences',
    () => sourcePrisma.sequence.findMany(),
    (data) => targetPrisma.sequence.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'otp_codes',
    () => sourcePrisma.otpCode.findMany(),
    (data) => targetPrisma.otpCode.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'line_webhook_events',
    () => sourcePrisma.lineWebhookEvent.findMany(),
    (data) => targetPrisma.lineWebhookEvent.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'rich_menus',
    () => sourcePrisma.richMenu.findMany(),
    (data) => targetPrisma.richMenu.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'rich_menu_actions',
    () => sourcePrisma.richMenuAction.findMany(),
    (data) => targetPrisma.richMenuAction.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'flex_message_templates',
    () => sourcePrisma.flexMessageTemplate.findMany(),
    (data) => targetPrisma.flexMessageTemplate.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'sessions',
    () => sourcePrisma.session.findMany(),
    (data) => targetPrisma.session.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'activity_logs',
    () => sourcePrisma.activityLog.findMany(),
    (data) => targetPrisma.activityLog.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'sign_otp_codes',
    () => sourcePrisma.signOtpCode.findMany(),
    (data) => targetPrisma.signOtpCode.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'sign_verified_sessions',
    () => sourcePrisma.signVerifiedSession.findMany(),
    (data) => targetPrisma.signVerifiedSession.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'user_line_accounts',
    () => sourcePrisma.userLineAccount.findMany(),
    (data) => targetPrisma.userLineAccount.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'user_consents',
    () => sourcePrisma.userConsent.findMany(),
    (data) => targetPrisma.userConsent.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'user_notification_preferences',
    () => sourcePrisma.userNotificationPreference.findMany(),
    (data) => targetPrisma.userNotificationPreference.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'notifications',
    () => sourcePrisma.notification.findMany(),
    (data) => targetPrisma.notification.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'line_notification_logs',
    () => sourcePrisma.lineNotificationLog.findMany(),
    (data) => targetPrisma.lineNotificationLog.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'requests',
    () => sourcePrisma.request.findMany(),
    (data) => targetPrisma.request.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'request_venues',
    () => sourcePrisma.requestVenue.findMany(),
    (data) => targetPrisma.requestVenue.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'request_periods',
    () => sourcePrisma.requestPeriod.findMany(),
    (data) => targetPrisma.requestPeriod.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'request_items',
    () => sourcePrisma.requestItem.findMany(),
    (data) => targetPrisma.requestItem.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'signature_records',
    () => sourcePrisma.signatureRecord.findMany(),
    (data) => targetPrisma.signatureRecord.createMany({ data, skipDuplicates: true }),
  );

  await copyTable(
    'handover_records',
    () => sourcePrisma.handoverRecord.findMany(),
    (data) => targetPrisma.handoverRecord.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'document_verifications',
    () => sourcePrisma.documentVerification.findMany(),
    (data) => targetPrisma.documentVerification.createMany({ data: data as any, skipDuplicates: true }),
  );

  await copyTable(
    'document_scan_logs',
    () => sourcePrisma.documentScanLog.findMany(),
    (data) => targetPrisma.documentScanLog.createMany({ data, skipDuplicates: true }),
  );

  console.log('🔢 [3/3] กำลังซิงค์ค่า Auto-increment Sequence บน Railway...');
  const seqTables = ['request_periods', 'request_items', 'signature_records', 'handover_records'];
  for (const tbl of seqTables) {
    await targetPrisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${tbl}"', 'id'),
        COALESCE((SELECT MAX("id") FROM "${tbl}"), 1),
        (SELECT COUNT(*) > 0 FROM "${tbl}")
      );
    `);
  }

  console.log('🎉 ย้ายโครงสร้างตารางและข้อมูลทั้งหมดจาก Supabase มายัง Railway สำเร็จเรียบร้อย!');
}

main()
  .catch((err) => {
    console.error('❌ การย้ายข้อมูลล้มเหลว:', err);
    process.exit(1);
  })
  .finally(async () => {
    await sourcePrisma.$disconnect();
    await targetPrisma.$disconnect();
  });
