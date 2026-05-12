import { describe, test, expect } from 'bun:test'
import { getLanIPs } from '../cert.js'

describe('getLanIPs', () => {
  test('returns an array', () => {
    const ips = getLanIPs()
    expect(Array.isArray(ips)).toBe(true)
  })

  test('returns only IPv4 addresses', () => {
    const ips = getLanIPs()
    for (const ip of ips) {
      // IPv4 format: x.x.x.x
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    }
  })

  test('does not include loopback addresses', () => {
    const ips = getLanIPs()
    expect(ips).not.toContain('127.0.0.1')
  })

  test('may be empty in isolated environments', () => {
    // This test just ensures it doesn't throw
    const ips = getLanIPs()
    expect(ips.length).toBeGreaterThanOrEqual(0)
  })
})
