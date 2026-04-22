import type { SpeciesId } from '../types'

/**
 * Fallback ASCII art for when sprites can't be fetched.
 * Simple 5-line representations of each species.
 */
const FALLBACK_SPRITES: Record<SpeciesId, string[]> = {
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

/**
 * Get fallback ASCII sprite lines for a species.
 */
export function getFallbackSprite(speciesId: SpeciesId): string[] {
  return FALLBACK_SPRITES[speciesId] ?? FALLBACK_SPRITES.pikachu
}
