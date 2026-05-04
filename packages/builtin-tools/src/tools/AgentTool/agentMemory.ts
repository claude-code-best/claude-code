import { join, normalize, sep } from 'path'
import { getProjectRoot } from 'src/bootstrap/state.js'
import { buildMemoryPrompt, ensureMemoryDirExists } from 'src/memdir/memdir.js'
import { getMemoryBaseDir } from 'src/memdir/paths.js'
import { getCwd } from 'src/utils/cwd.js'
import { findCanonicalGitRoot } from 'src/utils/git.js'
import { sanitizePath } from 'src/utils/path.js'

// 持久化代理记忆作用域：'user' (~/.claude/agent-memory/)、'project' (.claude/agent-memory/) 或 'local' (.claude/agent-memory-local/)
export type AgentMemoryScope = 'user' | 'project' | 'local'

/**
 * 清理代理类型名称，使其可用作目录名。
 * 将冒号（Windows 上无效，用于插件命名空间的代理类型，如 "my-plugin:my-agent"）替换为短横线。
 */
function sanitizeAgentTypeForPath(agentType: string): string {
  return agentType.replace(/:/g, '-')
}

/**
 * 返回本地代理记忆目录，该目录是项目特定的且不纳入版本控制。
 * 当设置了 CLAUDE_CODE_REMOTE_MEMORY_DIR 时，会持久化到挂载点并使用项目命名空间。
 * 否则，使用 <cwd>/.claude/agent-memory-local/<agentType>/。
 */
function getLocalAgentMemoryDir(dirName: string): string {
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    return (
      join(
        process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR,
        'projects',
        sanitizePath(
          findCanonicalGitRoot(getProjectRoot()) ?? getProjectRoot(),
        ),
        'agent-memory-local',
        dirName,
      ) + sep
    )
  }
  return join(getCwd(), '.claude', 'agent-memory-local', dirName) + sep
}

/**
 * 返回给定代理类型和作用域的记忆目录。
 * - 'user' 作用域：<memoryBase>/agent-memory/<agentType>/
 * - 'project' 作用域：<cwd>/.claude/agent-memory/<agentType>/
 * - 'local' 作用域：参见 getLocalAgentMemoryDir()
 */
export function getAgentMemoryDir(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  const dirName = sanitizeAgentTypeForPath(agentType)
  switch (scope) {
    case 'project':
      return join(getCwd(), '.claude', 'agent-memory', dirName) + sep
    case 'local':
      return getLocalAgentMemoryDir(dirName)
    case 'user':
      return join(getMemoryBaseDir(), 'agent-memory', dirName) + sep
  }
}

// 检查文件是否位于代理记忆目录内（任何作用域）
export function isAgentMemoryPath(absolutePath: string): boolean {
  // 安全：规范化路径以防止通过 .. 片段进行路径遍历绕过
  const normalizedPath = normalize(absolutePath)
  const memoryBase = getMemoryBaseDir()

  // 用户作用域：检查记忆基础目录（可能是自定义目录或配置主目录）
  if (normalizedPath.startsWith(join(memoryBase, 'agent-memory') + sep)) {
    return true
  }

  // 项目作用域：始终基于 cwd（不重定向）
  if (
    normalizedPath.startsWith(join(getCwd(), '.claude', 'agent-memory') + sep)
  ) {
    return true
  }

  // 本地作用域：当设置了 CLAUDE_CODE_REMOTE_MEMORY_DIR 时持久化到挂载点，否则基于 cwd
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    if (
      normalizedPath.includes(sep + 'agent-memory-local' + sep) &&
      normalizedPath.startsWith(
        join(process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR, 'projects') + sep,
      )
    ) {
      return true
    }
  } else if (
    normalizedPath.startsWith(
      join(getCwd(), '.claude', 'agent-memory-local') + sep,
    )
  ) {
    return true
  }

  return false
}

/**
 * 返回给定代理类型和作用域的记忆文件路径。
 */
export function getAgentMemoryEntrypoint(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  return join(getAgentMemoryDir(agentType, scope), 'MEMORY.md')
}

export function getMemoryScopeDisplay(
  memory: AgentMemoryScope | undefined,
): string {
  switch (memory) {
    case 'user':
      return `用户 (${join(getMemoryBaseDir(), 'agent-memory')}/)`
    case 'project':
      return '项目 (.claude/agent-memory/)'
    case 'local':
      return `本地 (${getLocalAgentMemoryDir('...')})`
    default:
      return '无'
  }
}

/**
 * 为启用了记忆的代理加载持久化记忆。
 * 如果需要，创建记忆目录，并返回包含记忆内容的提示。
 *
 * @param agentType 代理的类型名称（用作目录名）
 * @param scope 'user' 表示 ~/.claude/agent-memory/，'project' 表示 .claude/agent-memory/
 */
export function loadAgentMemoryPrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  let scopeNote: string
  switch (scope) {
    case 'user':
      scopeNote =
        '- 由于此记忆是用户作用域，请保持学习的通用性，因为它们适用于所有项目'
      break
    case 'project':
      scopeNote =
        '- 由于此记忆是项目作用域并通过版本控制与团队共享，请将记忆定制为适合此项目'
      break
    case 'local':
      scopeNote =
        '- 由于此记忆是本地作用域（不纳入版本控制），请将记忆定制为适合此项目和当前机器'
      break
  }

  const memoryDir = getAgentMemoryDir(agentType, scope)

  // 即发即忘：在代理生成时同步运行于 getSystemPrompt() 回调中（从 AgentDetail.tsx 的 React 渲染调用，因此不能是异步的）。
  // 生成的代理在完成一次完整的 API 往返之前不会尝试写入，届时 mkdir 应该已经完成。即使尚未完成，
  // FileWriteTool 也会自行创建父目录。
  void ensureMemoryDirExists(memoryDir)

  const coworkExtraGuidelines =
    process.env.CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES
  return buildMemoryPrompt({
    displayName: '持久化代理记忆',
    memoryDir,
    extraGuidelines:
      coworkExtraGuidelines && coworkExtraGuidelines.trim().length > 0
        ? [scopeNote, coworkExtraGuidelines]
        : [scopeNote],
  })
}
