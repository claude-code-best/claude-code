import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export async function createTempDir(prefix = 'claude-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

export async function writeTempFile(
  dir: string,
  name: string,
  content: string,
): Promise<string> {
  const path = join(dir, name)
  const parentDir = dirname(path)
  await mkdir(parentDir, { recursive: true })
  await writeFile(path, content, 'utf-8')
  return path
}

export async function createTempSubdir(
  dir: string,
  name: string,
): Promise<string> {
  const path = join(dir, name)
  await mkdir(path, { recursive: true })
  return path
}

/**
 * Read a file under the test temp dir as utf-8 text. Mirrors the node:fs
 * `readFileSync(path, 'utf-8')` ergonomics but uses Bun's native file API so
 * tests stay on the Bun-only runtime contract.
 */
export async function readTempFile(path: string): Promise<string> {
  return Bun.file(path).text()
}

/**
 * Best-effort existence check for a path under the test temp dir. Uses Bun's
 * native file API (works for files; directories return true via Bun.file().exists()
 * iff the path resolves — reads directly from the filesystem).
 */
export async function tempPathExists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}
