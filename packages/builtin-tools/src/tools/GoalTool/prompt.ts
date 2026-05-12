export const DESCRIPTION = 'Manage the active goal for long-running tasks.'

export function generatePrompt(): string {
  return `Manage the active goal for long-running tasks.

Use this tool to get, set, or complete a goal. A goal is an objective that the system tracks across the session, injecting continuation prompts to keep working toward it.

## Actions
- **get** — Get the current goal status
- **set** — Set or update the goal objective
- **complete** — Mark the goal as complete when the objective is achieved

## Examples
- Get current goal: { "action": "get" }
- Set a goal: { "action": "set", "objective": "Improve test coverage to 80%" }
- Complete a goal: { "action": "complete", "message": "All tests now pass with 82% coverage." }
`
}
