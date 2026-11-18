import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { MOCK_PASSWORD } from '../src/demo-data/accounts';
import { hashSecret } from '../src/auth/secret';
import { validateUsername } from '@japjong/shared';

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

async function main() {
  console.log('🔐 Auditing & migrating existing accounts to new Auth & Password Policy...');

  // 1. เพิ่มคอลัมน์ must_change_password แบบปลอดภัย (ไม่ลบข้อมูลเดิม)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;`,
  );

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isDemo: true,
      active: true,
      password: true,
    },
  });

  console.log(`📊 Found ${accounts.length} existing account(s).`);

  // 2. ตรวจสอบ Username / Email ซ้ำ และความยาว Username
  const seenUsernames = new Map<string, string>();
  const seenEmails = new Map<string, string>();
  let demoUpdated = 0;

  for (const acc of accounts) {
    const lowerUser = acc.username.trim().toLowerCase();
    const uCheck = validateUsername(acc.username);
    const emailLower = acc.email ? acc.email.trim().toLowerCase() : '';

    if (seenUsernames.has(lowerUser)) {
      console.warn(`⚠️  Duplicate username detected: "${acc.username}" (${acc.id} vs ${seenUsernames.get(lowerUser)})`);
    } else {
      seenUsernames.set(lowerUser, acc.id);
    }

    if (emailLower) {
      if (seenEmails.has(emailLower)) {
        console.warn(`⚠️  Duplicate email detected: "${emailLower}" (${acc.id} vs ${seenEmails.get(emailLower)})`);
      } else {
        seenEmails.set(emailLower, acc.id);
      }
    }

    const isArgon2 = acc.password.startsWith('$argon2');
    const isSsoOrLine = acc.username.startsWith('sso_') || acc.username.startsWith('line_');

    if (acc.isDemo) {
      // อัปเดตรหัสผ่านบัญชีทดสอบให้ตรงตามมาตรฐานใหม่ (Demo1234) และ Hash ด้วย Argon2
      const newHash = await hashSecret(MOCK_PASSWORD);
      await prisma.account.update({
        where: { id: acc.id },
        data: { password: newHash },
      });
      await prisma.$executeRaw`
        UPDATE "accounts" SET "must_change_password" = false WHERE "id" = ${acc.id}
      `;
      demoUpdated += 1;
      console.log(`✅ [DEMO] Updated "${acc.username}" (${acc.role}) -> Argon2(${MOCK_PASSWORD}), usernameValid=${uCheck.valid}`);
    } else {
      // บัญชีจริง: ห้ามแก้ไขหรือถอดรหัสผ่านเดิมโดยตรง
      console.log(
        `ℹ️  [REAL] "${acc.username}" (${acc.role}) | argon2=${isArgon2} | usernameValid=${uCheck.valid} | sso/line=${isSsoOrLine}`,
      );
      if (!uCheck.valid) {
        console.warn(`   ⚠️  Username "${acc.username}" does not meet new standard: ${uCheck.error}`);
      }
    }
  }

  console.log(`\n🎉 Migration audit complete! Demo accounts updated: ${demoUpdated}/${accounts.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
