import { describe, expect, test, mock } from 'bun:test'
import {
  toolInfoFromToolUse,
  toolUpdateFromToolResult,
  toolUpdateFromEditToolResponse,
  forwardSessionUpdates,
  nextSdkMessageOrAbort,
  replayHistoryMessages,
} from '../bridge.js'
import { promptToQueryInput } from '../promptConversion.js'
import { markdownEscape, toDisplayPath } from '../utils.js'
import type { AgentSideConnection, ToolKind } from '@agentclientprotocol/sdk'
import type { SDKMessage } from '../../../entrypoints/sdk/coreTypes.js'

// ── Helpers ────────────────────────────────────────────────────────

function makeConn(
  overrides: Partial<AgentSideConnection> = {},
): AgentSideConnection {
  return {
    sessionUpdate: mock(async () => {}),
    requestPermission: mock(
      async () => ({ outcome: { outcome: 'cancelled' } }) as any,
    ),
    ...overrides,
  } as unknown as AgentSideConnection
}

async function* makeStream(
  msgs: SDKMessage[],
): AsyncGenerator<SDKMessage, void, unknown> {
  for (const m of msgs) yield m
}

async function* makeWaitingStream(): AsyncGenerator<SDKMessage, void, unknown> {
  await new Promise<never>(() => {})
}

// ── toolInfoFromToolUse ────────────────────────────────────────────

