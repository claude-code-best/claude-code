import { describe, expect, test } from 'bun:test'
import { SettingsSchema } from '../types.js'

// Settings schema for workflowKeywordTriggerEnabled (official 2.1.330
// settings schema L908578). Schema-only — types.js is never mocked by any
// test file, so this file has no mocks and no import-order dependencies.
// The runtime getter (getWorkflowKeywordTriggerEnabled, with its injectable
// source reader) is tested in src/utils/__tests__/workflowKeyword.test.ts.

describe('SettingsSchema: workflowKeywordTriggerEnabled', () => {
  test('accepts true / false / unset (optional boolean, default true)', () => {
    expect(SettingsSchema().safeParse({}).success).toBe(true)
    expect(
      SettingsSchema().safeParse({ workflowKeywordTriggerEnabled: true })
        .success,
    ).toBe(true)
    expect(
      SettingsSchema().safeParse({ workflowKeywordTriggerEnabled: false })
        .success,
    ).toBe(true)
  })

  test('rejects non-boolean values', () => {
    expect(
      SettingsSchema().safeParse({ workflowKeywordTriggerEnabled: 'yes' })
        .success,
    ).toBe(false)
    expect(
      SettingsSchema().safeParse({ workflowKeywordTriggerEnabled: 1 }).success,
    ).toBe(false)
  })

  test('carries the official description (verbatim)', () => {
    // Official 2.1.330 settings schema L908578, description word-for-word.
    const field = SettingsSchema().shape.workflowKeywordTriggerEnabled
    expect(field?.description).toBe(
      "Enable the 'ultracode' keyword trigger: including the keyword in a prompt opts that turn into the Workflow tool. Set to false to disable the trigger. Default: true.",
    )
  })
})
