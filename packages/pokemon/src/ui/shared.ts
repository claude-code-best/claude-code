import type { Color } from '@anthropic/ink'

const STAT_COLORS: Record<string, Color> = {
  hp: 'ansi:green',
  attack: 'ansi:red',
  defense: 'ansi:yellow',
  spAtk: 'ansi:blue',
  spDef: 'ansi:magenta',
  speed: 'ansi:cyan',
}

export function getStatColor(stat: string): Color {
  return STAT_COLORS[stat] ?? 'ansi:white'
}
