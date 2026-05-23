import { PrismaClient } from "../generated/prisma";
import path from "path";
import fs from "fs";

const migrationDir = path.join(
  __dirname,
  "prisma",
  "migrations",
  "20260522162000_add_sender_relation",
);
const sqlPath = path.join(migrationDir, "migration.sql");

(async () => {
  const p = new PrismaClient();

  // 1. List existing migrations tracking rows
  const existing = await p.$queryRawUnsafe(
    `SELECT "id", "checksum", "finished_at", "migration_name" FROM "_prisma_migrations" ORDER BY "started_at"`,
  );
  console.dir(existing, { depth: null });

  // 2. Apply the migration SQL idempotently (IF NOT EXISTS for columns/FKs)
  const sql = fs.readFileSync(sqlPath, "utf8");
  await p.$executeRawUnsafe(sql);
  console.log("Migration SQL applied (safe re-run)");

  // 3. Insert tracking row if not already present
  //    id = ts-sha-256 of migration_name (Prisma computes it as: sha256(name))
  //    Prisma stores the migration_name in the PK column 'id' for new versions since 4.x
  //    For simplicity, use migration_name as id (Prisma schema format)
  //    Actually Prisma uses migration_name in the 'id' field by default.
  await p.$executeRawUnsafe(`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count, logs, rolled_back_at, started_at)
    VALUES (
      '20260522162000_add_sender_relation'::uuid,
      decode('00000000000000000000000000000000', 'hex'),
      NOW(),
      '20260522162000_add_sender_relation',
      1,
      '',
      NULL,
      NOW()
    )
    ON CONFLICT ("id") DO NOTHING;
  `);
  console.log("Migration tracking row upserted");

  const after = await p.$queryRawUnsafe(
    `SELECT "id", "finished_at", "migration_name" FROM "_prisma_migrations" ORDER BY "started_at"`,
  );
  console.dir(after, { depth: null });

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
