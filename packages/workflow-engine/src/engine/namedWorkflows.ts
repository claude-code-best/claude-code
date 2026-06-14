import { readFile, readdir } from 'node:fs/promises'
import { join, parse, resolve } from 'node:path'
import { WORKFLOW_SCRIPT_EXTENSIONS } from '../constants.js'
import { containsPath } from './paths.js'

type Ext = (typeof WORKFLOW_SCRIPT_EXTENSIONS)[number]

function isScriptExt(ext: string): ext is Ext {
  return (WORKFLOW_SCRIPT_EXTENSIONS as readonly string[]).includes(
    ext.toLowerCase(),
  )
}

/** Resolve a named workflow file by priority .ts → .js → .mjs. */
export async function resolveNamedWorkflow(
  workflowDir: string,
  name: string,
): Promise<{ path: string; content: string } | null> {
  for (const ext of WORKFLOW_SCRIPT_EXTENSIONS) {
    const p = resolve(workflowDir, name + ext)
    // Double safeguard: prevents edge cases missed by the upper-layer sanitize from traversing paths outside workflowDir
    if (!containsPath(workflowDir, p)) return null
    try {
      return { path: p, content: await readFile(p, 'utf-8') }
    } catch {
      // try the next extension
    }
  }
  return null
}

/** List all named workflows in the directory (excluding non-script files). */
export async function listNamedWorkflows(
  workflowDir: string,
): Promise<string[]> {
  let files: string[]
  try {
    files = await readdir(workflowDir)
  } catch {
    return []
  }
  return files
    .filter(f => isScriptExt(parse(f).ext))
    .map(f => parse(f).name)
    .sort()
}
