import { expect, test } from 'bun:test'
import * as wf from '../index.js'

test('engine core API fully exported', () => {
  expect(typeof wf.runWorkflow).toBe('function')
  expect(typeof wf.parseScript).toBe('function')
  expect(typeof wf.extractMeta).toBe('function')
  expect(typeof wf.makeHooks).toBe('function')
  expect(typeof wf.createEngineContext).toBe('function')
  expect(typeof wf.createSharedResources).toBe('function')
})

test('ports / host API fully exported', () => {
  expect(typeof wf.createHostHandle).toBe('function')
  expect(typeof wf.isHostHandle).toBe('function')
  expect(typeof wf.unwrapHostHandle).toBe('function')
})

test('persistence / structured output / named workflow / progress API fully exported', () => {
  expect(typeof wf.createFileJournalStore).toBe('function')
  expect(typeof wf.agentCallKey).toBe('function')
  expect(typeof wf.validateAgainstSchema).toBe('function')
  expect(typeof wf.resolveNamedWorkflow).toBe('function')
  expect(typeof wf.listNamedWorkflows).toBe('function')
  expect(typeof wf.createBufferingEmitter).toBe('function')
  expect(typeof wf.createProgressEmitter).toBe('function')
})

test('concurrency / budget / error classes fully exported', () => {
  expect(typeof wf.Semaphore).toBe('function')
  expect(typeof wf.maxConcurrency).toBe('function')
  expect(typeof wf.clampMaxConcurrency).toBe('function')
  expect(typeof wf.Budget).toBe('function')
  expect(typeof wf.BudgetExhaustedError).toBe('function')
  expect(typeof wf.WorkflowError).toBe('function')
  expect(typeof wf.WorkflowAbortedError).toBe('function')
  expect(typeof wf.ScriptError).toBe('function')
})

test('tool descriptor and input schema exported', () => {
  expect(typeof wf.createWorkflowTool).toBe('function')
  expect(typeof wf.workflowInputSchema).toBe('object')
  expect(wf.WORKFLOW_TOOL_NAME).toBe('Workflow')
})

test('engine constant values are stable', () => {
  expect(wf.WORKFLOW_DIR_NAME).toBe('.claude/workflows')
  expect(wf.WORKFLOW_RUNS_DIR).toBe('.claude/workflow-runs')
  expect(wf.WORKFLOW_TOOL_NAME).toBe('Workflow')
  expect(wf.MAX_TOTAL_AGENTS).toBe(1000)
  expect(wf.MAX_ITEMS_PER_CALL).toBe(4096)
  expect(wf.MAX_CONCURRENCY_CAP).toBe(16)
  expect(wf.DEFAULT_MAX_CONCURRENCY).toBe(3)
  expect(wf.WORKFLOW_SCRIPT_EXTENSIONS).toEqual(['.ts', '.js', '.mjs'])
})

test('createWorkflowTool returns complete descriptor shape', () => {
  const tool = wf.createWorkflowTool({
    agentRunner: { runAgentToResult: async () => ({ kind: 'dead' }) },
    progressEmitter: { emit: () => {} },
    taskRegistrar: {
      register: () => ({ runId: 'r', signal: new AbortController().signal }),
      complete() {},
      fail() {},
      kill() {},
      pendingAction: () => null,
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: wf.createHostHandle(null),
      cwd: '/tmp',
      budgetTotal: null,
    }),
  })
  expect(tool.name).toBe('Workflow')
  expect(tool.isEnabled()).toBe(true)
  expect(tool.isReadOnly({})).toBe(false)
  expect(typeof tool.call).toBe('function')
  expect(typeof tool.description).toBe('function')
  expect(typeof tool.prompt).toBe('function')
  expect(typeof tool.renderToolUseMessage).toBe('function')
  expect(typeof tool.mapToolResultToToolResultBlockParam).toBe('function')
})
