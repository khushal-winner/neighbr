const { PrismaClient } = require("./generated/prisma");
const fs = require("fs");
const path = require("path");

async function main() {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "prisma",
      "migrations",
      "20260522162000_add_sender_relation",
      "migration.sql",
    ),
    "utf8",
  );

  const prisma = new PrismaClient();
  // Execute raw SQL toggles the migration tracking table
  await prisma.$executeRawUnsafe(sql);
  console.log("Migration SQL executed successfully");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
