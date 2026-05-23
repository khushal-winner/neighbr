import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayDir = path.resolve(__dirname, "../../../gateway");
const binDir = path.resolve(__dirname, "../bin");
const outName = process.platform === "win32" ? "gateway.exe" : "gateway";
const outPath = path.join(binDir, outName);

fs.mkdirSync(binDir, { recursive: true });

console.log(`[build-gateway] Building Go gateway -> ${outPath}`);
execSync(`go build -o "${outPath}" .`, {
  cwd: gatewayDir,
  stdio: "inherit",
});

console.log("[build-gateway] Done");
