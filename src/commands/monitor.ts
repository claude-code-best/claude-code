/**
 * /monitor <command> — Start a background monitor task.
 *
 * Shortcut for the MonitorTool. Spawns a long-running shell command
 * as a background task visible in the footer pill (Shift+Down to view).
 *
 * Usage:
 *   /monitor tail -f /var/log/syslog
 *   /monitor watch -n 5 git status
 *   /monitor "while true; do curl -s http://localhost:3000/health; sleep 10; done"
 */
import { feature } from 'bun:bundle'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'
import type { ToolUseContext } from '../Tool.js'

const monitor = {
  type: 'local-jsx',
  name: 'monitor',
  description: 'Start a background shell monitor (Shift+Down to view)',
  isEnabled: () => {
    if (feature('MONITOR_TOOL')) {
      return true
    }
    return false
  },
  immediate: false,
  userFacingName: () => 'monitor',
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        let command = args.trim()
        if (!command) {
          onDone(
            process.platform === 'win32'
              ? 'Usage: /monitor <command>\nExample: /monitor powershell -c "while(1){git status; Start-Sleep 5}"'
              : 'Usage: /monitor <command>\nExample: /monitor watch -n 5 git status',
            { display: 'system' },
          )
          return null
        }

        // Windows compatibility: convert `watch -n <sec> <cmd>` to a PowerShell loop
        if (process.platform === 'win32') {
          const watchMatch = command.match(/^watch\s+-n\s+(\d+)\s+(.+)$/)
          if (watchMatch) {
            const interval = watchMatch[1]
            const innerCmd = watchMatch[2]
            command = `powershell -c "while(1){${innerCmd}; Start-Sleep ${interval}}"`
          }
        }

        // Dynamic require to stay behind feature gate
        const { spawnShellTask } =
          require('../tasks/LocalShellTask/LocalShellTask.js') as typeof import('../tasks/LocalShellTask/LocalShellTask.js')
        const { exec } =
          require('../utils/Shell.js') as typeof import('../utils/Shell.js')
        const { getTaskOutputPath } =
          require('../utils/task/diskOutput.js') as typeof import('../utils/task/diskOutput.js')

        try {
          const shellCommand = await exec(
            command,
            context.abortController.signal,
            'bash',
          )

          const handle = await spawnShellTask(
            {
              command,
              description: command,
              shellCommand,
              toolUseId: context.toolUseId ?? `monitor-${Date.now()}`,
              agentId: undefined,
              kind: 'monitor',
            },
            {
              abortController: context.abortController,
              getAppState: context.getAppState,
              setAppState: context.setAppState,
            },
          )

          const outputFile = getTaskOutputPath(handle.taskId)
          onDone(
            `Monitor started (${handle.taskId}). Press Shift+Down to view.\nOutput: ${outputFile}`,
            { display: 'system' },
          )
        } catch (err) {
          onDone(
            `Monitor failed: ${err instanceof Error ? err.message : String(err)}`,
            { display: 'system' },
          )
        }

        return null
      },
    }),
} satisfies Command

export default monitor
