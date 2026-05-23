import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayDir = path.resolve(__dirname, "../../../gateway");
const binDir = path.resolve(__dirname, "../bin");
const outName = process.platform === "win32" ? "gateway.exe" : "gateway";
const outPath = path.join(binDir, outName);

function readGoVersion() {
  const mod = fs.readFileSync(path.join(gatewayDir, "go.mod"), "utf8");
  const match = mod.match(/^go\s+(\S+)/m);
  return match?.[1] ?? "1.22.10";
}

function hasGo(env) {
  try {
    execSync("go version", { stdio: "pipe", env });
    return true;
  } catch {
    return false;
  }
}

function goPlatform() {
  if (process.platform === "darwin") {
    return { os: "darwin", arch: process.arch === "arm64" ? "arm64" : "amd64" };
  }
  if (process.platform === "linux") {
    return { os: "linux", arch: process.arch === "arm64" ? "arm64" : "amd64" };
  }
  return null;
}

function installGo(version) {
  const platform = goPlatform();
  if (!platform) {
    throw new Error(
      `[build-gateway] Go is not installed. Install Go ${version} or build on Linux/macOS CI.`,
    );
  }

  const cacheDir = path.join(os.tmpdir(), "neighbr-go-cache");
  const installRoot = path.join(cacheDir, `go${version}`);
  const goBin = path.join(installRoot, "go", "bin");
  const goExe = path.join(goBin, process.platform === "win32" ? "go.exe" : "go");

  if (fs.existsSync(goExe)) {
    console.log(`[build-gateway] Using cached Go at ${goBin}`);
    return goBin;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const archive = `go${version}.${platform.os}-${platform.arch}.tar.gz`;
  const url = `https://go.dev/dl/${archive}`;
  const tarPath = path.join(cacheDir, archive);

  console.log(`[build-gateway] Go not found — downloading ${archive}`);
  execSync(`curl -fsSL "${url}" -o "${tarPath}"`, { stdio: "inherit" });
  fs.mkdirSync(installRoot, { recursive: true });
  execSync(`tar -xzf "${tarPath}" -C "${installRoot}"`, { stdio: "inherit" });

  if (!fs.existsSync(goExe)) {
    throw new Error(`[build-gateway] Go install failed — missing ${goExe}`);
  }

  console.log(`[build-gateway] Go installed at ${goBin}`);
  return goBin;
}

function pathWithGo() {
  const env = { ...process.env };
  if (hasGo(env)) return env;

  const version = readGoVersion();
  const goBin = installGo(version);
  env.PATH = `${goBin}${path.delimiter}${env.PATH ?? ""}`;
  env.GOTOOLCHAIN = env.GOTOOLCHAIN ?? "local";

  if (!hasGo(env)) {
    throw new Error("[build-gateway] Go install succeeded but `go` is still not on PATH");
  }

  return env;
}

fs.mkdirSync(binDir, { recursive: true });

const env = pathWithGo();
console.log(`[build-gateway] Building Go gateway -> ${outPath}`);
execSync(`go build -o "${outPath}" .`, {
  cwd: gatewayDir,
  stdio: "inherit",
  env,
});
console.log("[build-gateway] Done");
