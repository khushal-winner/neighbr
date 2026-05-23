/**
 * Windows-safe removal of .next (handles ENOTEMPTY / locked files).
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const target = path.join(process.cwd(), '.next')

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

function removeWithPowerShell(dir) {
    if (process.platform !== 'win32' || !fs.existsSync(dir)) return false
    const escaped = dir.replace(/'/g, "''")
    try {
        execSync(
            `powershell -NoProfile -Command "if (Test-Path -LiteralPath '${escaped}') { Remove-Item -LiteralPath '${escaped}' -Recurse -Force -ErrorAction Stop }"`,
            { stdio: 'pipe', timeout: 120000 },
        )
        return !fs.existsSync(dir)
    } catch {
        return false
    }
}

async function removeDir(dir) {
    if (!fs.existsSync(dir)) return

    if (removeWithPowerShell(dir)) return

    const trash = `${dir}.delete-${Date.now()}`
    try {
        fs.renameSync(dir, trash)
        dir = trash
    } catch {
        // locked — delete in place
    }

    for (let attempt = 1; attempt <= 12; attempt++) {
        try {
            fs.rmSync(dir, {
                recursive: true,
                force: true,
                maxRetries: 15,
                retryDelay: 300,
            })
            return
        } catch {
            if (attempt === 6) removeWithPowerShell(dir)
            if (attempt === 12) {
                console.warn(
                    `Could not fully remove ${dir}. Stop other "node" processes, then run: npm run clean`,
                )
                throw new Error(`ENOTEMPTY: could not remove ${dir}`)
            }
            await sleep(400 * attempt)
        }
    }
}

await removeDir(target)
console.log('Removed .next cache')
