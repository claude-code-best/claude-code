import { spawn } from "node:child_process"

const scripts = process.argv.slice(2)
if (scripts.length === 0) {
  process.exit(0)
}

for (const script of scripts) {
  spawn(process.execPath, [script], { stdio: "inherit", shell: false })
}
