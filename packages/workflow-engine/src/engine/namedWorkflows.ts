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

/** 按 .ts → .js → .mjs 优先级解析命名 workflow 文件。 */
export async function resolveNamedWorkflow(
  workflowDir: string,
  name: string,
): Promise<{ path: string; content: string } | null> {
  for (const ext of WORKFLOW_SCRIPT_EXTENSIONS) {
    const p = resolve(workflowDir, name + ext)
    // 双保险：防止上层 sanitize 漏掉的边界 case 把路径遍历到 workflowDir 之外
    if (!containsPath(workflowDir, p)) return null
    try {
      return { path: p, content: await readFile(p, 'utf-8') }
    } catch {
      // 试下一个扩展名
    }
  }
  return null
}

/** 列出目录下所有命名 workflow（不含非脚本文件）。 */
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
