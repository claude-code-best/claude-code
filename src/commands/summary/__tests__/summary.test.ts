import { describe, test, expect, mock, beforeEach } from 'bun:test'

const mockManuallyExtract = mock(
  (): Promise<any> => Promise.resolve({ success: true }),
)
const mockGetContent = mock(
  (): Promise<any> => Promise.resolve('# Session Summary\n\nDid some work.'),
)

mock.module(
  require.resolve('../../../services/SessionMemory/sessionMemory.js'),
  () => ({
    manuallyExtractSessionMemory: mockManuallyExtract,
  }),
)
mock.module(
  require.resolve('../../../services/SessionMemory/sessionMemoryUtils.js'),
  () => ({
    getSessionMemoryContent: mockGetContent,
  }),
)

const { default: summaryCommand } = await import('../index.js')

const baseContext = {
  messages: [{ type: 'user', role: 'user', content: 'hello' }],
  options: { tools: [], mainLoopModel: 'test' },
  setMessages: () => {},
  onChangeAPIKey: () => {},
} as any

async function callSummary(ctx = baseContext) {
  const mod = await summaryCommand.load()
  return mod.call('', ctx)
}

beforeEach(() => {
  mockManuallyExtract.mockReset()
  mockGetContent.mockReset()
  mockManuallyExtract.mockImplementation(() =>
    Promise.resolve({ success: true }),
  )
  mockGetContent.mockImplementation(() =>
    Promise.resolve('# Session Summary\n\nDid some work.'),
  )
})

describe('summary command', () => {
  test('command metadata', () => {
    expect(summaryCommand.name).toBe('summary')
    expect(summaryCommand.type).toBe('local')
    expect(summaryCommand.isHidden).toBe(false)
    expect(typeof summaryCommand.load).toBe('function')
  })

  test('refreshes and displays summary', async () => {
    const result = await callSummary()
    expect(result.type).toBe('text')
    expect((result as any).value).toContain('Session summary updated.')
    expect((result as any).value).toContain('Did some work.')
    expect(mockManuallyExtract).toHaveBeenCalled()
  })

  test('handles extraction failure', async () => {
    mockManuallyExtract.mockImplementation(() =>
      Promise.resolve({ success: false, error: 'timeout' }),
    )
    const result = await callSummary()
    expect((result as any).value).toContain(
      'Failed to generate session summary',
    )
    expect((result as any).value).toContain('timeout')
  })

  test('handles empty content after extraction', async () => {
    mockGetContent.mockImplementation(() => Promise.resolve(''))
    const result = await callSummary()
    expect((result as any).value).toContain('content is empty')
  })

  test('handles null content after extraction', async () => {
    mockGetContent.mockImplementation(() => Promise.resolve(null))
    const result = await callSummary()
    expect((result as any).value).toContain('content is empty')
  })

  test('handles no messages', async () => {
    const result = await callSummary({ ...baseContext, messages: [] })
    expect((result as any).value).toBe('No messages to summarize.')
  })
})
