import { PrismaClient } from "./packages/db/generated/prisma/client";

const p = new PrismaClient();

const cols = await p.$queryRawUnsafe`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'ChatMessage'
  ORDER BY ordinal_position
`;
console.log("=== ChatMessage columns ===");
console.dir(cols, { depth: null });

const fks = await p.$queryRawUnsafe`
  SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conrelid = 'ChatMessage'::regclass AND contype = 'f'
`;
console.log("\n=== ChatMessage FKs ===");
console.dir(fks, { depth: null });

await p.$disconnect();
