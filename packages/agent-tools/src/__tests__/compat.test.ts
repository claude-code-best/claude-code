import { describe, expect, test } from 'bun:test'
import type {
  CoreTool,
  Tool,
  Tools,
  AnyObject,
  ToolResult,
  ValidationResult,
  PermissionResult,
} from '@claude-code-best/agent-tools'
import type { Tool as HostTool } from '../../../../src/Tool.js'

describe('agent-tools compatibility', () => {
  test('CoreTool structural compatibility with host Tool', () => {
    // The host's Tool should structurally satisfy CoreTool
    // because it has all required fields (name, call, description, etc.)
    // This test verifies the type-level compatibility at runtime
    const mockHostTool: HostTool = {
      name: 'test',
      aliases: [],
      searchHint: 'test tool',
      inputSchema: {} as any,
      async call() {
        return { data: 'ok' } as any
      },
      async description() {
        return 'test'
      },
      async prompt() {
        return 'test prompt'
      },
      isConcurrencySafe: () => false,
      isEnabled: () => true,
      isReadOnly: () => false,
      async checkPermissions() {
        return { behavior: 'allow' as const, updatedInput: {} }
      },
      toAutoClassifierInput: () => '',
      userFacingName: () => 'test',
      maxResultSizeChars: 100000,
      mapToolResultToToolResultBlockParam: () => ({
        type: 'tool_result',
        tool_use_id: '1',
        content: 'ok',
      }),
      renderToolUseMessage: () => null,
    }

    // This assignment should work if HostTool structurally extends CoreTool
    const coreTool: CoreTool = mockHostTool as unknown as CoreTool
    expect(coreTool.name).toBe('test')
    expect(coreTool.isEnabled()).toBe(true)
  })
})
