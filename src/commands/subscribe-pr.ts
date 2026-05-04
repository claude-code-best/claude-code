import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Command, LocalCommandCall } from '../types/command.js'
import { detectCurrentRepositoryWithHost } from '../utils/detectRepository.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

/** 用于 PR Webhook 订阅的文件存储。
每个订阅跟踪仓库 + PR 编号，以便桥接层
(useReplBridge / webhookSanitizer) 可以过滤传入的事件。 */
interface PRSubscription {
  repo: string // "owner/repo"
  prNumber: number
  subscribedAt: string // ISO 8601
}

function getSubscriptionsFilePath(): string {
  return path.join(getClaudeConfigHomeDir(), 'pr-subscriptions.json')
}

function readSubscriptions(): PRSubscription[] {
  const filePath = getSubscriptionsFilePath()
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as PRSubscription[]
  } catch {
    return []
  }
}

function writeSubscriptions(subs: PRSubscription[]): void {
  const filePath = getSubscriptionsFilePath()
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(subs, null, 2), 'utf-8')
}

/** 将 PR URL 或编号解析为 { repo, prNumber }。

接受格式：
  - 完整 URL:  https://github.com/owner/repo/pull/123
  - 短引用: owner/repo#123
  - 纯数字: 123  (使用当前的 git 仓库) */
async function parsePRArg(
  arg: string,
): Promise<{ repo: string; prNumber: number } | { error: string }> {
  const trimmed = arg.trim()

  // 完整的 GitHub PR URL
  const urlMatch = trimmed.match(
    /^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/(\d+)/,
  )
  if (urlMatch) {
    return { repo: urlMatch[1]!, prNumber: parseInt(urlMatch[2]!, 10) }
  }

  // 短引用: owner/repo#123
  const shortMatch = trimmed.match(/^([^/]+\/[^/]+)#(\d+)$/)
  if (shortMatch) {
    return { repo: shortMatch[1]!, prNumber: parseInt(shortMatch[2]!, 10) }
  }

  // 纯数字 — 从当前 git 检出中解析仓库
  const numMatch = trimmed.match(/^#?(\d+)$/)
  if (numMatch) {
    const prNumber = parseInt(numMatch[1]!, 10)
    const detected = await detectCurrentRepositoryWithHost()
    if (!detected) {
      return {
        error: '无法检测当前目录对应的 GitHub 仓库。请提供一个完整的 PR URL。',
      }
    }
    const repo = `${detected.owner}/${detected.name}`
    return { repo, prNumber }
  }

  return {
    error: `无法识别的 PR 引用: "${trimmed}"。期望一个 PR URL、owner/repo#123 或一个 PR 编号。`,
  }
}

const call: LocalCommandCall = async (args, _context) => {
  const trimmed = args.trim()

  // 列出当前订阅
  if (!trimmed || trimmed === '--list' || trimmed === 'list') {
    const subs = readSubscriptions()
    if (subs.length === 0) {
      return {
        type: 'text',
        value: '没有活跃的 PR 订阅。用法: /subscribe-pr <pr-url-or-number>',
      }
    }
    const lines = subs.map(
      s => `  ${s.repo}#${s.prNumber}  (since ${s.subscribedAt})`,
    )
    return {
      type: 'text',
      value: `活跃的 PR 订阅:
${lines.join('\n')}`,
    }
  }

  // 取消订阅
  if (trimmed.startsWith('--remove ') || trimmed.startsWith('remove ')) {
    const rest = trimmed.replace(/^(--remove|remove)\s+/, '')
    const parsed = await parsePRArg(rest)
    if ('error' in parsed) {
      return { type: 'text', value: parsed.error }
    }
    const subs = readSubscriptions()
    const before = subs.length
    const after = subs.filter(
      s => !(s.repo === parsed.repo && s.prNumber === parsed.prNumber),
    )
    if (after.length === before) {
      return {
        type: 'text',
        value: `未找到 ${parsed.repo}#${parsed.prNumber} 的订阅。`,
      }
    }
    writeSubscriptions(after)
    return {
      type: 'text',
      value: `已取消订阅 ${parsed.repo}#${parsed.prNumber}。`,
    }
  }

  // 订阅
  const parsed = await parsePRArg(trimmed)
  if ('error' in parsed) {
    return { type: 'text', value: parsed.error }
  }

  const subs = readSubscriptions()
  const existing = subs.find(
    s => s.repo === parsed.repo && s.prNumber === parsed.prNumber,
  )
  if (existing) {
    return {
      type: 'text',
      value: `已订阅 ${parsed.repo}#${parsed.prNumber} (自 ${existing.subscribedAt} 起)。`,
    }
  }

  subs.push({
    repo: parsed.repo,
    prNumber: parsed.prNumber,
    subscribedAt: new Date().toISOString(),
  })
  writeSubscriptions(subs)

  return {
    type: 'text',
    value: `已订阅 ${parsed.repo}#${parsed.prNumber}。您将收到评论、CI 状态和代码审查的通知。`,
  }
}

const subscribePr = {
  type: 'local',
  name: 'subscribe-pr',
  aliases: ['watch-pr'],
  description: '订阅 GitHub PR 活动（评论、CI、代码审查）',
  argumentHint: '<pr-url-or-number>',
  supportsNonInteractive: false,
  isHidden: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default subscribePr
