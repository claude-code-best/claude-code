import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { formatRemoteControlLocalStatus } from '../remoteControlStatus'

let previousBaseUrl: string | undefined
let previousToken: string | undefined

beforeEach(() => {
  previousBaseUrl = process.env.CLAUDE_BRIDGE_BASE_URL
  previousToken = process.env.CLAUDE_BRIDGE_OAUTH_TOKEN
})

afterEach(() => {
  if (previousBaseUrl === undefined) {
    delete process.env.CLAUDE_BRIDGE_BASE_URL
  } else {
    process.env.CLAUDE_BRIDGE_BASE_URL = previousBaseUrl
  }
  if (previousToken === undefined) {
    delete process.env.CLAUDE_BRIDGE_OAUTH_TOKEN
  } else {
    process.env.CLAUDE_BRIDGE_OAUTH_TOKEN = previousToken
  }
})

describe('remote control status', () => {
  test('formats self-hosted bridge local config without remote calls', () => {
    process.env.CLAUDE_BRIDGE_BASE_URL = 'http://127.0.0.1:8787'
    process.env.CLAUDE_BRIDGE_OAUTH_TOKEN = 'token'

    const status = formatRemoteControlLocalStatus()

    expect(status).toContain('Remote Control: self-hosted')
    expect(status).toContain('base_url=http://127.0.0.1:8787')
    expect(status).toContain('token=present')
    expect(status).toContain('entitlement=checked at remote-control startup')
  })
})
