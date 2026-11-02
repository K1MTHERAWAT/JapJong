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
  await runSqlStatements(`
    CREATE TYPE "VerificationStatus" AS ENUM ('VALID', 'REVOKED', 'INVALID');

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

