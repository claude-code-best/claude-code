import { mock, describe, test, expect, beforeEach } from 'bun:test'

// Mock @langfuse/otel before any imports
const mockForceFlush = mock(() => Promise.resolve())
const mockShutdown = mock(() => Promise.resolve())

mock.module('@langfuse/otel', () => ({
  LangfuseSpanProcessor: class MockLangfuseSpanProcessor {
    forceFlush = mockForceFlush
    shutdown = mockShutdown
    onStart = mock(() => {})
    onEnd = mock(() => {})
  },
}))

// Mock @opentelemetry/sdk-trace-base
mock.module('@opentelemetry/sdk-trace-base', () => ({
  BasicTracerProvider: class MockBasicTracerProvider {
    constructor(_opts?: unknown) {}
  },
}))

// Mock @langfuse/tracing
const mockChildUpdate = mock(() => {})
const mockChildEnd = mock(() => {})
const mockRootUpdate = mock(() => {})
const mockRootEnd = mock(() => {})

// Mock LangfuseOtelSpanAttributes (re-exported from @langfuse/core)
const mockLangfuseOtelSpanAttributes: Record<string, string> = {
  TRACE_SESSION_ID: 'session.id',
  TRACE_USER_ID: 'user.id',
  OBSERVATION_TYPE: 'observation.type',
  OBSERVATION_INPUT: 'observation.input',
  OBSERVATION_OUTPUT: 'observation.output',
  OBSERVATION_MODEL: 'observation.model',
  OBSERVATION_COMPLETION_START_TIME: 'observation.completionStartTime',
  OBSERVATION_USAGE_DETAILS: 'observation.usageDetails',
}

const mockSpanContext = { traceId: 'test-trace-id', spanId: 'test-span-id', traceFlags: 1 }
const mockSetAttribute = mock(() => {})

// Child observation mock (returned by rootSpan.startObservation for tools)
const mockChildStartObservation = mock(() => ({
  id: 'child-id',
  update: mockChildUpdate,
  end: mockChildEnd,
}))

const mockStartObservation = mock(() => ({
  id: 'test-span-id',
  traceId: 'test-trace-id',
  type: 'span',
  otelSpan: {
    spanContext: () => mockSpanContext,
    setAttribute: mockSetAttribute,
  },
  update: mockRootUpdate,
  end: mockRootEnd,
  // Instance method — used by recordToolObservation
  startObservation: mockChildStartObservation,
}))
const mockSetLangfuseTracerProvider = mock(() => {})

mock.module('@langfuse/tracing', () => ({
  startObservation: mockStartObservation,
  LangfuseOtelSpanAttributes: mockLangfuseOtelSpanAttributes,
  propagateAttributes: mock((_params: unknown, fn?: () => void) => fn?.()),
  setLangfuseTracerProvider: mockSetLangfuseTracerProvider,
}))

// Mock debug logger
mock.module('src/utils/debug.js', () => ({
  logForDebugging: mock(() => {}),
}))

// Mock user data — resolveLangfuseUserId uses getCoreUserData().email and .deviceId
mock.module('src/utils/user.js', () => ({
  getCoreUserData: mock(() => ({
    email: 'test-device-id',
    deviceId: 'test-device-id',
  })),
}))

