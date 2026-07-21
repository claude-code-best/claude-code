import { describe, expect, test } from 'bun:test'
import {
  shouldLogReconnected,
  shouldSurfaceReconnect,
} from '../reconnectDisplayPolicy.js'

describe('shouldSurfaceReconnect', () => {
  test('keeps the first transient poll failure out of the live reconnect UI', () => {
    expect(shouldSurfaceReconnect(1)).toBe(false)
  })

  test('surfaces the second and later consecutive failures', () => {
    expect(shouldSurfaceReconnect(2)).toBe(true)
    expect(shouldSurfaceReconnect(5)).toBe(true)
  })

  test('logs recovery only when reconnect state was visible', () => {
    expect(shouldLogReconnected(false)).toBe(false)
    expect(shouldLogReconnected(true)).toBe(true)
  })
})
