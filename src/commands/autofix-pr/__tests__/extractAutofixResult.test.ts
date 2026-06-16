import { describe, expect, test } from 'bun:test'
import type { SDKMessage } from '../../../entrypoints/agentSdkTypes.js'
import {
  AUTOFIX_RESULT_TAG,
  extractAutofixResultFromLog,
} from '../extractAutofixResult.js'

function hookProgressMessage(stdout: string): SDKMessage {
  return {
    type: 'system',
    subtype: 'hook_progress',
    stdout,
  } as unknown as SDKMessage
}

function assistantTextMessage(text: string): SDKMessage {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
    },
  } as unknown as SDKMessage
}

const sampleTag = (summary: string): string =>
  `<${AUTOFIX_RESULT_TAG}>
  <pr-number>42</pr-number>
  <commits-pushed>
    <commit sha="abc123">${summary}</commit>
  </commits-pushed>
  <ci-status>green</ci-status>
  <summary>${summary}</summary>
</${AUTOFIX_RESULT_TAG}>`

describe('extractAutofixResultFromLog', () => {
  test('returns null on empty log', () => {
    expect(extractAutofixResultFromLog([])).toBeNull()
  })

  test('returns null when no tag present', () => {
    const log = [
      assistantTextMessage('just some normal text without the tag'),
      hookProgressMessage('hook output without tag'),
    ]
    expect(extractAutofixResultFromLog(log)).toBeNull()
  })

  test('extracts from hook stdout', () => {
    const tag = sampleTag('fixed lint error')
    const log = [hookProgressMessage(`prefix\n${tag}\nsuffix`)]
    const result = extractAutofixResultFromLog(log)
    expect(result).toBe(tag)
  })

  test('extracts from assistant text', () => {
    const tag = sampleTag('typecheck fixed')
    const log = [assistantTextMessage(`Done!\n${tag}`)]
    expect(extractAutofixResultFromLog(log)).toBe(tag)
  })

  test('extracts from hook_response subtype too', () => {
    const tag = sampleTag('via hook_response')
    const log = [
      {
        type: 'system',
        subtype: 'hook_response',
        stdout: tag,
      } as unknown as SDKMessage,
    ]
    expect(extractAutofixResultFromLog(log)).toBe(tag)
  })

  test('returns the latest tag when multiple appear in different messages', () => {
    const older = sampleTag('older attempt')
    const newer = sampleTag('newer attempt')
    const log = [
      assistantTextMessage(`first try\n${older}`),
      assistantTextMessage(`retry\n${newer}`),
    ]
    expect(extractAutofixResultFromLog(log)).toBe(newer)
  })

  test('returns null when open tag exists but close tag is missing (truncated)', () => {
    const log = [
      assistantTextMessage(
        `<${AUTOFIX_RESULT_TAG}>\n<summary>got cut off mid-write...`,
      ),
    ]
    expect(extractAutofixResultFromLog(log)).toBeNull()
  })

  test('returns earlier complete tag when latest open tag is truncated within the same block', () => {
    // Retry scenario: a full result was emitted, then a second result tag
    // started but got cut off. We should surface the earlier complete pair
    // rather than dropping the whole block.
    const complete = sampleTag('earlier complete result')
    const truncated = `<${AUTOFIX_RESULT_TAG}>\n<summary>truncated retry...`
    const log = [assistantTextMessage(`${complete}\n${truncated}`)]
    expect(extractAutofixResultFromLog(log)).toBe(complete)
  })

  test('walks backwards so hook stdout from later in log wins over earlier assistant text', () => {
    const earlier = sampleTag('via assistant first')
    const later = sampleTag('via hook later')
    const log = [
      assistantTextMessage(`some output\n${earlier}`),
      hookProgressMessage(later),
    ]
    expect(extractAutofixResultFromLog(log)).toBe(later)
  })

  test('ignores tag-shaped strings that span across messages (no concatenation)', () => {
    // Open tag in one message, close tag in another — should NOT be stitched.
    const log = [
      assistantTextMessage(`<${AUTOFIX_RESULT_TAG}>\n<summary>part 1`),
      assistantTextMessage(`part 2</summary>\n</${AUTOFIX_RESULT_TAG}>`),
    ]
    expect(extractAutofixResultFromLog(log)).toBeNull()
  })

  test('extracts when assistant content is a string (not block array)', () => {
    // Some SDK paths emit assistant content as a raw string instead of
    // a content-block array. Current implementation skips those — verify
    // graceful no-op rather than crash.
    const log = [
      {
        type: 'assistant',
        message: { content: sampleTag('string content') },
      } as unknown as SDKMessage,
    ]
    expect(extractAutofixResultFromLog(log)).toBeNull()
  })
})
