import { describe, expect, test } from 'bun:test'

import {
  shouldReportRunningForMessage,
  shouldReportRunningForMessages,
} from '../bridgeMessaging.js'
import { createUserMessage } from '../../utils/messages.js'

describe('bridge running-state classification', () => {
  test('treats real user prompts as turn-starting work', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({ content: 'please inspect the repo' }),
      ),
    ).toBe(true)
  })

  test('keeps tool-result style user messages eligible during mid-turn attach', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<local-command-stdout>done</local-command-stdout>',
          toolUseResult: { ok: true },
        }),
      ),
    ).toBe(true)
  })

  test('ignores local slash-command scaffolding that should not reopen a turn', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
          isMeta: true,
        }),
      ),
    ).toBe(false)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<system-reminder>\nProactive mode is now enabled. You will receive periodic <tick> prompts.\n</system-reminder>',
          isMeta: true,
        }),
      ),
    ).toBe(false)
  })

  test('still marks real automation triggers as running', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<tick>2:56:47 PM</tick>',
          isMeta: true,
        }),
      ),
    ).toBe(true)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: 'scheduled job: refresh analytics cache',
          isMeta: true,
        }),
      ),
    ).toBe(true)
  })

  test('classifies batches by any work-starting message', () => {
    const scaffoldingOnly = [
      createUserMessage({
        content:
          '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
        isMeta: true,
      }),
      createUserMessage({
        content:
          '<system-reminder>\nProactive mode is now enabled.\n</system-reminder>',
        isMeta: true,
      }),
    ]
    expect(shouldReportRunningForMessages(scaffoldingOnly)).toBe(false)

    expect(
      shouldReportRunningForMessages([
        ...scaffoldingOnly,
        createUserMessage({
          content: '<tick>2:57:17 PM</tick>',
          isMeta: true,
        }),
      ]),
    ).toBe(true)
  })
})
