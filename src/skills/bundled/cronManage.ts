import {
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  isKairosCronEnabled,
} from '@claude-code-best/builtin-tools/tools/ScheduleCronTool/prompt.js'
import { registerBundledSkill } from '../bundledSkills.js'

export function registerCronListSkill(): void {
  registerBundledSkill({
    name: 'cron-list',
    description: 'List all scheduled cron jobs in this session',
    whenToUse:
      'When the user wants to see their scheduled/recurring tasks, check active cron jobs, or review what is currently looping.',
    userInvocable: true,
    isEnabled: isKairosCronEnabled,
    async getPromptForCommand() {
      return [
        {
          type: 'text',
          text: `Call ${CRON_LIST_TOOL_NAME} to list all scheduled cron jobs. Display the results in a table with columns: ID, Schedule, Prompt, Recurring, Durable. If no jobs exist, say "No scheduled tasks."`,
        },
      ]
    },
  })
}

export function registerCronDeleteSkill(): void {
  registerBundledSkill({
    name: 'cron-delete',
    description: 'Cancel a scheduled cron job by ID',
    whenToUse:
      'When the user wants to cancel, stop, or remove a scheduled/recurring task or cron job.',
    argumentHint: '<job-id>',
    userInvocable: true,
    isEnabled: isKairosCronEnabled,
    async getPromptForCommand(args) {
      const id = args.trim()
      if (!id) {
        return [
          {
            type: 'text',
            text: `Usage: /cron-delete <job-id>\n\nProvide the job ID to cancel. Use /cron-list to see active jobs and their IDs.`,
          },
        ]
      }
      return [
        {
          type: 'text',
          text: `Call ${CRON_DELETE_TOOL_NAME} with id "${id}" to cancel that scheduled job. Confirm the result to the user.`,
        },
      ]
    },
  })
}