describe('toolInfoFromToolUse', () => {
  const kindCases: Array<[string, ToolKind]> = [
    ['Read', 'read'],
    ['Edit', 'edit'],
    ['Write', 'edit'],
    ['Bash', 'execute'],
    ['Glob', 'search'],
    ['Grep', 'search'],
    ['WebFetch', 'fetch'],
    ['WebSearch', 'fetch'],
    ['Agent', 'think'],
    ['Task', 'think'],
    ['TodoWrite', 'think'],
    ['ExitPlanMode', 'switch_mode'],
  ]

  for (const [name, expected] of kindCases) {
    test(`${name} → ${expected}`, () => {
      const info = toolInfoFromToolUse({ name, id: 'test', input: {} })
      expect(info.kind).toBe(expected)
    })
  }

  test('unknown tool name → other', () => {
    expect(
      toolInfoFromToolUse({ name: 'SomeFancyTool', id: 'x', input: {} }).kind,
    ).toBe('other' as ToolKind)
    expect(toolInfoFromToolUse({ name: '', id: 'x', input: {} }).kind).toBe(
      'other' as ToolKind,
    )
  })

  // ── Bash ──────────────────────────────────────────────────────

  test('Bash with command → title shows command', () => {
    const info = toolInfoFromToolUse({
      name: 'Bash',
      id: 'x',
      input: { command: 'ls -la', description: 'List files' },
    })
    expect(info.title).toBe('ls -la')
    expect(info.content).toEqual([
      { type: 'content', content: { type: 'text', text: 'List files' } },
    ])
  })

  test('Bash with terminalOutput flag → no longer emits fake terminalId (audit §5.2)', () => {
    // Standard ACP terminal lifecycle is not wired through BashTool; previously
    // this returned { type: 'terminal', terminalId: toolUse.id } which would
    // cause compliant clients to fail terminal/output lookups. The flag is now
    // ignored until terminal/create is actually plumbed through.
    const info = toolInfoFromToolUse(
      { name: 'Bash', id: 'tu_123', input: { command: 'ls' } },
      true,
    )
    expect(info.kind).toBe('execute')
    expect(info.content).toEqual([])
    expect(info.title).toBe('ls')
  })

  test('Bash with terminalOutput flag + description → falls back to description text', () => {
    const info = toolInfoFromToolUse(
      {
        name: 'Bash',
        id: 'tu_456',
        input: { command: 'ls', description: 'list files' },
      },
      true,
    )
    expect(info.content).toEqual([
      {
        type: 'content',
        content: { type: 'text', text: 'list files' },
      },
    ])
  })

  test('Bash without description → empty content', () => {
    const info = toolInfoFromToolUse({
      name: 'Bash',
      id: 'x',
      input: { command: 'ls' },
    })
    expect(info.content).toEqual([])
  })

  // ── Glob ──────────────────────────────────────────────────────

  test('Glob with pattern → title shows Find', () => {
    const info = toolInfoFromToolUse({
      name: 'Glob',
      id: 'x',
      input: { pattern: '*/**.ts' },
    })
    expect(info.title).toBe('Find `*/**.ts`')
    expect(info.locations).toEqual([])
  })

  test('Glob with path → locations include path', () => {
    const info = toolInfoFromToolUse({
      name: 'Glob',
      id: 'x',
      input: { pattern: '*.ts', path: '/src' },
    })
    expect(info.title).toBe('Find `/src` `*.ts`')
    expect(info.locations).toEqual([{ path: '/src' }])
  })

  // ── Task/Agent ────────────────────────────────────────────────

  test('Task with description and prompt → content has prompt text', () => {
    const info = toolInfoFromToolUse({
      name: 'Task',
      id: 'x',
      input: { description: 'Handle task', prompt: 'Do the work' },
    })
    expect(info.title).toBe('Handle task')
    expect(info.content).toEqual([
      { type: 'content', content: { type: 'text', text: 'Do the work' } },
    ])
  })

  // ── Grep ──────────────────────────────────────────────────────

  test('Grep with full flags', () => {
    const info = toolInfoFromToolUse({
      name: 'Grep',
      id: 'x',
      input: {
        pattern: 'todo',
        path: '/src',
        '-i': true,
        '-n': true,
        '-A': 3,
        '-B': 2,
        '-C': 5,
        head_limit: 10,
        glob: '*.ts',
        type: 'js',
        multiline: true,
      },
    })
    expect(info.title).toContain('-i')
    expect(info.title).toContain('-n')
    expect(info.title).toContain('-A 3')
    expect(info.title).toContain('-B 2')
    expect(info.title).toContain('-C 5')
    expect(info.title).toContain('| head -10')
    expect(info.title).toContain('--include="*.ts"')
    expect(info.title).toContain('--type=js')
    expect(info.title).toContain('-P')
    expect(info.title).toContain('"todo"')
    expect(info.title).toContain('/src')
  })

  test('Grep with files_with_matches → -l', () => {
    const info = toolInfoFromToolUse({
      name: 'Grep',
      id: 'x',
      input: { pattern: 'foo', output_mode: 'files_with_matches' },
    })
    expect(info.title).toContain('-l')
  })

  test('Grep with count → -c', () => {
    const info = toolInfoFromToolUse({
      name: 'Grep',
      id: 'x',
      input: { pattern: 'foo', output_mode: 'count' },
    })
    expect(info.title).toContain('-c')
  })

  // ── Write ─────────────────────────────────────────────────────

  test('Write with file_path and content → diff content', () => {
    const info = toolInfoFromToolUse({
      name: 'Write',
      id: 'x',
      input: {
        file_path: '/Users/test/project/example.txt',
        content: 'Hello, World!\nThis is test content.',
      },
    })
    expect(info.kind).toBe('edit')
    expect(info.title).toBe('Write /Users/test/project/example.txt')
    expect(info.content).toEqual([
      {
        type: 'diff',
        path: '/Users/test/project/example.txt',
        oldText: null,
        newText: 'Hello, World!\nThis is test content.',
      },
    ])
    expect(info.locations).toEqual([
      { path: '/Users/test/project/example.txt' },
    ])
  })

  // ── Edit ──────────────────────────────────────────────────────

  test('Edit with file_path → diff content', () => {
    const info = toolInfoFromToolUse({
      name: 'Edit',
      id: 'x',
      input: {
        file_path: '/Users/test/project/test.txt',
        old_string: 'old text',
        new_string: 'new text',
      },
    })
    expect(info.kind).toBe('edit')
    expect(info.title).toBe('Edit /Users/test/project/test.txt')
    expect(info.content).toEqual([
      {
        type: 'diff',
        path: '/Users/test/project/test.txt',
        oldText: 'old text',
        newText: 'new text',
      },
    ])
  })

  test('Edit without file_path → empty content', () => {
    const info = toolInfoFromToolUse({ name: 'Edit', id: 'x', input: {} })
    expect(info.title).toBe('Edit')
    expect(info.content).toEqual([])
  })

  // ── Read ──────────────────────────────────────────────────────

  test('Read with file_path → locations include path and line 1', () => {
    const info = toolInfoFromToolUse({
      name: 'Read',
      id: 'x',
      input: { file_path: '/src/foo.ts' },
    })
    expect(info.locations).toEqual([{ path: '/src/foo.ts', line: 1 }])
  })

  test('Read with limit', () => {
    const info = toolInfoFromToolUse({
      name: 'Read',
      id: 'x',
      input: { file_path: '/large.txt', limit: 100 },
    })
    expect(info.title).toContain('(1 - 100)')
  })

  test('Read with offset and limit', () => {
    const info = toolInfoFromToolUse({
      name: 'Read',
      id: 'x',
      input: { file_path: '/large.txt', offset: 50, limit: 100 },
    })
    expect(info.title).toContain('(50 - 149)')
    expect(info.locations).toEqual([{ path: '/large.txt', line: 50 }])
  })

  test('Read with only offset', () => {
    const info = toolInfoFromToolUse({
      name: 'Read',
      id: 'x',
      input: { file_path: '/large.txt', offset: 200 },
    })
    expect(info.title).toContain('(from line 200)')
  })

  test('Read with cwd → relative path in title, absolute in locations', () => {
    const info = toolInfoFromToolUse(
      {
        name: 'Read',
        id: 'x',
        input: { file_path: '/Users/test/project/src/main.ts' },
      },
      false,
      '/Users/test/project',
    )
    expect(info.title).toBe('Read src/main.ts')
    expect(info.locations).toEqual([
      { path: '/Users/test/project/src/main.ts', line: 1 },
    ])
  })

  test('Read with relative file_path and cwd → locations resolved to absolute', () => {
    // Audit §5.5: ToolCallLocation.path MUST be absolute. A relative input
    // path is resolved against the session cwd before being emitted.
    const info = toolInfoFromToolUse(
      {
        name: 'Read',
        id: 'x',
        input: { file_path: 'src/main.ts' },
      },
      false,
      '/Users/test/project',
    )
    expect(info.locations).toEqual([
      { path: '/Users/test/project/src/main.ts', line: 1 },
    ])
  })

  test('Write with relative file_path and cwd → diff path resolved absolute', () => {
    // Audit §5.5: Diff.path MUST be absolute.
    const info = toolInfoFromToolUse(
      {
        name: 'Write',
        id: 'x',
        input: { file_path: 'rel/file.txt', content: 'hi' },
      },
      false,
      '/Users/test/project',
    )
    expect(info.content).toEqual([
      {
        type: 'diff',
        path: '/Users/test/project/rel/file.txt',
        oldText: null,
        newText: 'hi',
      },
    ])
    expect(info.locations).toEqual([
      { path: '/Users/test/project/rel/file.txt' },
    ])
  })

  test('Edit with relative file_path and cwd → diff path resolved absolute', () => {
    // Audit §5.5: Diff.path MUST be absolute.
    const info = toolInfoFromToolUse(
      {
        name: 'Edit',
        id: 'x',
        input: {
          file_path: 'rel/edit.txt',
          old_string: 'a',
          new_string: 'b',
        },
      },
      false,
      '/Users/test/project',
    )
    expect(info.content).toEqual([
      {
        type: 'diff',
        path: '/Users/test/project/rel/edit.txt',
        oldText: 'a',
        newText: 'b',
      },
    ])
    expect(info.locations).toEqual([
      { path: '/Users/test/project/rel/edit.txt' },
    ])
  })

  test('Glob with relative path and cwd → locations resolved absolute', () => {
    // Audit §5.5: ToolCallLocation.path MUST be absolute. Title keeps the raw
    // input for display, but the emitted location is resolved against cwd.
    const info = toolInfoFromToolUse(
      {
        name: 'Glob',
        id: 'x',
        input: { pattern: '*.ts', path: 'src' },
      },
      false,
      '/Users/test/project',
    )
    expect(info.title).toBe('Find `src` `*.ts`')
    expect(info.locations).toEqual([{ path: '/Users/test/project/src' }])
  })

  // ── WebSearch ─────────────────────────────────────────────────

  test('WebSearch with allowed/blocked domains', () => {
    const info = toolInfoFromToolUse({
      name: 'WebSearch',
      id: 'x',
      input: {
        query: 'test',
        allowed_domains: ['a.com'],
        blocked_domains: ['b.com'],
      },
    })
    expect(info.title).toContain('allowed: a.com')
    expect(info.title).toContain('blocked: b.com')
  })

  // ── TodoWrite ─────────────────────────────────────────────────

  test('TodoWrite with todos array → title shows content', () => {
    const info = toolInfoFromToolUse({
      name: 'TodoWrite',
      id: 'x',
      input: { todos: [{ content: 'Task 1' }, { content: 'Task 2' }] },
    })
    expect(info.title).toContain('Task 1')
    expect(info.title).toContain('Task 2')
  })

  // ── ExitPlanMode ──────────────────────────────────────────────

  test('ExitPlanMode with plan → content has plan text', () => {
    const info = toolInfoFromToolUse({
      name: 'ExitPlanMode',
      id: 'x',
      input: { plan: 'Do the thing' },
    })
    expect(info.title).toBe('Ready to code?')
    expect(info.content).toEqual([
      { type: 'content', content: { type: 'text', text: 'Do the thing' } },
    ])
  })
})

