import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import type { ProgressBus } from './progress/bus.js'
import type { ProgressStore, RunProgress } from './progress/store.js'

/** state.json 当前 schema 版本；升级时引入迁移链。 */
const SCHEMA_VERSION = 1
const STATE_FILE = 'state.json'
const STATE_TMP = 'state.json.tmp'

/**
 * runsDir 统一来源：与 ports.ts journalStore 同根（${projectRoot}/.claude/workflow-runs）。
 * 提取为函数：消除 ports.ts 与持久化逻辑的路径拼接重复，进入 worktree/子目录时保持同根。
 * 测试用 monkey-patch 本函数指向 tmpdir。
 */
export function getRunsDir(): string {
  return join(getProjectRoot(), '.claude', 'workflow-runs')
}

type StateFile = {
  schemaVersion: number
  run: RunProgress
}

/**
 * 原子覆盖写终态 RunProgress 到 <runsDir>/<runId>/state.json。
 * 原子性：writeFile(tmp) → rename(tmp, target)，rename 原子；最坏留 tmp，下次写覆盖。
 * 失败 best-effort：IO 异常只 log warn，不抛（workflow 已成功，持久化失败只意味着重启后取不到）。
 */
export async function writeRunState(
  runsDir: string,
  run: RunProgress,
): Promise<void> {
  const dir = join(runsDir, run.runId)
  const target = join(dir, STATE_FILE)
  const tmp = join(dir, STATE_TMP)
  const payload: StateFile = { schemaVersion: SCHEMA_VERSION, run }
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(tmp, JSON.stringify(payload), 'utf-8')
    await rename(tmp, target)
  } catch (e) {
    logForDebugging(
      `[workflow warn] writeRunState failed for ${run.runId}: ${(e as Error).message}`,
    )
  }
}

/**
 * 读 <runsDir>/<runId>/state.json，容错：
 * - 文件不存在 → null（调用方按 miss 处理）
 * - JSON 解析失败 / schema 结构不符 / schemaVersion 不符 → null（log warn，不崩）
 */
export async function readRunState(
  runsDir: string,
  runId: string,
): Promise<RunProgress | null> {
  const target = join(runsDir, runId, STATE_FILE)
  let raw: string
  try {
    raw = await readFile(target, 'utf-8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StateFile>
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null
    const run = parsed.run
    if (!run || typeof run !== 'object') return null
    if (typeof run.runId !== 'string') return null
    if (typeof run.status !== 'string') return null
    return run as RunProgress
  } catch (e) {
    logForDebugging(
      `[workflow warn] readRunState parse failed for ${runId}: ${(e as Error).message}`,
    )
    return null
  }
}

/**
 * 扫描 runsDir 下所有子目录，读取每个 state.json，返回非空 RunProgress 列表。
 * - runsDir 不存在 → 空数组
 * - 某子目录无 state.json（半残 run）→ 跳过
 * - 某子目录 state.json 损坏 → 跳过该单个，继续扫其余
 * - 按 updatedAt 降序（与 store.list() 排序一致）
 */
export async function listPersistedRuns(
  runsDir: string,
): Promise<RunProgress[]> {
  let entries: string[]
  try {
    entries = await readdir(runsDir)
  } catch {
    return []
  }
  const runs: RunProgress[] = []
  for (const name of entries) {
    const run = await readRunState(runsDir, name)
    if (run) runs.push(run)
  }
  return runs.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 订阅 bus 的 run_done 事件，把终态 RunProgress 写到磁盘 state.json。
 * 覆盖 completed/failed/killed 三态（shutdown-kill 也走 run_done killed）。
 * store 先于本订阅注册到 bus，故 listener 执行时 store.get(runId) 已是终态。
 * 返回 unsubscribe 函数（测试清理用）。
 *
 * 写盘 best-effort：writeRunState 内部吞 IO 异常只 log，不传播——
 * 因此 bus 的其他订阅者（store 等）不受持久化失败影响。
 *
 * @param runsDirProvider 可选的 runsDir 解析器（默认 getRunsDir）。
 *   生产路径走默认值；测试注入 tmpdir 避免写真实项目目录（Bun ESM 模块命名空间只读，
 *   无法 monkey-patch getRunsDir 本身）。
 */
export function attachRunStatePersistence(
  bus: ProgressBus,
  store: ProgressStore,
  runsDirProvider: () => string = getRunsDir,
): () => void {
  return bus.subscribe(event => {
    if (event.type !== 'run_done') return
    const run = store.get(event.runId)
    if (!run) return
    void writeRunState(runsDirProvider(), run)
  })
}
