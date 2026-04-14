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