describe('promptToQueryInput', () => {
  test('uses shared prompt conversion for resource links', () => {
    expect(
      promptToQueryInput([
        {
          type: 'resource_link',
          name: 'Spec',
          uri: 'file:///tmp/spec.md',
        } as any,
      ]),
    ).toBe('Resource link: name=Spec, uri=file:///tmp/spec.md')
  })
})

// ── toolUpdateFromToolResult ───────────────────────────────────────

describe('toolUpdateFromToolResult', () => {
  test('returns empty for Edit success', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [{ type: 'text', text: 'The file has been edited' }],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'Edit', id: 't1' },
    )
    expect(result).toEqual({})
  })

  test('returns error content for Edit failure', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [{ type: 'text', text: 'Failed to find `old_string`' }],
        is_error: true,
        tool_use_id: 't1',
      },
      { name: 'Edit', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: {
          type: 'text',
          text: '```\nFailed to find `old_string`\n```',
        },
      },
    ])
  })

  test('returns markdown-escaped content for Read', () => {
    const result = toolUpdateFromToolResult(
      { content: 'let x = 1', is_error: false, tool_use_id: 't1' },
      { name: 'Read', id: 't1' },
    )
    expect(result.content).toBeDefined()
    expect(result.content![0].type).toBe('content')
    // Should be wrapped in markdown code fence
    const text = (
      result.content![0] as {
        type: string
        content: { type: string; text: string }
      }
    ).content.text
    expect(text).toContain('```')
    expect(text).toContain('let x = 1')
  })

  test('returns console block for Bash output', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [{ type: 'text', text: 'hello world' }],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'Bash', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: { type: 'text', text: '```console\nhello world\n```' },
      },
    ])
  })

  test('Bash with terminalOutput flag → falls back to inline text (audit §5.2)', () => {
    // Standard ACP terminal lifecycle is not wired; the flag is now ignored
    // and no fake terminalId / non-standard _meta keys are emitted.
    const result = toolUpdateFromToolResult(
      {
        content: [{ type: 'text', text: 'output' }],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'Bash', id: 't1' },
      true,
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: { type: 'text', text: '```console\noutput\n```' },
      },
    ])
    expect(result._meta).toBeUndefined()
  })

  test('handles bash_code_execution_result format', () => {
    const result = toolUpdateFromToolResult(
      {
        content: {
          type: 'bash_code_execution_result',
          stdout: 'out',
          stderr: 'err',
          return_code: 0,
        },
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'Bash', id: 't1' },
      true,
    )
    // terminalOutput flag is ignored; bash_code_execution_result is rendered
    // as inline console text just like plain string content.
    expect(result.content).toEqual([
      {
        type: 'content',
        content: { type: 'text', text: '```console\nout\nerr\n```' },
      },
    ])
    expect(result._meta).toBeUndefined()
  })

  test('returns empty when no toolUse', () => {
    const result = toolUpdateFromToolResult(
      { content: 'text', is_error: false },
      undefined,
    )
    expect(result).toEqual({})
  })

  test('transforms tool_reference content', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [{ type: 'tool_reference', tool_name: 'some_tool' }],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'SearchExtraTools', id: 't1' },
    )
    expect(result.content).toEqual([
      { type: 'content', content: { type: 'text', text: 'Tool: some_tool' } },
    ])
  })

  test('transforms web_search_result content', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [
          {
            type: 'web_search_result',
            title: 'Test Result',
            url: 'https://example.com',
          },
        ],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'WebSearch', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: { type: 'text', text: 'Test Result (https://example.com)' },
      },
    ])
  })

  test('transforms code_execution_result content', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [
          { type: 'code_execution_result', stdout: 'Hello World', stderr: '' },
        ],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'CodeExecution', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: { type: 'text', text: 'Output: Hello World' },
      },
    ])
  })

  test('returns title for ExitPlanMode', () => {
    const result = toolUpdateFromToolResult(
      { content: 'ok', is_error: false, tool_use_id: 't1' },
      { name: 'ExitPlanMode', id: 't1' },
    )
    expect(result.title).toBe('Exited Plan Mode')
  })

  test('renders resource_link content as ACP ResourceLink (audit §7.3)', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [
          {
            type: 'resource_link',
            uri: 'file:///tmp/spec.md',
            name: 'Spec',
            mimeType: 'text/markdown',
          },
        ],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'SomeTool', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: {
          type: 'resource_link',
          uri: 'file:///tmp/spec.md',
          name: 'Spec',
          mimeType: 'text/markdown',
        },
      },
    ])
  })

  test('resource_link without name falls back to uri (audit §7.3)', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [{ type: 'resource_link', uri: 'file:///tmp/x.md' }],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'SomeTool', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: {
          type: 'resource_link',
          uri: 'file:///tmp/x.md',
          name: 'file:///tmp/x.md',
          mimeType: undefined,
        },
      },
    ])
  })

  test('renders resource content as ACP EmbeddedResource (audit §7.3)', () => {
    const result = toolUpdateFromToolResult(
      {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file:///tmp/readme.md',
              mimeType: 'text/markdown',
              text: '# Hello',
            },
          },
        ],
        is_error: false,
        tool_use_id: 't1',
      },
      { name: 'SomeTool', id: 't1' },
    )
    expect(result.content).toEqual([
      {
        type: 'content',
        content: {
          type: 'resource',
          resource: {
            uri: 'file:///tmp/readme.md',
            mimeType: 'text/markdown',
            text: '# Hello',
            blob: undefined,
          },
        },
      },
    ])
  })
})

