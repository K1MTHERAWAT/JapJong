import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load apps/api/.env if DATABASE_URL not set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) {
        const key = m[1];
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const prisma = new PrismaClient();

async function runSqlStatements(sql: string) {
  const statements = sql
    .split(/;\s*\r?\n/)
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('42710') || msg.includes('42P07') || msg.includes('42701')) {
        continue;
      }
      throw err;
    }
  }
}

async function runSqlFile(filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf-8');
  await runSqlStatements(sql);
}

async function main() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');
  await prisma.$connect();
  console.log('✅ Connected to Supabase!');

  const mig1 = path.resolve(__dirname, 'migrations/20261026091613_init/migration.sql');
  const mig2 = path.resolve(__dirname, 'migrations/20261028080000_add_sessions_sequences_otp_sod_audit/migration.sql');

  console.log('📦 Applying migration 1 (init)...');
  await runSqlFile(mig1);
  console.log('📦 Applying migration 2 (sessions, sequences, otp, audit)...');
  await runSqlFile(mig2);

  console.log('📦 Applying account address columns...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "accounts"
      ADD COLUMN IF NOT EXISTS "address_house_no" TEXT,
      ADD COLUMN IF NOT EXISTS "address_moo" TEXT,
      ADD COLUMN IF NOT EXISTS "address_subdistrict" TEXT,
      ADD COLUMN IF NOT EXISTS "address_district" TEXT,
      ADD COLUMN IF NOT EXISTS "address_province" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "accounts"
    SET "address_house_no" = '124/5',
        "address_moo" = '3',
        "address_subdistrict" = 'น้ำชำ',
        "address_district" = 'สูงเม่น',
        "address_province" = 'แพร่'
    WHERE "id" = 'u-somchai' AND "address_house_no" IS NULL;
  `);

  console.log('📦 Applying migration 3 (document_verifications & document_scan_logs)...');
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "VerificationStatus" AS ENUM ('VALID', 'REVOKED', 'INVALID');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `).catch(() => {});

  await runSqlStatements(`
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
  `);

  console.log('📦 Applying migration 4 (accounts email & sign_otp_codes & sign_verified_sessions)...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "accounts"
      ADD COLUMN IF NOT EXISTS "email" TEXT,
      ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN DEFAULT false;
  `);

  // Set default demo emails
  await runSqlStatements(`
    UPDATE "accounts" SET "email" = 'suda@namcham.go.th', "email_verified" = true WHERE "id" = 's-suda' AND "email" IS NULL;
    UPDATE "accounts" SET "email" = 'wichai@namcham.go.th', "email_verified" = true WHERE "id" = 'a-wichai' AND "email" IS NULL;
    UPDATE "accounts" SET "email" = 'prasert@namcham.go.th', "email_verified" = true WHERE "id" = 'a-prasert' AND "email" IS NULL;
    UPDATE "accounts" SET "email" = 'admin@namcham.go.th', "email_verified" = true WHERE "id" = 'ad-admin' AND "email" IS NULL;
    UPDATE "accounts" SET "email" = 'somchai@namcham.go.th', "email_verified" = true WHERE "id" = 'u-somchai' AND "email" IS NULL;
    UPDATE "accounts" SET "email" = 'manee@namcham.go.th', "email_verified" = true WHERE "id" = 'u-manee' AND "email" IS NULL;
  `);

  await runSqlStatements(`
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
  `);

  console.log('📦 Applying migration 5 (user_line_accounts)...');
  await runSqlStatements(`
    CREATE TABLE IF NOT EXISTS "user_line_accounts" (
      "id" TEXT PRIMARY KEY,
      "user_id" TEXT NOT NULL UNIQUE REFERENCES "accounts"("id") ON DELETE CASCADE,
      "line_user_id" TEXT NOT NULL UNIQUE,
      "display_name" TEXT NOT NULL,
      "picture_url" TEXT,
      "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "user_line_accounts_user_id_idx" ON "user_line_accounts"("user_id");
    CREATE INDEX IF NOT EXISTS "user_line_accounts_line_user_id_idx" ON "user_line_accounts"("line_user_id");
  `);

  console.log('📦 Applying migration 6 (account registration/status & user_consents)...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "accounts"
      ADD COLUMN IF NOT EXISTS "registration_completed_at" TIMESTAMPTZ(3),
      ADD COLUMN IF NOT EXISTS "account_status" TEXT NOT NULL DEFAULT 'ACTIVE';
  `);

  await runSqlStatements(`
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
  `);

  console.log('📦 Applying migration 7 (Phase 3 — LINE Notification System)...');
  await runSqlStatements(`
    ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "notification_type" TEXT NOT NULL DEFAULT 'SYSTEM',
      ADD COLUMN IF NOT EXISTS "reference_type" TEXT,
      ADD COLUMN IF NOT EXISTS "reference_id" TEXT,
      ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMPTZ(3);

    CREATE INDEX IF NOT EXISTS "notifications_ref_idx" ON "notifications"("reference_type", "reference_id");

    ALTER TABLE "user_line_accounts"
      ADD COLUMN IF NOT EXISTS "friendship_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
      ADD COLUMN IF NOT EXISTS "status_updated_at" TIMESTAMPTZ(3);

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
  `);

  console.log('✨ Schema applied to Supabase successfully!');
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

