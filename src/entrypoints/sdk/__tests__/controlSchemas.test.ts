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

describe('set_session_model control schema', () => {
  const valid = {
    type: 'control_request',
    request_id: 'request-1',
    request: {
      subtype: 'set_session_model',
      provider_id: 'custom-openai',
      model_profile_id: 'model-b',
      expected_provider_config_revision: 7,
      operation_id: 'operation-1',
    },
  }

  test('accepts a complete provider model switch and keeps legacy set_model', () => {
    expect(SDKControlRequestSchema().safeParse(valid).success).toBe(true)
    expect(
      SDKControlRequestSchema().safeParse({
        type: 'control_request',
        request_id: 'legacy',
        request: { subtype: 'set_model', model: 'sonnet' },
      }).success,
    ).toBe(true)
  })

  test('rejects empty identities, negative revisions, and missing operation ids', () => {
    for (const request of [
      { ...valid.request, provider_id: '' },
      { ...valid.request, model_profile_id: '' },
      { ...valid.request, expected_provider_config_revision: -1 },
      { ...valid.request, operation_id: '' },
      (({ operation_id: _operationId, ...rest }) => rest)(valid.request),
    ]) {
      expect(
        SDKControlRequestSchema().safeParse({ ...valid, request }).success,
      ).toBe(false)
    }
  })
})