// ── toolUpdateFromEditToolResponse ─────────────────────────────────

describe('toolUpdateFromEditToolResponse', () => {
  test('returns empty for null/undefined/string', () => {
    expect(toolUpdateFromEditToolResponse(null)).toEqual({})
    expect(toolUpdateFromEditToolResponse(undefined)).toEqual({})
    expect(toolUpdateFromEditToolResponse('string')).toEqual({})
  })

  test('returns empty when filePath or structuredPatch missing', () => {
    expect(toolUpdateFromEditToolResponse({})).toEqual({})
    expect(toolUpdateFromEditToolResponse({ filePath: '/foo.ts' })).toEqual({})
    expect(toolUpdateFromEditToolResponse({ structuredPatch: [] })).toEqual({})
  })

  test('builds diff content from single hunk', () => {
    const result = toolUpdateFromEditToolResponse({
      filePath: '/Users/test/project/test.txt',
      structuredPatch: [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 3,
          lines: [
            ' context before',
            '-old line',
            '+new line',
            ' context after',
          ],
        },
      ],
    })
    expect(result).toEqual({
      content: [
        {
          type: 'diff',
          path: '/Users/test/project/test.txt',
          oldText: 'context before\nold line\ncontext after',
          newText: 'context before\nnew line\ncontext after',
        },
      ],
      locations: [{ path: '/Users/test/project/test.txt', line: 1 }],
    })
  })

  test('builds multiple diff blocks for replaceAll with multiple hunks', () => {
    const result = toolUpdateFromEditToolResponse({
      filePath: '/Users/test/project/file.ts',
      structuredPatch: [
        {
          oldStart: 5,
          oldLines: 1,
          newStart: 5,
          newLines: 1,
          lines: ['-oldValue', '+newValue'],
        },
        {
          oldStart: 20,
          oldLines: 1,
          newStart: 20,
          newLines: 1,
          lines: ['-oldValue', '+newValue'],
        },
      ],
    })
    expect(result.content).toHaveLength(2)
    expect(result.locations).toHaveLength(2)
    expect(result.locations).toEqual([
      { path: '/Users/test/project/file.ts', line: 5 },
      { path: '/Users/test/project/file.ts', line: 20 },
    ])
  })

  test('handles deletion (newText becomes empty string)', () => {
    const result = toolUpdateFromEditToolResponse({
      filePath: '/Users/test/project/file.ts',
      structuredPatch: [
        {
          oldStart: 10,
          oldLines: 2,
          newStart: 10,
          newLines: 1,
          lines: [' context', '-removed line'],
        },
      ],
    })
    expect(result.content).toEqual([
      {
        type: 'diff',
        path: '/Users/test/project/file.ts',
        oldText: 'context\nremoved line',
        newText: 'context',
      },
    ])
  })

  test('returns empty for empty structuredPatch array', () => {
    expect(
      toolUpdateFromEditToolResponse({
        filePath: '/foo.ts',
        structuredPatch: [],
      }),
    ).toEqual({})
  })

  test('resolves relative filePath against cwd (audit §5.5)', () => {
    // ToolCallLocation.path / Diff.path MUST be absolute.
    const result = toolUpdateFromEditToolResponse(
      {
        filePath: 'rel/file.ts',
        structuredPatch: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ['-old', '+new'],
          },
        ],
      },
      '/Users/test/project',
    )
    expect(result).toEqual({
      content: [
        {
          type: 'diff',
          path: '/Users/test/project/rel/file.ts',
          oldText: 'old',
          newText: 'new',
        },
      ],
      locations: [{ path: '/Users/test/project/rel/file.ts', line: 1 }],
    })
  })

  test('keeps absolute filePath unchanged when cwd provided', () => {
    const result = toolUpdateFromEditToolResponse(
      {
        filePath: '/abs/file.ts',
        structuredPatch: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ['-old', '+new'],
          },
        ],
      },
      '/Users/test/project',
    )
    expect(result.content![0]).toMatchObject({ path: '/abs/file.ts' })
    expect(result.locations![0]).toMatchObject({ path: '/abs/file.ts' })
  })
})

