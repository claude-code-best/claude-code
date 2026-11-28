import { spawn } from 'node:child_process'

const scripts = process.argv.slice(2)
if (scripts.length === 0) {
  process.exit(0)
}

// Run every installer concurrently, but wait for ALL of them and propagate a
// non-zero exit code. Previously this script spawned children and immediately
// returned, so a failed postinstall step was silently reported as success.
let failed = false

await Promise.all(
  scripts.map(
    script =>
      new Promise(resolve => {
        const child = spawn(process.execPath, [script], {
          stdio: 'inherit',
          shell: false,
        })
        child.on('error', error => {
          console.error(`[run-parallel] ${script}: ${error.message}`)
          failed = true
          resolve()
        })
        child.on('exit', code => {
          if (code !== 0) {
            console.error(`[run-parallel] ${script} exited with code ${code}`)
            failed = true
          }
          resolve()
        })
      }),
  ),
)

process.exit(failed ? 1 : 0)
