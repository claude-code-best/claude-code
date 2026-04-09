import { getFeatureValue_CACHED_MAY_BE_STALE } from "src/services/analytics/growthbook"
import simple_plan from './prompts/simple_plan.txt'
import visual_plan from './prompts/visual_plan.txt'
import three_subagents_with_critique from './prompts/three_subagents_with_critique.txt'

export type PromptIdentifier = keyof typeof  PROMPTS

const DEFAULT_PROMPT_IDENTIFIER = 'simple_plan'

const PROMPTS = {
  simple_plan,
  visual_plan,
  three_subagents_with_critique,
}

export function isValidPromptIdentifier(value: string): boolean {
  return value in PROMPTS
}

export function getPromptIdentifier(): PromptIdentifier {
  const promptIdentifier = getFeatureValue_CACHED_MAY_BE_STALE('tengu_ultraplan_prompt_identifier', DEFAULT_PROMPT_IDENTIFIER)
  return isValidPromptIdentifier(promptIdentifier) ? promptIdentifier : DEFAULT_PROMPT_IDENTIFIER
}

export function getPromptText(id: PromptIdentifier): string {
  return PROMPTS[id].trimEnd()
}

const DEFAULT_DIALOG = {
  timeEstimate: 'a few minutes',
  dialogBody: 'Interactive planning on the web where you can edit and leave targeted comments on Claude\'s plan.',
  dialogPipeline: 'Plan → Edit → Execute',
  usageBlurb: ['Remote plan mode with rich web editing experience.', 'Runs in Claude Code on the web. When the plan is ready,', 'you can execute it in the web session or send it back here.', 'You can continue to work while the plan is generated remotely.'],
}

export const DIALOG_CONFIG = {
  simple_plan: DEFAULT_DIALOG,
  visual_plan: DEFAULT_DIALOG,
  three_subagents_with_critique: {
    timeEstimate: '~10–30 min',
    dialogBody: 'Interactive planning on the web where you can edit and leave targeted comments on Claude\'s plan.',
    dialogPipeline: 'Scope → Critique → Edit → Execute',
    usageBlurb: ['Advanced multi-agent plan mode.', 'Runs in Claude Code on the web. When the plan is ready,', 'you can execute it in the web session or send it back here.', 'You can continue to work while the plan is generated remotely.'],
  },
}

export function getDialogConfig(id?: PromptIdentifier) {
  return DIALOG_CONFIG[id ?? getPromptIdentifier()]
}