// ── markdownEscape ─────────────────────────────────────────────────

describe('markdownEscape', () => {
  test('wraps basic text in code fence', () => {
    expect(markdownEscape('Hello *world*!')).toBe('```\nHello *world*!\n```')
  })

  test('extends fence for text containing backtick fences', () => {
    const text = 'for example:\n```markdown\nHello *world*!\n```\n'
    expect(markdownEscape(text)).toBe(
      '````\nfor example:\n```markdown\nHello *world*!\n```\n````',
    )
  })
})

// ── toDisplayPath ──────────────────────────────────────────────────

describe('toDisplayPath', () => {
  test('relativizes paths inside cwd', () => {
    expect(
      toDisplayPath('/Users/test/project/src/main.ts', '/Users/test/project'),
    ).toBe('src/main.ts')
  })

  test('keeps absolute paths outside cwd', () => {
    expect(toDisplayPath('/etc/hosts', '/Users/test/project')).toBe(
      '/etc/hosts',
    )
  })

  test('returns original when no cwd', () => {
    expect(toDisplayPath('/Users/test/project/src/main.ts')).toBe(
      '/Users/test/project/src/main.ts',
    )
  })

  test('partial directory name match does not relativize', () => {
    expect(
      toDisplayPath('/Users/test/project-other/file.ts', '/Users/test/project'),
    ).toBe('/Users/test/project-other/file.ts')
  })
})

// ── forwardSessionUpdates ─────────────────────────────────────────

describe('nextSdkMessageOrAbort', () => {
  test('returns done:true when aborted while waiting for next message', async () => {
    const ac = new AbortController()
    const pending = nextSdkMessageOrAbort(makeWaitingStream(), ac.signal)
    ac.abort()

    const result = await Promise.race([
      pending,
      new Promise<'timeout'>(resolve => setTimeout(resolve, 100, 'timeout')),
    ])

    expect(result).toEqual({ done: true, value: undefined })
  })

  test('returns done:true when stream is done', async () => {
    const result = await nextSdkMessageOrAbort(
      makeStream([]),
      new AbortController().signal,
    )

    expect(result).toEqual({ done: true, value: undefined })
  })

  test('returns a valid SDKMessage via IteratorResult', async () => {
    const msg = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      },
    } as unknown as SDKMessage

    const result = await nextSdkMessageOrAbort(
      makeStream([msg]),
      new AbortController().signal,
    )

    expect(result).toEqual({ done: false, value: msg })
  })
})

