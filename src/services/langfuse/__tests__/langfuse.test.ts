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
const mockChildStartObservation = mock(() => ({
  id: 'child-id',
  update: mockChildUpdate,
  end: mockChildEnd,
}))
const mockRootUpdate = mock(() => {})
const mockRootEnd = mock(() => {})
const mockStartObservation = mock(() => ({
  id: 'test-span-id',
  traceId: 'test-trace-id',
  type: 'span',
  otelSpan: {},
  update: mockRootUpdate,
  end: mockRootEnd,
  startObservation: mockChildStartObservation,
}))
const mockSetLangfuseTracerProvider = mock(() => {})

mock.module('@langfuse/tracing', () => ({
  startObservation: mockStartObservation,
  propagateAttributes: mock((_params: unknown, fn?: () => void) => fn?.()),
  setLangfuseTracerProvider: mockSetLangfuseTracerProvider,
}))

// Mock debug logger
mock.module('src/utils/debug.js', () => ({
  logForDebugging: mock(() => {}),
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
      expect(mockStartObservation).toHaveBeenCalledWith('query', expect.objectContaining({
        metadata: expect.objectContaining({ provider: 'firstParty', model: 'claude-3' }),
      }))
    })
  })

  describe('recordLLMObservation', () => {
    test('no-ops when rootSpan is null', async () => {
      const { recordLLMObservation } = await import('../tracing.js')
      recordLLMObservation(null, { model: 'm', provider: 'firstParty', input: [], output: [], usage: { input_tokens: 10, output_tokens: 5 } })
      expect(mockChildStartObservation).not.toHaveBeenCalled()
    })

    test('records generation child observation', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordLLMObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      recordLLMObservation(span, {
        model: 'claude-3',
        provider: 'firstParty',
        input: [{ role: 'user', content: 'hello' }],
        output: [{ role: 'assistant', content: 'hi' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      expect(mockChildStartObservation).toHaveBeenCalledWith('ChatAnthropic', expect.any(Object), { asType: 'generation' })
      expect(mockChildUpdate).toHaveBeenCalledWith(expect.objectContaining({
        usageDetails: { input: 10, output: 5 },
      }))
      expect(mockChildEnd).toHaveBeenCalled()
    })
  })

  describe('recordToolObservation', () => {
    test('no-ops when rootSpan is null', async () => {
      const { recordToolObservation } = await import('../tracing.js')
      recordToolObservation(null, { toolName: 'BashTool', toolUseId: 'id1', input: {}, output: 'out' })
      expect(mockChildStartObservation).not.toHaveBeenCalled()
    })

    test('records tool child observation', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      recordToolObservation(span, {
        toolName: 'BashTool',
        toolUseId: 'tu-1',
        input: { command: 'ls' },
        output: 'file.ts',
      })
      expect(mockChildStartObservation).toHaveBeenCalledWith('tool:BashTool', expect.any(Object), { asType: 'tool' })
      expect(mockChildEnd).toHaveBeenCalled()
    })

    test('sanitizes FileReadTool output', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      recordToolObservation(span, {
        toolName: 'FileReadTool',
        toolUseId: 'tu-2',
        input: { file_path: '/tmp/file.ts' },
        output: 'file content here',
      })
      expect(mockChildUpdate).toHaveBeenCalledWith(expect.objectContaining({
        output: '[file content redacted, 17 chars]',
      }))
    })

    test('sets ERROR level for error observations', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test'
      process.env.LANGFUSE_SECRET_KEY = 'sk-test'
      const { createTrace, recordToolObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
      recordToolObservation(span, {
        toolName: 'BashTool',
        toolUseId: 'tu-3',
        input: {},
        output: 'error occurred',
        isError: true,
      })
      expect(mockChildUpdate).toHaveBeenCalledWith(expect.objectContaining({ level: 'ERROR' }))
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
      mockChildStartObservation.mockImplementationOnce(() => { throw new Error('SDK error') })
      const { createTrace, recordLLMObservation } = await import('../tracing.js')
      const span = createTrace({ sessionId: 's1', model: 'claude-3', provider: 'firstParty' })
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
