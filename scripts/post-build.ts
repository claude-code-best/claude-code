#!/usr/bin/env bun
/**
 * Post-build processing for Vite build output.
 *
 * 1. Patch globalThis.Bun destructuring in third-party deps for Node.js compat
 * 2. Copy native addon files
 * 3. Generate dual entry points (cli-bun.js, cli-node.js)
 */
import { readdir, readFile, writeFile, cp } from 'node:fs/promises'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

const outdir = 'dist'

async function postBuild() {
  // Step 1: Patch globalThis.Bun destructuring in ALL output files
  const BUN_DESTRUCTURE = /var \{([^}]+)\} = globalThis\.Bun;?/g
  const BUN_DESTRUCTURE_SAFE =
    'var {$1} = typeof globalThis.Bun !== "undefined" ? globalThis.Bun : {};'

  let bunPatched = 0
  const files = await readdir(outdir)
  const jsFiles = files.filter(f => f.endsWith('.js'))

  for (const file of jsFiles) {
    const filePath = join(outdir, file)
    const content = await readFile(filePath, 'utf-8')
    BUN_DESTRUCTURE.lastIndex = 0
    if (BUN_DESTRUCTURE.test(content)) {
      await writeFile(
        filePath,
        content.replace(BUN_DESTRUCTURE, BUN_DESTRUCTURE_SAFE),
      )
      bunPatched++
    }
  }

  // Also patch chunk files in dist/chunks/
  const chunksDir = join(outdir, 'chunks')
  let chunkFiles: string[] = []
  try {
    chunkFiles = (await readdir(chunksDir)).filter(f => f.endsWith('.js'))
  } catch {
    // No chunks directory — single-file build fallback
  }

  for (const file of chunkFiles) {
    const filePath = join(chunksDir, file)
    const content = await readFile(filePath, 'utf-8')
    BUN_DESTRUCTURE.lastIndex = 0
    if (BUN_DESTRUCTURE.test(content)) {
      await writeFile(
        filePath,
        content.replace(BUN_DESTRUCTURE, BUN_DESTRUCTURE_SAFE),
      )
      bunPatched++
    }
  }

  // Step 2: Copy native addon files
  const audioCaptureDir = join(outdir, 'vendor', 'audio-capture')
  await cp('vendor/audio-capture', audioCaptureDir, {
    recursive: true,
  } as never)
  console.log(`Copied vendor/audio-capture/ → ${audioCaptureDir}/`)

  const ripgrepDir = join(outdir, 'vendor', 'ripgrep')
  await cp('src/utils/vendor/ripgrep', ripgrepDir, { recursive: true } as never)
  console.log(`Copied src/utils/vendor/ripgrep/ → ${ripgrepDir}/`)

  // Step 3: Generate dual entry points
  const cliBun = join(outdir, 'cli-bun.js')
  const cliNode = join(outdir, 'cli-node.js')

  await writeFile(cliBun, '#!/usr/bin/env bun\nimport "./cli.js"\n')
  await writeFile(cliNode, '#!/usr/bin/env node\nimport "./cli.js"\n')

  chmodSync(cliBun, 0o755)
  chmodSync(cliNode, 0o755)

  console.log(
    `Post-build complete: patched ${bunPatched} Bun destructure across ${jsFiles.length + chunkFiles.length} files, generated entry points`,
  )
}

postBuild().catch(err => {
  console.error('Post-build failed:', err)
  process.exit(1)
})