describe('forwardSessionUpdates', () => {
  test('returns end_turn when stream is empty', async () => {
    const conn = makeConn()
    const result = await forwardSessionUpdates(
      's1',
      makeStream([]),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('end_turn')
  })

  test('returns cancelled when aborted before iteration', async () => {
    const ac = new AbortController()
    ac.abort()
    const conn = makeConn()
    const result = await forwardSessionUpdates(
      's1',
      makeStream([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'hi' }] },
        } as unknown as SDKMessage,
      ]),
      conn,
      ac.signal,
      {},
    )
    expect(result.stopReason).toBe('cancelled')
  })

  test('cleans abort listeners when sdkMessages.next wins repeatedly', async () => {
    const ac = new AbortController()
    let abortListeners = 0
    const add = ac.signal.addEventListener.bind(ac.signal)
    const remove = ac.signal.removeEventListener.bind(ac.signal)
    const addEventListener: AbortSignal['addEventListener'] = (
      type: keyof AbortSignalEventMap,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'abort') abortListeners++
      return add(type, listener, options)
    }
    const removeEventListener: AbortSignal['removeEventListener'] = (
      type: keyof AbortSignalEventMap,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'abort') abortListeners--
      return remove(type, listener, options)
    }
    ac.signal.addEventListener = addEventListener
    ac.signal.removeEventListener = removeEventListener

    const msgs = Array.from(
      { length: 10_000 },
      () =>
        ({
          type: 'system',
          subtype: 'api_retry',
        }) as unknown as SDKMessage,
    )

    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      makeConn(),
      ac.signal,
      {},
    )

    expect(result.stopReason).toBe('end_turn')
    expect(abortListeners).toBe(0)
  })

  test('cleans abort listeners when abort wins the race', async () => {
    const ac = new AbortController()
    let abortListeners = 0
    const add = ac.signal.addEventListener.bind(ac.signal)
    const remove = ac.signal.removeEventListener.bind(ac.signal)
    ac.signal.addEventListener = (
      type: keyof AbortSignalEventMap,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'abort') abortListeners++
      return add(type, listener, options)
    }
    ac.signal.removeEventListener = (
      type: keyof AbortSignalEventMap,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'abort') abortListeners--
      return remove(type, listener, options)
    }

    async function* never(): AsyncGenerator<SDKMessage, void, unknown> {
      await new Promise(() => {})
    }

    const resultPromise = forwardSessionUpdates(
      's1',
      never(),
      makeConn(),
      ac.signal,
      {},
    )
    ac.abort()
    const result = await resultPromise

    expect(result.stopReason).toBe('cancelled')
    expect(abortListeners).toBe(0)
  })

  test('forwards assistant text message as agent_message_chunk', async () => {
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello!' }],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toMatchObject({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello!' },
      },
    })
    expect(result.stopReason).toBe('end_turn')
  })

  test('forwards thinking block as agent_thought_chunk', async () => {
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'thinking', thinking: 'reasoning...' }],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    expect(calls[0][0].update).toMatchObject({
      sessionUpdate: 'agent_thought_chunk',
    })
  })

  test('forwards tool_use block as tool_call', async () => {
    const conn = makeConn()
    const input = { command: 'ls' }
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'Bash',
              input,
            },
          ],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const update = (conn.sessionUpdate as ReturnType<typeof mock>).mock
      .calls[0][0].update as Record<string, unknown>
    expect(update.sessionUpdate).toBe('tool_call')
    expect(update.toolCallId).toBe('tu_1')
    expect(update.kind).toBe('execute' as ToolKind)
    expect(update.status).toBe('pending')
    expect(update.rawInput).toEqual(input)
    expect(update.rawInput).not.toBe(input)
  })

  test('emits tool_call_update with status in_progress when tool_use is encountered again (audit §4.2)', async () => {
    // When the same tool_use block is seen twice (first via content_block_start
    // in stream_event, then again in the final assistant message), the second
    // encounter signals "input fully received, about to execute" and is emitted
    // as a tool_call_update with status:'in_progress' per ACP v1 ToolCallStatus
    // lifecycle (pending → in_progress → completed|failed).
    const conn = makeConn()
    const input = { command: 'ls' }
    const msgs: SDKMessage[] = [
      // streaming content_block_start: first sighting of tool_use
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: {
            type: 'tool_use',
            id: 'tu_2',
            name: 'Bash',
            input: {},
          },
        },
      } as unknown as SDKMessage,
      // final assistant message: tool_use block with full input
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tu_2', name: 'Bash', input }],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const statuses = calls
      .map((c: unknown[]) => {
        const u = (c[0] as { update?: Record<string, unknown> }).update
        return u && u.toolCallId === 'tu_2'
          ? {
              sessionUpdate: u.sessionUpdate,
              status: u.status,
            }
          : null
      })
      .filter(Boolean)
    // First: tool_call pending; second: tool_call_update in_progress
    expect(statuses[0]).toEqual({
      sessionUpdate: 'tool_call',
      status: 'pending',
    })
    expect(statuses[1]).toEqual({
      sessionUpdate: 'tool_call_update',
      status: 'in_progress',
    })
  })

  test('returns accumulated usage on result message without sending usage_update when no assistant message seen', async () => {
    // Without a preceding assistant message we have no reliable "tokens
    // currently in context" reading, so usage_update is skipped. Token totals
    // are still aggregated for the PromptResponse return value.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
        total_cost_usd: 0.01,
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('end_turn')
    expect(result.usage).toBeDefined()
    expect(result.usage!.inputTokens).toBe(100)
    expect(result.usage!.outputTokens).toBe(50)
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const usageUpdate = calls.find(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'usage_update',
    )
    expect(usageUpdate).toBeUndefined()
  })

  test('emits usage_update with exact modelUsage context window when assistant message precedes result', async () => {
    // Per session-usage.mdx RFD: after a turn, emit usage_update so clients can
    // display context window utilization. The size comes from modelUsage keyed
    // by exact model id match.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'hi' }],
          role: 'assistant',
          model: 'claude-opus-4-20250514',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 5,
          },
        },
        parent_tool_use_id: null,
      } as unknown as SDKMessage,
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        modelUsage: {
          'claude-opus-4-20250514': { contextWindow: 1000000 },
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const usageUpdate = calls.find(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'usage_update',
    )
    expect(usageUpdate).toBeDefined()
    const update = (
      usageUpdate![0] as { update: { used: number; size: number } }
    ).update
    // used = lastAssistantTotalUsage = 100 + 50 + 10 + 5 = 165
    expect(update.used).toBe(165)
    expect(update.size).toBe(1000000)
  })

  test('emits usage_update with prefix-matched modelUsage context window', async () => {
    // Model id 'claude-opus-4-6-20250514' prefix-matches the modelUsage key
    // 'claude-opus-4-6' to resolve contextWindow = 2000000.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'hi' }],
          role: 'assistant',
          model: 'claude-opus-4-6-20250514',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
      } as unknown as SDKMessage,
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        modelUsage: {
          'claude-opus-4-6': { contextWindow: 2000000 },
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const usageUpdate = calls.find(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'usage_update',
    )
    expect(usageUpdate).toBeDefined()
    const update = (
      usageUpdate![0] as { update: { used: number; size: number } }
    ).update
    expect(update.used).toBe(150)
    expect(update.size).toBe(2000000)
  })

  test('maps refusal stop_reason to ACP refusal stop reason', async () => {
    // Audit §3.3: a safety refusal must surface as StopReason::refusal rather
    // than being misreported as end_turn.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        stop_reason: 'refusal',
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('refusal')
  })

  test('success with max_tokens stop_reason maps to max_tokens when not error', async () => {
    // Audit §3.3/§3.4: success + max_tokens + no error surfaces max_tokens.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        stop_reason: 'max_tokens',
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('max_tokens')
  })

  test('success with max_tokens stop_reason falls back to end_turn when isError', async () => {
    // Audit §3.3: in the success branch, isError acts as a last-resort
    // override to end_turn per the merged fix diff.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: '',
        stop_reason: 'max_tokens',
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('end_turn')
  })

  test('maps error_during_execution with max_tokens stop_reason', async () => {
    // Audit §3.4: error_during_execution branch must preserve max_tokens even
    // when isError is set (mutually exclusive branches).
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: '',
        stop_reason: 'max_tokens',
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('max_tokens')
  })

  test('maps error_during_execution without max_tokens to end_turn', async () => {
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: '',
        stop_reason: 'end_turn',
      } as unknown as SDKMessage,
    ]
    const result = await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    expect(result.stopReason).toBe('end_turn')
  })

  test('compact_boundary emits completion message without usage_update', async () => {
    // After audit §4.1, compact_boundary still sends the "Compacting completed."
    // agent_message_chunk but no longer emits the unstable usage_update
    // notification.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      { type: 'system', subtype: 'compact_boundary' } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const usageCall = calls.find(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'usage_update',
    )
    expect(usageCall).toBeUndefined()
    const messageCall = calls.find(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'agent_message_chunk',
    )
    expect(messageCall).toBeDefined()
  })

  test('ignores unknown message types without crashing', async () => {
    const conn = makeConn()
    const debug = console.debug
    const debugMock = mock(() => {})
    console.debug = debugMock as typeof console.debug

    try {
      const result = await forwardSessionUpdates(
        's1',
        makeStream([{ type: 'future_message' } as unknown as SDKMessage]),
        conn,
        new AbortController().signal,
        {},
      )

      expect(result.stopReason).toBe('end_turn')
      expect(debugMock).toHaveBeenCalled()
    } finally {
      console.debug = debug
    }
  })

  test('re-throws unexpected errors from stream', async () => {
    const conn = makeConn()
    async function* errorStream(): AsyncGenerator<
      SDKMessage,
      undefined,
      unknown
    > {
      yield undefined as unknown as SDKMessage
      throw new Error('stream exploded')
    }
    await expect(
      forwardSessionUpdates(
        's1',
        errorStream(),
        conn,
        new AbortController().signal,
        {},
      ),
    ).rejects.toThrow('stream exploded')
  })
})

