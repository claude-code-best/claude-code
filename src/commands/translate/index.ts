import type { Command } from '../../commands.js'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { zhCN } from '../../locales/zh-CN.js'

const TRANSLATIONS_DIR = join(getClaudeConfigHomeDir(), 'translations')
const TRANSLATIONS_FILE = join(TRANSLATIONS_DIR, 'zh.json')

async function loadPersisted(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(TRANSLATIONS_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

async function savePersisted(translations: Record<string, string>): Promise<void> {
  await mkdir(TRANSLATIONS_DIR, { recursive: true })
  await writeFile(TRANSLATIONS_FILE, JSON.stringify(translations, null, 2) + '\n', 'utf-8')
}

const translate: Command = {
  type: 'prompt',
  name: 'translate',
  description: 'Auto-translate all command descriptions to Chinese',
  userInvocable: true,
  contentLength: 0,
  source: 'builtin',
  progressMessage: 'Translating command descriptions...',
  async getPromptForCommand() {
    const { getCommands } = await import('../../commands.js')
    const commands = await getCommands(process.cwd())
    let persisted = await loadPersisted()

    // Clean up stale translations for uninstalled commands
    const activeKeys = new Set(
      commands
        .filter(cmd => cmd.description)
        .map(cmd => `cmd.${cmd.name}.description`),
    )
    // Also keep builtin translation keys (they're always valid)
    for (const key of Object.keys(zhCN)) {
      activeKeys.add(key)
    }

    let removed = 0
    for (const key of Object.keys(persisted)) {
      if (!activeKeys.has(key)) {
        delete persisted[key]
        removed++
      }
    }
    if (removed > 0) {
      await savePersisted(persisted)
    }

    // Collect untranslated descriptions
    const toTranslate: Array<{ key: string; en: string }> = []
    for (const cmd of commands) {
      if (!cmd.description) continue
      const key = `cmd.${cmd.name}.description`
      if (zhCN[key] !== undefined || persisted[key] !== undefined) continue
      toTranslate.push({ key, en: cmd.description })
    }

    if (toTranslate.length === 0 && removed === 0) {
      return [{ type: 'text', text: '所有命令描述已翻译完毕，无需操作。' }]
    }

    if (toTranslate.length === 0) {
      return [{ type: 'text', text: `已清理 ${removed} 条过期翻译。无新翻译需求。` }]
    }

    const list = toTranslate.map(t => `${t.key}: ${t.en}`).join('\n')
    const cleanupNote = removed > 0 ? `\n\n（已清理 ${removed} 条过期翻译）` : ''

    const prompt = `将以下英文命令描述翻译为简体中文。技术术语(MCP/IDE/API/CLI/PR等)保留英文。

重要：不要读取任何文件，所有需要翻译的内容已在下方。不要搜索或浏览。

${list}

只输出 JSON 对象，不要解释。格式: {"cmd.xxx.description": "中文", ...}
然后用 Write 工具将结果合并写入 ${TRANSLATIONS_FILE}（保留已有内容，只添加新翻译）。${cleanupNote}`

    return [{ type: 'text', text: prompt }]
  },
}

export default translate
