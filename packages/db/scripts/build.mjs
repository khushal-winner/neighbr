import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const clientEntry = "generated/prisma/client.ts";
const shouldGenerate =
  process.env.FORCE_PRISMA_GENERATE === "1" || !existsSync(clientEntry);

if (shouldGenerate) {
  console.log("[@neighbr/db] Running prisma generate...");
  execSync("prisma generate", {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0",
    },
  });
} else {
  console.log("[@neighbr/db] Skipping prisma generate — client already present");
}

console.log("[@neighbr/db] Running tsc...");
execSync("tsc", { stdio: "inherit" });