// ── message-id (RFD) ──────────────────────────────────────────────
//
// Per rfds/message-id.mdx: agent_message_chunk / user_message_chunk /
// agent_thought_chunk MUST carry a `messageId` (UUID). All chunks of the
// same message share the ID; different messages get different IDs. tool_call
// and plan updates are out of scope and must NOT carry messageId.

describe('forwardSessionUpdates — message-id (RFD)', () => {
  test('attaches messageId to assistant text chunk (non-streaming)', async () => {
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: 'Hello!' }],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const chunkCall = calls.find(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'agent_message_chunk',
    )
    expect(chunkCall).toBeDefined()
    const update = (chunkCall![0] as { update: Record<string, unknown> }).update
    expect(typeof update.messageId).toBe('string')
    // UUID format check (v4-ish, 36 chars with hyphens)
    expect(update.messageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  test('different assistant messages get different messageIds', async () => {
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: 'First' }],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: 'Second' }],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const chunkCalls = calls.filter(
      (c: unknown[]) =>
        ((c[0] as Record<string, Record<string, unknown>>).update ?? {})[
          'sessionUpdate'
        ] === 'agent_message_chunk',
    )
    expect(chunkCalls.length).toBe(2)
    const id1 = (chunkCalls[0][0] as { update: { messageId: string } }).update
      .messageId
    const id2 = (chunkCalls[1][0] as { update: { messageId: string } }).update
      .messageId
    expect(id1).not.toBe(id2)
  })

  test('streaming text + thinking chunks share the same messageId', async () => {
    // stream_events for a single assistant message (text + thinking) must
    // share one messageId, then the assistant message itself reuses it.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        event: {
          type: 'content_block_start',
          content_block: { type: 'thinking', thinking: '' },
        },
      } as unknown as SDKMessage,
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        event: {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'reasoning...' },
        },
      } as unknown as SDKMessage,
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        event: {
          type: 'content_block_start',
          content_block: { type: 'text', text: '' },
        },
      } as unknown as SDKMessage,
      {
        type: 'stream_event',
        parent_tool_use_id: null,
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Answer' },
        },
      } as unknown as SDKMessage,
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            { type: 'thinking', thinking: 'reasoning...' },
            { type: 'text', text: 'Answer' },
          ],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const chunkCalls = calls
      .map(c => (c[0] as { update: Record<string, unknown> }).update)
      .filter(
        u =>
          u.sessionUpdate === 'agent_message_chunk' ||
          u.sessionUpdate === 'agent_thought_chunk',
      )
    // streamingActive filters out the duplicate text/thinking from the
    // final assistant message, so we only get the 4 streaming chunks here.
    expect(chunkCalls.length).toBeGreaterThanOrEqual(4)
    const ids = chunkCalls.map(u => u.messageId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(1)
    expect(typeof ids[0]).toBe('string')
  })

  test('tool_call chunk does NOT carry messageId', async () => {
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tu_mid',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
          role: 'assistant',
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const toolCall = calls
      .map(c => (c[0] as { update: Record<string, unknown> }).update)
      .find(u => u.sessionUpdate === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.messageId).toBeUndefined()
  })

  test('subagent stream_events do not carry messageId (parent_tool_use_id !== null)', async () => {
    // Subagent messages are nested inside a tool call; per our scope decision
    // we only track top-level messageIds, so subagent chunks must NOT carry one.
    const conn = makeConn()
    const msgs: SDKMessage[] = [
      {
        type: 'stream_event',
        parent_tool_use_id: 'tu_subagent',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'subagent text' },
        },
      } as unknown as SDKMessage,
    ]
    await forwardSessionUpdates(
      's1',
      makeStream(msgs),
      conn,
      new AbortController().signal,
      {},
    )
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const chunkCall = calls
      .map(c => (c[0] as { update: Record<string, unknown> }).update)
      .find(u => u.sessionUpdate === 'agent_message_chunk')
    expect(chunkCall).toBeDefined()
    expect(chunkCall!.messageId).toBeUndefined()
  })
})