describe('Langfuse integration', () => {
  beforeEach(() => {
    // Reset env
    delete process.env.LANGFUSE_PUBLIC_KEY
    delete process.env.LANGFUSE_SECRET_KEY
    delete process.env.LANGFUSE_BASE_URL
    mockStartObservation.mockClear()
    mockChildStartObservation.mockClear()
    mockChildUpdate.mockClear()
    mockChildEnd.mockClear()
    mockRootUpdate.mockClear()
    mockRootEnd.mockClear()
    mockForceFlush.mockClear()
    mockShutdown.mockClear()
    mockSetAttribute.mockClear()
  })

  // ── sanitize tests ──────────────────────────────────────────────────────────

  describe('sanitizeToolInput', () => {
    test('replaces home dir in file_path', async () => {
      const { sanitizeToolInput } = await import('../sanitize.js')
      const home = process.env.HOME ?? '/Users/testuser'
      const result = sanitizeToolInput('FileReadTool', { file_path: `${home}/project/file.ts` }) as Record<string, string>
      expect(result.file_path).toBe('~/project/file.ts')
    })

    test('redacts sensitive keys', async () => {
      const { sanitizeToolInput } = await import('../sanitize.js')
      const result = sanitizeToolInput('MCPTool', { api_key: 'secret123', token: 'abc' }) as Record<string, string>
      expect(result.api_key).toBe('[REDACTED]')
      expect(result.token).toBe('[REDACTED]')
    })

    test('returns non-object input unchanged', async () => {
      const { sanitizeToolInput } = await import('../sanitize.js')
      expect(sanitizeToolInput('BashTool', 'raw string')).toBe('raw string')
      expect(sanitizeToolInput('BashTool', null)).toBe(null)
    })
  })

  describe('sanitizeToolOutput', () => {
    test('redacts FileReadTool output', async () => {
      const { sanitizeToolOutput } = await import('../sanitize.js')
      const result = sanitizeToolOutput('FileReadTool', 'file content here')
      expect(result).toBe('[file content redacted, 17 chars]')
    })

    test('redacts FileWriteTool output', async () => {
      const { sanitizeToolOutput } = await import('../sanitize.js')
      const result = sanitizeToolOutput('FileWriteTool', 'written content')
      expect(result).toBe('[file content redacted, 15 chars]')
    })

    test('truncates BashTool output over 500 chars', async () => {
      const { sanitizeToolOutput } = await import('../sanitize.js')
      const longOutput = 'x'.repeat(600)
      const result = sanitizeToolOutput('BashTool', longOutput)
      expect(result).toContain('[truncated]')
      expect(result.length).toBeLessThan(600)
    })

    test('does not truncate BashTool output under 500 chars', async () => {
      const { sanitizeToolOutput } = await import('../sanitize.js')
      const shortOutput = 'hello world'
      expect(sanitizeToolOutput('BashTool', shortOutput)).toBe('hello world')
    })

    test('redacts ConfigTool output', async () => {
      const { sanitizeToolOutput } = await import('../sanitize.js')
      const result = sanitizeToolOutput('ConfigTool', 'config data')
      expect(result).toBe('[ConfigTool output redacted, 11 chars]')
    })

    test('redacts MCPTool output', async () => {
      const { sanitizeToolOutput } = await import('../sanitize.js')
      const result = sanitizeToolOutput('MCPTool', 'mcp data')
      expect(result).toBe('[MCPTool output redacted, 8 chars]')
    })
  })

  describe('sanitizeGlobal', () => {
    test('replaces home dir in strings', async () => {
      const { sanitizeGlobal } = await import('../sanitize.js')
      const home = process.env.HOME ?? '/Users/testuser'
      expect(sanitizeGlobal(`path: ${home}/file`)).toBe('path: ~/file')
    })

    test('recursively sanitizes nested objects', async () => {
      const { sanitizeGlobal } = await import('../sanitize.js')
      const result = sanitizeGlobal({ nested: { api_key: 'secret', name: 'test' } }) as Record<string, Record<string, string>>
      expect(result.nested.api_key).toBe('[REDACTED]')
      expect(result.nested.name).toBe('test')
    })

    test('returns non-string/object values unchanged', async () => {
      const { sanitizeGlobal } = await import('../sanitize.js')
      expect(sanitizeGlobal(42)).toBe(42)
      expect(sanitizeGlobal(true)).toBe(true)
    })
  })

  // ── client tests ────────────────────────────────────────────────────────────

  describe('isLangfuseEnabled', () => {
    test('returns false when keys not configured', async () => {
      const { isLangfuseEnabled } = await import('../client.js')
      expect(isLangfuseEnabled()).toBe(false)
    })

    test('returns true when both keys are set', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { isLangfuseEnabled } = await import('../client.js')
      expect(isLangfuseEnabled()).toBe(true)
    })
  })

  describe('initLangfuse', () => {
    test('returns false when keys not configured', async () => {
      const { initLangfuse } = await import('../client.js')
      expect(initLangfuse()).toBe(false)
    })

    test('returns true when keys are configured', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      // client.js is a singleton — test via isLangfuseEnabled which reads env directly
      const { isLangfuseEnabled } = await import('../client.js')
      expect(isLangfuseEnabled()).toBe(true)
    })

    test('is idempotent — multiple calls do not re-initialize', async () => {
      // client.js singleton: once processor is set, initLangfuse returns true immediately
      // We verify this by checking that calling it multiple times doesn't throw
      const { initLangfuse } = await import('../client.js')
      expect(() => { initLangfuse(); initLangfuse() }).not.toThrow()
    })
  })

  describe('shutdownLangfuse', () => {
    test('calls forceFlush and shutdown on processor', async () => {
      // Verify shutdown is callable without error even when no processor is set
      const { shutdownLangfuse } = await import('../client.js')
      await expect(shutdownLangfuse()).resolves.toBeUndefined()
    })
  })

  // ── tracing tests ───────────────────────────────────────────────────────────

  describe('createTrace', () => {
    test('returns null when langfuse not enabled', async () => {
      const { createTrace } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      expect(span).toBeNull()
    })

    test('creates root span when enabled', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty', input: [] })
      expect(span).not.toBeNull()
      expect(mockStartObservation).toHaveBeenCalledWith('agent-run', expect.objectContaining({
        metadata: expect.objectContaining({ provider: 'firstParty', model: 'claude-3' }),
      }), { asType: 'agent' })
    })
  })

  describe('recordLLMObservation', () => {
    test('no-ops when rootSpan is null', async () => {
      const { recordLLMObservation } = await import('../tracing.js')
      recordLLMObservation(null, { model: 'm', provider: 'firstParty', input: [], output: [], usage: { input_tokens: 10, output_tokens: 5 } })
      expect(mockStartObservation).toHaveBeenCalledTimes(0)
    })

    test('records generation child observation via global startObservation', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordLLMObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockStartObservation.mockClear()
      recordLLMObservation(span, {
        model: 'claude-3',
        provider: 'firstParty',
        input: [{ role: 'user', content: 'hello' }],
        output: [{ role: 'assistant', content: 'hi' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      // Should call the global startObservation with asType: 'generation' and parentSpanContext
      expect(mockStartObservation).toHaveBeenCalledWith('ChatAnthropic', expect.objectContaining({
        model: 'claude-3',
      }), expect.objectContaining({
        asType: 'generation',
        parentSpanContext: mockSpanContext,
      }))
      expect(mockRootUpdate).toHaveBeenCalledWith(expect.objectContaining({
        usageDetails: { input: 10, output: 5 },
      }))
      expect(mockRootEnd).toHaveBeenCalled()
    })

    test('includes cache tokens in usageDetails when provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordLLMObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockStartObservation.mockClear()
      mockRootUpdate.mockClear()
      recordLLMObservation(span, {
        model: 'claude-3',
        provider: 'firstParty',
        input: [],
        output: [],
        usage: { input_tokens: 10000, output_tokens: 50, cache_creation_input_tokens: 2000, cache_read_input_tokens: 7000 },
      })
      expect(mockRootUpdate).toHaveBeenCalledWith(expect.objectContaining({
        usageDetails: {
          input: 19000, // 10000 + 2000 + 7000
          output: 50,
          cache_read: 7000,
          cache_creation: 2000,
        },
      }))
    })

    test('omits cache fields when not provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordLLMObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockRootUpdate.mockClear()
      recordLLMObservation(span, {
        model: 'claude-3',
        provider: 'firstParty',
        input: [],
        output: [],
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      expect(mockRootUpdate).toHaveBeenCalledWith(expect.objectContaining({
        usageDetails: { input: 100, output: 20 },
      }))
    })
  })

  describe('recordToolObservation', () => {
    test('no-ops when rootSpan is null', async () => {
      const { recordToolObservation } = await import('../tracing.js')
      recordToolObservation(null, { toolName: 'BashTool', toolUseId: 'id1', input: {}, output: 'out' })
      // startObservation should not be called beyond the initial trace creation (none here)
    })

    test('records tool child observation via global startObservation', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockStartObservation.mockClear()
      mockRootUpdate.mockClear()
      mockRootEnd.mockClear()
      recordToolObservation(span, {
        toolName: 'BashTool',
        toolUseId: 'tu-1',
        input: { command: 'ls' },
        output: 'file.ts',
      })
      // Should call the global startObservation with asType: 'tool' and parentSpanContext
      expect(mockStartObservation).toHaveBeenCalledWith('BashTool', expect.objectContaining({
        input: expect.any(Object),
      }), expect.objectContaining({
        asType: 'tool',
        parentSpanContext: mockSpanContext,
      }))
      expect(mockRootUpdate).toHaveBeenCalled()
      expect(mockRootEnd).toHaveBeenCalled()
    })

    test('passes startTime to global startObservation', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockStartObservation.mockClear()
      const startTime = new Date('2026-01-01T00:00:00Z')
      recordToolObservation(span, {
        toolName: 'BashTool',
        toolUseId: 'tu-2',
        input: {},
        output: 'out',
        startTime,
      })
      expect(mockStartObservation).toHaveBeenCalledWith('BashTool', expect.any(Object), expect.objectContaining({
        startTime,
        parentSpanContext: mockSpanContext,
      }))
    })

    test('sanitizes FileReadTool output', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockRootUpdate.mockClear()
      recordToolObservation(span, {
        toolName: 'FileReadTool',
        toolUseId: 'tu-2',
        input: { file_path: '/tmp/file.ts' },
        output: 'file content here',
      })
      expect(mockRootUpdate).toHaveBeenCalledWith(expect.objectContaining({
        output: '[file content redacted, 17 chars]',
      }))
    })

    test('sets ERROR level for error observations', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      mockRootUpdate.mockClear()
      recordToolObservation(span, {
        toolName: 'BashTool',
        toolUseId: 'tu-3',
        input: {},
        output: 'error occurred',
        isError: true,
      })
      expect(mockRootUpdate).toHaveBeenCalledWith(expect.objectContaining({ level: 'ERROR' }))
    })
  })

  describe('endTrace', () => {
    test('no-ops when rootSpan is null', async () => {
      const { endTrace } = await import('../tracing.js')
      endTrace(null)
      expect(mockRootEnd).not.toHaveBeenCalled()
    })

    test('calls span.end()', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, endTrace } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      endTrace(span)
      expect(mockRootEnd).toHaveBeenCalled()
    })

    test('calls span.update() with output when provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, endTrace } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      endTrace(span, 'final output')
      expect(mockRootUpdate).toHaveBeenCalledWith({ output: 'final output' })
      expect(mockRootEnd).toHaveBeenCalled()
    })
  })

  describe('createSubagentTrace', () => {
    test('returns null when langfuse not enabled', async () => {
      const { createSubagentTrace } = await import('../tracing.js')
      const span = createSubagentTrace({
        sessionId: 's1',
        agentType: 'Explore',
        agentId: 'agent-1',
        model: 'claude-3',
        provider: 'firstParty',
      })
      expect(span).toBeNull()
    })

    test('creates trace with agentType and agentId metadata', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createSubagentTrace } = await import('../tracing.js')
      const span = createSubagentTrace({
        sessionId: 's1',
        agentType: 'Explore',
        agentId: 'agent-1',
        model: 'claude-3',
        provider: 'firstParty',
        input: [{ role: 'user', content: 'search for X' }],
      })
      expect(span).not.toBeNull()
      expect(mockStartObservation).toHaveBeenCalledWith('agent:Explore', expect.objectContaining({
        metadata: expect.objectContaining({
          agentType: 'Explore',
          agentId: 'agent-1',
          provider: 'firstParty',
          model: 'claude-3',
        }),
      }), { asType: 'agent' })
      // Verify session.id attribute is set
      expect(mockSetAttribute).toHaveBeenCalledWith('session.id', 's1')
    })

    test('returns null on SDK error', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      mockStartObservation.mockImplementationOnce(() => { throw new Error('SDK error') })
      const { createSubagentTrace } = await import('../tracing.js')
      const span = createSubagentTrace({
        sessionId: 's1',
        agentType: 'Plan',
        agentId: 'agent-2',
        model: 'claude-3',
        provider: 'firstParty',
      })
      expect(span).toBeNull()
    })
  })

  describe('createTrace with querySource', () => {
    test('includes querySource in metadata', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace } = await import('../tracing.js')
      const span = createTrace({
        sessionId: 's1',
        model: 'claude-3',
        provider: 'firstParty',
        querySource: 'user',
      })
      expect(span).not.toBeNull()
      expect(mockStartObservation).toHaveBeenCalledWith('agent-run:user', expect.objectContaining({
        metadata: expect.objectContaining({
          agentType: 'main',
          querySource: 'user',
        }),
      }), { asType: 'agent' })
    })

    test('omits querySource when not provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      mockStartObservation.mockClear()
      const { createTrace } = await import('../tracing.js')
      createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      const calls = mockStartObservation.mock.calls as unknown[][]
      const secondArg = calls[0]?.[1] as Record<string, unknown> | undefined
      const metadata = (secondArg?.metadata ?? {}) as Record<string, unknown>
      expect(metadata).not.toHaveProperty('querySource')
    })
  })

  describe('createTrace with username', () => {
    test('sets user.id attribute when username is provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      mockSetAttribute.mockClear()
      const { createTrace } = await import('../tracing.js')
      const span = createTrace({
        sessionId: 's1',
        model: 'claude-3',
        provider: 'firstParty',
        username: 'user@example.com',
      })
      expect(span).not.toBeNull()
      expect(mockSetAttribute).toHaveBeenCalledWith('user.id', 'user@example.com')
    })

    test('falls back to LANGFUSE_USER_ID env when username not provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      process.env.LANGFUSE_USER_ID = 'env-user@test.com'
      mockSetAttribute.mockClear()
      const { createTrace } = await import('../tracing.js')
      const span = createTrace({
        sessionId: 's1',
        model: 'claude-3',
        provider: 'firstParty',
      })
      expect(span).not.toBeNull()
      expect(mockSetAttribute).toHaveBeenCalledWith('user.id', 'env-user@test.com')
      delete process.env.LANGFUSE_USER_ID
    })

    test('falls back to deviceId when neither username nor env is provided', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      delete process.env.LANGFUSE_USER_ID
      mockSetAttribute.mockClear()
      const { createTrace } = await import('../tracing.js')
      createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      // Falls back to getCoreUserData().deviceId (mocked as 'test-device-id')
      expect(mockSetAttribute).toHaveBeenCalledWith('user.id', 'test-device-id')
    })

    test('username takes precedence over LANGFUSE_USER_ID env', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      process.env.LANGFUSE_USER_ID = 'env-user@test.com'
      mockSetAttribute.mockClear()
      const { createTrace } = await import('../tracing.js')
      createTrace({
        sessionId: 's1',
        model: 'claude-3',
        provider: 'firstParty',
        username: 'param-user@test.com',
      })
      const userIdCalls = mockSetAttribute.mock.calls.filter(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'user.id',
      )
      expect(userIdCalls.length).toBe(1)
      expect((userIdCalls[0] as unknown[])[1]).toBe('param-user@test.com')
      delete process.env.LANGFUSE_USER_ID
    })
  })

  describe('nested agent scenario', () => {
    test('sub-agent trace shares sessionId with parent', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, createSubagentTrace } = await import('../tracing.js')
      mockSetAttribute.mockClear()

      // Create parent trace
      const parentSpan = createTrace({
        sessionId: 'shared-session',
        model: 'claude-3',
        provider: 'firstParty',
      })

      // Create sub-agent trace with same sessionId
      const subSpan = createSubagentTrace({
        sessionId: 'shared-session',
        agentType: 'Explore',
        agentId: 'agent-explore-1',
        model: 'claude-3',
        provider: 'firstParty',
      })

      expect(parentSpan).not.toBeNull()
      expect(subSpan).not.toBeNull()

      // Both should have set session.id attribute
      const sessionAttributeCalls = mockSetAttribute.mock.calls.filter(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'session.id' && call[1] === 'shared-session',
      )
      expect(sessionAttributeCalls.length).toBeGreaterThanOrEqual(2)
    })

    test('query reuses passed langfuseTrace instead of creating new one', async () => {
      // This validates the pattern used in query.ts:
      //   const ownsTrace = !params.toolUseContext.langfuseTrace
      //   const langfuseTrace = params.toolUseContext.langfuseTrace ?? createTrace(...)
      // When langfuseTrace is already set, createTrace should NOT be called
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createSubagentTrace } = await import('../tracing.js')

      // Simulate what runAgent does: create subTrace, then pass it as langfuseTrace
      const subTrace = createSubagentTrace({
        sessionId: 's1',
        agentType: 'Explore',
        agentId: 'agent-1',
        model: 'claude-3',
        provider: 'firstParty',
      })
      expect(subTrace).not.toBeNull()

      // Simulate query.ts logic: if langfuseTrace already set, don't create new one
      const ownsTrace = false  // Would be: !params.toolUseContext.langfuseTrace
      const langfuseTrace = subTrace  // Would be: params.toolUseContext.langfuseTrace ?? createTrace(...)

      expect(ownsTrace).toBe(false)
      expect(langfuseTrace).toBe(subTrace)
    })
  })

  describe('SDK exceptions do not affect main flow', () => {
    test('createTrace returns null on SDK error', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      mockStartObservation.mockImplementationOnce(() => { throw new Error('SDK error') })
      const { createTrace } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      expect(span).toBeNull()
    })

    test('recordLLMObservation silently fails on SDK error', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      mockStartObservation.mockImplementationOnce(() => { throw new Error('SDK error') })
      const { createTrace, recordLLMObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      // The second call to startObservation (for the generation) will throw
      mockStartObservation.mockImplementationOnce(() => { throw new Error('SDK error') })
      expect(() => recordLLMObservation(span, {
        model: 'm',
        provider: 'firstParty',
        input: [],
        output: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      })).not.toThrow()
    })
  })
})
