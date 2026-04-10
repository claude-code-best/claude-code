import { registerBundledSkill } from '../../skills/bundledSkills.js'

export function registerStrictPlanSkill(): void {
  registerBundledSkill({
    name: 'strict-plan',
    description:
      '创建结构化需求提案并协调实施 - 遵循"理解需求→探索项目→需求澄清→创建提案→实施提案"工作流',
    whenToUse:
      '根据用户的需求创建具体可实施的计划。Use this when you need to create structured, actionable implementation plans based on user requirements. This agent follows a strict workflow: understand requirements → QuickExplore project → clarify requirements → create proposal → implement proposal.',
    userInvocable: true,
    allowedTools:[
    "AskUserQuestion",
    "Agent",
    "Read",
    "Write",
    "Edit",
    "TodoWrite",
    ],
    // 关键：在子 Agent 中运行
    context: 'fork',
    // 关键：使用 StrictPlan Agent
    agent: 'StrictPlan',
    async getPromptForCommand(args) {
      const userRequest = args.trim()
      if (!userRequest) {
        return [
          {
            type: 'text',
            text: '请提供需要规划的需求描述。用法: /strict-plan <需求描述>',
          },
        ]
      }
      return [
        {
          type: 'text',
          text: `用户需求：${userRequest}`,
        },
      ]
    },
  })
}
