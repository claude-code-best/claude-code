import { describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// ─── Mocks（仅 mock 有副作用的依赖链）───

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

// xml: spread the REAL module + override — a partial factory breaks
// cross-file isolation (same reason as diskOutput below: LocalAgentTask.test.ts
// imports more tags, e.g. TICK_TAG / COMMAND_NAME_TAG).
const realXml = await import('src/constants/xml.js')
mock.module('src/constants/xml.js', () => ({
  ...realXml,
  TASK_NOTIFICATION_TAG: 'task_notification',
  TASK_ID_TAG: 'task_id',
  TOOL_USE_ID_TAG: 'tool_use_id',
  OUTPUT_FILE_TAG: 'output_file',
  STATUS_TAG: 'status',
  SUMMARY_TAG: 'summary',
  WORKTREE_TAG: 'worktree',
  WORKTREE_PATH_TAG: 'worktree_path',
  WORKTREE_BRANCH_TAG: 'worktree_branch',
  TASK_TYPE_TAG: 'task_type',
}))

// messageQueueManager: spread the REAL module + override (partial factories
// break cross-file isolation — LocalAgentTask.test.ts imports more exports,
// e.g. dequeueAllMatching).
const realMQM = await import('src/utils/messageQueueManager.js')
mock.module('src/utils/messageQueueManager.js', () => ({
  ...realMQM,
  enqueuePendingNotification: () => {},
}))

// sdkEventQueue: spread the REAL module + override (partial factories break
// cross-file isolation — LocalAgentTask.test.ts imports more exports, e.g.
// emitTaskTerminatedSdk).
const realSdkEventQueue = await import('src/utils/sdkEventQueue.js')
mock.module('src/utils/sdkEventQueue.js', () => ({
  ...realSdkEventQueue,
  enqueueSdkEvent: () => {},
}))

// diskOutput: spread the REAL module and stub only the fs-touching
// ones. A partial factory here breaks cross-file test isolation: when this
// file runs before LocalAgentTask.test.ts in the same Bun process, that
// file's spread-based re-mock inherits this factory and loses every export
// it didn't list (e.g. DiskTaskOutput) — "Export named 'DiskTaskOutput' not
// found". Same pattern as LocalAgentTask.test.ts.
const realDiskOutput = await import('src/utils/task/diskOutput.js')
mock.module('src/utils/task/diskOutput.js', () => ({
  ...realDiskOutput,
  getTaskOutputDelta: async () => null,
  getTaskOutputPath: (id: string) => `/tmp/${id}`,
  evictTaskOutput: () => {},
  initTaskOutputAsSymlink: async () => {},
}))

// ─── Import after mocks ───

const { registerLocalWorkflowTask, failWorkflowTask } = await import(
  '../LocalWorkflowTask.js'
)

// ─── Helpers ───

type AppStateLike = { tasks: Record<string, any> }
type SetAppStateLike = (f: (prev: AppStateLike) => AppStateLike) => void

function createSetState(): {
  setAppState: SetAppStateLike
  getState: () => AppStateLike
} {
  let state: AppStateLike = { tasks: {} }
  return {
    setAppState: f => {
      state = f(state)
    },
    getState: () => state,
  }
}

// ─── Tests ───

describe('failWorkflowTask', () => {
  test('保存 error 字符串到 state（供 BackgroundTasksDialog 显示失败原因）', () => {
    const { setAppState, getState } = createSetState()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'test',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
    })
    failWorkflowTask(taskId, setAppState as any, 'agent X 抛 Error: boom')
    const task = getState().tasks[taskId]
    expect(task.status).toBe('failed')
    expect(task.error).toBe('agent X 抛 Error: boom')
  })

  test('不传 error 时 state.error 保持 undefined（向后兼容现有调用）', () => {
    const { setAppState, getState } = createSetState()
    const taskId = registerLocalWorkflowTask(setAppState as any, {
      description: 'test',
      workflowName: 'wf',
      workflowFile: '/tmp/wf.ts',
    })
    failWorkflowTask(taskId, setAppState as any)
    const task = getState().tasks[taskId]
    expect(task.status).toBe('failed')
    expect(task.error).toBeUndefined()
  })
})
