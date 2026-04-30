import { describe, expect, test } from 'bun:test'

import {
  hasPendingBridgeMessages,
  isTranscriptResetResultReady,
  shouldDeferBridgeResult,
} from '../bridgeResultScheduling.js'

describe('bridgeResultScheduling', () => {
  test('detects pending mirrored messages', () => {
    expect(hasPendingBridgeMessages(2, 3)).toBe(true)
    expect(hasPendingBridgeMessages(3, 3)).toBe(false)
  })

  test('defers when the bridge handle is unavailable', () => {
    expect(
      shouldDeferBridgeResult({
        hasHandle: false,
        isConnected: true,
        lastWrittenIndex: 3,
        messageCount: 3,
      }),
    ).toBe(true)
  })

  test('defers when the bridge is connected but transcript flush is pending', () => {
    expect(
      shouldDeferBridgeResult({
        hasHandle: true,
        isConnected: true,
        lastWrittenIndex: 1,
        messageCount: 2,
      }),
    ).toBe(true)
  })

  test('sends immediately once the latest transcript is already mirrored', () => {
    expect(
      shouldDeferBridgeResult({
        hasHandle: true,
        isConnected: true,
        lastWrittenIndex: 2,
        messageCount: 2,
      }),
    ).toBe(false)
  })

  test('treats transcript reset as ready only after the transcript is empty', () => {
    expect(isTranscriptResetResultReady(true, 0)).toBe(true)
    expect(isTranscriptResetResultReady(true, 1)).toBe(false)
    expect(isTranscriptResetResultReady(false, 0)).toBe(false)
  })
})
