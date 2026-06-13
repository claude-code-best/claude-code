import { afterEach, describe, expect, test } from 'bun:test'

import type { PromptCommand } from '../../../types/command.js'
import { clearBundledSkills, getBundledSkills } from '../../bundledSkills.js'
import { registerUltracodeSkill } from '../ultracode.js'

// Command is a union; source/getPromptForCommand only exist on the prompt
// variant. Narrow via type assertion once we've confirmed type === 'prompt'.
function asPrompt(c: { type: string }): PromptCommand {
  return c as unknown as PromptCommand
}

// bundledSkills is a process-global registry (per CLAUDE.md mock/state rules,
// module-level singletons leak across test files in one bun test process).
// Clear after each test so `ultracode` never leaks into other suites that
// enumerate registered skills (e.g. skill-search prefetch discovery).
afterEach(() => {
  clearBundledSkills()
})

describe('registerUltracodeSkill', () => {
  test('registers a user-invocable prompt command named ultracode', () => {
    clearBundledSkills()
    registerUltracodeSkill()

    const skills = getBundledSkills()
    const ultracode = skills.find(s => s.name === 'ultracode')
    expect(ultracode).toBeDefined()
    expect(ultracode!.type).toBe('prompt')
    expect(ultracode!.userInvocable).toBe(true)
    expect(ultracode!.whenToUse).toBeTruthy()
    expect(ultracode!.description).toContain('workflow')
    const promptCmd = asPrompt(ultracode!)
    expect(promptCmd.source).toBe('bundled')
  })

  test('getPromptForCommand injects the orchestration playbook with key sections', async () => {
    clearBundledSkills()
    registerUltracodeSkill()

    const ultracode = getBundledSkills().find(s => s.name === 'ultracode')!
    const blocks = await asPrompt(ultracode).getPromptForCommand(
      '',
      {} as never,
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')

    const text = (blocks[0] as { type: 'text'; text: string }).text
    expect(text).toContain('编排原语')
    expect(text).toContain('parallel')
    expect(text).toContain('pipeline')
    expect(text).toContain('resumeFromRunId')
    expect(text).toContain('AgentAdapterRegistry')
    expect(text).toContain('确定性约束')
    // 脚本执行模型约束（非 ESM / 禁 import / 禁 TS / 单 export / 顶层 return）
    expect(text).toContain('脚本编写约束')
    expect(text).toContain('不转译 TS')
    expect(text).toContain('禁 `import`')
  })

  test('appends user-provided args to the prompt when given', async () => {
    clearBundledSkills()
    registerUltracodeSkill()

    const ultracode = getBundledSkills().find(s => s.name === 'ultracode')!
    const blocks = await asPrompt(ultracode).getPromptForCommand(
      '迁移 auth 模块',
      {} as never,
    )
    const text = (blocks[0] as { type: 'text'; text: string }).text
    expect(text.endsWith('迁移 auth 模块\n')).toBe(true)
    expect(text).toContain('用户输入')
  })

  test('is not gated behind USER_TYPE — registers with no env set', () => {
    // No USER_TYPE env is configured in this test process. If the skill were
    // ant-gated (like stuck.ts), it would not appear here.
    const previousUserType = process.env.USER_TYPE
    delete process.env.USER_TYPE
    clearBundledSkills()
    registerUltracodeSkill()

    const skills = getBundledSkills()
    expect(skills.some(s => s.name === 'ultracode')).toBe(true)

    // Restore so we never mutate the process env for other test files.
    if (previousUserType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = previousUserType
  })
})
