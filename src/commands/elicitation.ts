import type { ToolUseContext } from '../Tool.js'

export type ElicitationChoice = {
  value: string
  title: string
  description?: string
}

export type ElicitedChoice =
  | { status: 'unavailable' }
  | { status: 'accepted'; value: string }
  | { status: 'cancelled' }

export async function elicitChoice(
  context: Pick<ToolUseContext, 'elicit'>,
  message: string,
  field: string,
  title: string,
  choices: ElicitationChoice[],
): Promise<ElicitedChoice> {
  if (!context.elicit) {
    return { status: 'unavailable' }
  }

  const response = await context.elicit(message, {
    type: 'object',
    properties: {
      [field]: {
        type: 'string',
        title,
        oneOf: choices.map(choice => ({
          const: choice.value,
          title: choice.description
            ? `${choice.title} - ${choice.description}`
            : choice.title,
        })),
      },
    },
    required: [field],
  })

  if (response.action !== 'accept') {
    return { status: 'cancelled' }
  }

  const value = response.content?.[field]
  return typeof value === 'string'
    ? { status: 'accepted', value }
    : { status: 'cancelled' }
}
