import type { SpeciesId } from '../types'

/**
 * Fallback ASCII art for when sprites can't be fetched.
 * Curated sprites for original 10 species; generic fallback for all others.
 */
const FALLBACK_SPRITES: Partial<Record<string, string[]>> = {
  bulbasaur: [
    '      _,,--.,,_     ',
    '    ,\'          `,  ',
    '   ;   o    o    ;  ',
    '   ;  ~~~~~~~~  ;   ',
    '    `--,,__,,--\'    ',
  ],
  ivysaur: [
    '      _,--..,_      ',
    '    ,\'  (o)(o) `,   ',
    '   ;    ~~~~~~  ;   ',
    '   ;   \\====/   ;  ',
    '    `--,,__,,--\'    ',
  ],
  venusaur: [
    '     _,,,---.,,_     ',
    '   ,\'  (o)  (o) `,  ',
    '  ;    ~~~~~~~~   ;  ',
    '  ;  /========\\  ; ',
    '   `-,,,____,,,-\'   ',
  ],
  charmander: [
    '       ,^.,         ',
    '      ( o o)        ',
    '     /  ~~~ \\      ',
    '    /  \\___/  \\    ',
    '   ^^^       ^^^    ',
  ],
  charmeleon: [
    '        ,--^.        ',
    '       ( o  o)       ',
    '      / ~~~~~ \\     ',
    '     /  \\___/  \\   ',
    '    ^^        ^^     ',
  ],
  charizard: [
    '      /\\  /\\         ',
    '     /  \\/  \\        ',
    '    | o    o |       ',
    '    | ~~~~~~ |       ',
    '     \\______/        ',
  ],
  squirtle: [
    '      _____         ',
    '    ,\'     `,       ',
    '   ;  o   o  ;      ',
    '   ; ~~~~~~~ ;      ',
    '    `-.,__,\'        ',
  ],
  wartortle: [
    '     _______        ',
    '   ,\'       `,      ',
    '  ;  o    o  ;      ',
    '  ; ~~~~~~~~ ;      ',
    '   `-.,__,\'         ',
  ],
  blastoise: [
    '    .________.      ',
    '   |  o    o  |     ',
    '   | ~~~~~~~~ |     ',
    '   | [====]   |     ',
    '    `-.,__,\'         ',
  ],
  pikachu: [
    '     /\\   /\\        ',
    '    ( o   o )        ',
    '     \\ ~~~ /        ',
    '    /`-...-\'\\      ',
    '   ^^         ^^    ',
  ],
}

/** Generic fallback sprite for species without curated ASCII art */
const GENERIC_SPRITE: string[] = [
  '     .---.          ',
  '    / o o \\         ',
  '   |  ---  |        ',
  '    \\     /         ',
  '     `---\'          ',
]

/**
 * Get fallback ASCII sprite lines for a species.
 */
export function getFallbackSprite(speciesId: SpeciesId): string[] {
  return FALLBACK_SPRITES[speciesId] ?? GENERIC_SPRITE
}
