import type { Command } from 'src/commands.js'

const goal = {
  type: 'local-jsx',
  name: 'goal',
  description:
    'Set or view a persistent goal that drives auto-continuation across turns',
  argumentHint: '[<objective> | status | clear | pause | resume | complete]',
  bridgeSafe: false,
  load: () => import('./goal.js'),
} satisfies Command

export default goal
