import { spawn } from 'node:child_process'

// Usage: node scripts/run-parallel.mjs [--tolerate] <script> [--tolerate] <script> ...
// `--tolerate` applies to the command that follows it: the child still runs,
// its failure is logged, but it does not fail the overall exit code. Use it
// for best-effort postinstall steps (e.g. optional Chrome MCP setup) whose
// failure must not break `npm install`.
const rawArgs = process.argv.slice(2)
if (rawArgs.length === 0) {
  process.exit(0)
}

const jobs = []
let tolerateNext = false
for (const arg of rawArgs) {
  if (arg === '--tolerate') {
    tolerateNext = true
    continue
  }
  jobs.push({ script: arg, tolerate: tolerateNext })
  tolerateNext = false
}

// Run every installer concurrently, but wait for ALL of them and propagate a
// non-zero exit code. Previously this script spawned children and immediately
// returned, so a failed postinstall step was silently reported as success.
let failed = false

await Promise.all(
  jobs.map(
    ({ script, tolerate }) =>
      new Promise(resolve => {
        const child = spawn(process.execPath, [script], {
          stdio: 'inherit',
          shell: false,
        })
        child.on('error', error => {
          console.error(`[run-parallel] ${script}: ${error.message}`)
          if (!tolerate) failed = true
          resolve()
        })
        child.on('exit', code => {
          if (code !== 0) {
            if (tolerate) {
              console.error(
                `[run-parallel] ${script} exited with code ${code} (tolerated, optional step)`,
              )
            } else {
              console.error(`[run-parallel] ${script} exited with code ${code}`)
              failed = true
            }
          }
          resolve()
        })
      }),
  ),
)

process.exit(failed ? 1 : 0)