// ── replayHistoryMessages — message-id (RFD) ─────────────────────

describe('replayHistoryMessages — message-id (RFD)', () => {
  test('each replayed message gets its own messageId', async () => {
    const conn = makeConn()
    const messages: Array<Record<string, unknown>> = [
      {
        type: 'user',
        message: { content: [{ type: 'text', text: 'question' }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'answer' }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'follow-up' }] },
      },
    ]
    await replayHistoryMessages('s1', messages, conn, {}, undefined, undefined)
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const chunkCalls = calls
      .map(c => (c[0] as { update: Record<string, unknown> }).update)
      .filter(
        u =>
          u.sessionUpdate === 'agent_message_chunk' ||
          u.sessionUpdate === 'user_message_chunk',
      )
    expect(chunkCalls.length).toBe(3)
    const ids = chunkCalls.map(u => u.messageId)
    expect(ids.every(id => typeof id === 'string')).toBe(true)
    // All three IDs should be distinct (one per message)
    expect(new Set(ids).size).toBe(3)
  })

  test('replayed string-content message carries messageId', async () => {
    const conn = makeConn()
    const messages: Array<Record<string, unknown>> = [
      {
        type: 'assistant',
        message: { content: 'plain string reply' },
      },
    ]
    await replayHistoryMessages('s1', messages, conn, {}, undefined, undefined)
    const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
    const chunkCall = calls
      .map(c => (c[0] as { update: Record<string, unknown> }).update)
      .find(u => u.sessionUpdate === 'agent_message_chunk')
    expect(chunkCall).toBeDefined()
    expect(typeof chunkCall!.messageId).toBe('string')
  })
})
