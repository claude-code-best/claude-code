import { describe, expect, test } from 'bun:test'
import {
  SDKControlGetSystemPromptRequestSchema,
  SDKControlGetSystemPromptResponseSchema,
  SDKControlRequestSchema,
} from '../controlSchemas.js'

describe('get_system_prompt control schema', () => {
  test('accepts a get_system_prompt request in the control request union', () => {
    const parsed = SDKControlRequestSchema().safeParse({
      type: 'control_request',
      request_id: 'req-1',
      request: { subtype: 'get_system_prompt' },
    })
    expect(parsed.success).toBe(true)
  })

  test('request schema rejects unknown subtypes', () => {
    const parsed = SDKControlGetSystemPromptRequestSchema().safeParse({
      subtype: 'get_prompt',
    })
    expect(parsed.success).toBe(false)
  })

  test('response schema validates ordered prompt sections', () => {
    const parsed = SDKControlGetSystemPromptResponseSchema().safeParse({
      sections: [
        { id: 'system_prompt', title: 'System prompt', text: 'You are…' },
        {
          id: 'claude_md',
          title: 'Project context (CLAUDE.md)',
          text: '# 项目',
        },
      ],
    })
    expect(parsed.success).toBe(true)

    const missingText = SDKControlGetSystemPromptResponseSchema().safeParse({
      sections: [{ id: 'system_prompt', title: 'System prompt' }],
    })
    expect(missingText.success).toBe(false)
  })
})
