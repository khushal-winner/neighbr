import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** go.dev tarballs use patch releases (go1.24.13), not bare go1.24. */
const GO_PATCH_BY_MINOR = {
  "1.24": "1.24.13",
  "1.23": "1.23.6",
  "1.22": "1.22.12",
};
const FALLBACK_GO_VERSION = "1.24.13";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayDir = path.resolve(__dirname, "../../../gateway");
const binDir = path.resolve(__dirname, "../bin");
const outName = process.platform === "win32" ? "gateway.exe" : "gateway";
const outPath = path.join(binDir, outName);

function readGoModVersion() {
  const mod = fs.readFileSync(path.join(gatewayDir, "go.mod"), "utf8");
  const toolchain = mod.match(/^toolchain\s+go(\S+)/m);
  if (toolchain?.[1]) return toolchain[1];
  const goLine = mod.match(/^go\s+(\S+)/m);
  return goLine?.[1] ?? FALLBACK_GO_VERSION;
}

function resolveDownloadVersion() {
  if (process.env.GO_DOWNLOAD_VERSION) {
    return process.env.GO_DOWNLOAD_VERSION;
  }
  const modVersion = readGoModVersion();
  const parts = modVersion.split(".");
  if (parts.length >= 3) return modVersion;
  const minor = `${parts[0]}.${parts[1]}`;
  return GO_PATCH_BY_MINOR[minor] ?? FALLBACK_GO_VERSION;
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
  const goExe = path.join(goBin, "go");

  if (fs.existsSync(goExe)) {
    console.log(`[build-gateway] Using cached Go at ${goBin}`);
    return goBin;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const archive = `go${version}.${platform.os}-${platform.arch}.tar.gz`;
  const url = `https://go.dev/dl/${archive}`;
  const tarPath = path.join(cacheDir, archive);

  console.log(`[build-gateway] Go not found — downloading ${archive}`);
  try {
    execSync(`curl -fsSL "${url}" -o "${tarPath}"`, { stdio: "inherit" });
  } catch (err) {
    if (version !== FALLBACK_GO_VERSION) {
      console.warn(
        `[build-gateway] Download failed for ${version}, retrying with ${FALLBACK_GO_VERSION}`,
      );
      return installGo(FALLBACK_GO_VERSION);
    }
    throw err;
  }

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
  if (hasGo(env)) {
    env.GOTOOLCHAIN = env.GOTOOLCHAIN ?? "local";
    return env;
  }

  const version = resolveDownloadVersion();
  const goBin = installGo(version);
  env.PATH = `${goBin}${path.delimiter}${env.PATH ?? ""}`;
  env.GOTOOLCHAIN = `go${version}`;

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
