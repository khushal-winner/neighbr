import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let gatewayProc: ChildProcess | null = null;

export function spawnGateway(port: string): boolean {
  const binName = process.platform === "win32" ? "gateway.exe" : "gateway";
  const binPath = path.join(__dirname, "..", "bin", binName);

  if (!fs.existsSync(binPath)) {
    console.warn(
      `[neighbr-gateway] Binary missing at ${binPath}. Run: npm run build:gateway-bin`,
    );
    return false;
  }

  gatewayProc = spawn(binPath, [], {
    env: { ...process.env, PORT: port },
    stdio: "inherit",
  });

  gatewayProc.on("exit", (code, signal) => {
    console.error(`[neighbr-gateway] exited (code=${code}, signal=${signal})`);
  });

  console.log(`[neighbr-gateway] Started on 127.0.0.1:${port}`);
  return true;
}

export function gatewayUpstream(port: string): string {
  return `http://127.0.0.1:${port}`;
}
