import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

// Capture injected faults and handle calls for assertions
let mockHandle: any = null
let lastFault: any = null
let fireCloseCalled: number | null = null
let forceReconnectCalled = false
let wakePolled = false
let describeResult = 'bridge-status: ok'

mock.module('src/bridge/bridgeDebug.ts', () => ({
  getBridgeDebugHandle: () => mockHandle,
  registerBridgeDebugHandle: () => {},
  clearBridgeDebugHandle: () => {},
  injectBridgeFault: () => {},
  wrapApiForFaultInjection: (api: any) => api,
}))

function makeMockHandle() {
  return {
    fireClose: (code: number) => {
      fireCloseCalled = code
    },
    forceReconnect: () => {
      forceReconnectCalled = true
    },
    injectFault: (fault: any) => {
      lastFault = fault
    },
    wakePollLoop: () => {
      wakePolled = true
    },
    describe: () => describeResult,
  }
}

let bridgeKick: any
let callFn:
  | ((args: string) => Promise<{ type: string; value: string }>)
  | undefined

beforeEach(async () => {
  mockHandle = null
  lastFault = null
  fireCloseCalled = null
  forceReconnectCalled = false
  wakePolled = false
  const mod = await import('../bridge-kick.js')
  bridgeKick = mod.default
  const loaded = await bridgeKick.load()
  callFn = loaded.call
})

afterEach(() => {
  mockHandle = null
})

describe('bridge-kick command metadata', () => {
  test('has correct name', () => {
    expect(bridgeKick.name).toBe('bridge-kick')
  })

  test('has description', () => {
    expect(bridgeKick.description).toBeTruthy()
  })

  test('type is local', () => {
    expect(bridgeKick.type).toBe('local')
  })

  test('isEnabled returns true when USER_TYPE=ant', () => {
    const originalUserType = process.env.USER_TYPE
    process.env.USER_TYPE = 'ant'
    expect(bridgeKick.isEnabled()).toBe(true)
    if (originalUserType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = originalUserType
  })

  test('isEnabled returns false when USER_TYPE is not ant', () => {
    const originalUserType = process.env.USER_TYPE
    process.env.USER_TYPE = 'external'
    expect(bridgeKick.isEnabled()).toBe(false)
    if (originalUserType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = originalUserType
  })

  test('isEnabled returns false when USER_TYPE not set', () => {
    const originalUserType = process.env.USER_TYPE
    delete process.env.USER_TYPE
    expect(bridgeKick.isEnabled()).toBe(false)
    if (originalUserType !== undefined) process.env.USER_TYPE = originalUserType
  })

  test('supportsNonInteractive is false', () => {
    expect(bridgeKick.supportsNonInteractive).toBe(false)
  })

  test('has load function', () => {
    expect(typeof bridgeKick.load).toBe('function')
  })
})

describe('bridge-kick call - no handle registered', () => {
  test('returns error message when no handle registered', async () => {
    mockHandle = null
    const result = await callFn!('status')
    expect(result.type).toBe('text')
    expect(result.value).toContain('No bridge debug handle')
  })
})

describe('bridge-kick call - with handle', () => {
  beforeEach(() => {
    mockHandle = makeMockHandle()
  })

  test('close with valid code fires close', async () => {
    const result = await callFn!('close 1002')
    expect(result.type).toBe('text')
    expect(result.value).toContain('1002')
    expect(fireCloseCalled).toBe(1002)
  })

  test('close with 1006 fires close(1006)', async () => {
    await callFn!('close 1006')
    expect(fireCloseCalled).toBe(1006)
  })

  test('close with non-numeric code returns error', async () => {
    const result = await callFn!('close abc')
    expect(result.type).toBe('text')
    expect(result.value).toContain('need a numeric code')
  })

  test('poll transient injects transient fault and wakes poll loop', async () => {
    const result = await callFn!('poll transient')
    expect(result.type).toBe('text')
    expect(result.value).toContain('transient')
    expect(wakePolled).toBe(true)
    expect(lastFault?.kind).toBe('transient')
    expect(lastFault?.method).toBe('pollForWork')
  })

  test('poll 404 injects fatal fault with not_found_error', async () => {
    const result = await callFn!('poll 404')
    expect(result.type).toBe('text')
    expect(lastFault?.kind).toBe('fatal')
    expect(lastFault?.status).toBe(404)
    expect(lastFault?.errorType).toBe('not_found_error')
    expect(wakePolled).toBe(true)
  })

  test('poll 401 injects fatal fault with authentication_error default', async () => {
    await callFn!('poll 401')
    expect(lastFault?.status).toBe(401)
    expect(lastFault?.errorType).toBe('authentication_error')
  })

  test('poll 404 with custom type uses provided type', async () => {
    await callFn!('poll 404 custom_error')
    expect(lastFault?.errorType).toBe('custom_error')
  })

  test('poll with non-numeric non-transient returns error', async () => {
    const result = await callFn!('poll abc')
    expect(result.type).toBe('text')
    expect(result.value).toContain('need')
  })

  test('register fatal injects 403 fatal fault', async () => {
    const result = await callFn!('register fatal')
    expect(result.type).toBe('text')
    expect(result.value).toContain('403')
    expect(lastFault?.status).toBe(403)
    expect(lastFault?.kind).toBe('fatal')
    expect(lastFault?.method).toBe('registerBridgeEnvironment')
  })

  test('register fail injects transient fault with count 1', async () => {
    const result = await callFn!('register fail')
    expect(result.type).toBe('text')
    expect(lastFault?.kind).toBe('transient')
    expect(lastFault?.count).toBe(1)
  })

  test('register fail 3 injects transient fault with count 3', async () => {
    await callFn!('register fail 3')
    expect(lastFault?.count).toBe(3)
  })

  test('reconnect-session fail injects 404 fault for reconnectSession', async () => {
    const result = await callFn!('reconnect-session fail')
    expect(result.type).toBe('text')
    expect(lastFault?.method).toBe('reconnectSession')
    expect(lastFault?.status).toBe(404)
    expect(lastFault?.count).toBe(2)
  })

  test('heartbeat 401 injects authentication_error', async () => {
    await callFn!('heartbeat 401')
    expect(lastFault?.method).toBe('heartbeatWork')
    expect(lastFault?.status).toBe(401)
    expect(lastFault?.errorType).toBe('authentication_error')
  })

  test('heartbeat with non-401 status uses not_found_error', async () => {
    await callFn!('heartbeat 404')
    expect(lastFault?.status).toBe(404)
    expect(lastFault?.errorType).toBe('not_found_error')
  })

  test('heartbeat with no status defaults to 401', async () => {
    await callFn!('heartbeat')
    expect(lastFault?.status).toBe(401)
  })

  test('reconnect calls forceReconnect', async () => {
    const result = await callFn!('reconnect')
    expect(result.type).toBe('text')
    expect(result.value).toContain('reconnect')
    expect(forceReconnectCalled).toBe(true)
  })

  test('status returns bridge description', async () => {
    const result = await callFn!('status')
    expect(result.type).toBe('text')
    expect(result.value).toBe(describeResult)
  })

  test('unknown subcommand returns usage info', async () => {
    const result = await callFn!('unknown-cmd')
    expect(result.type).toBe('text')
    expect(result.value).toContain('bridge-kick')
  })

  test('empty args returns usage info', async () => {
    const result = await callFn!('')
    expect(result.type).toBe('text')
    // empty trim → undefined sub → default case
    expect(result.value).toBeTruthy()
  })
})
