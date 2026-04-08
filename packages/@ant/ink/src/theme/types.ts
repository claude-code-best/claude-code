/**
 * Theme type re-exports.
 *
 * ThemeName and ThemeSetting are business-level concepts stored in config;
 * they live in theme-types.ts and are re-exported here for convenient
 * consumption by theme-layer components.
 */
export type { Theme, ThemeName, ThemeSetting } from './theme-types.js'
export { getTheme } from './theme-types.js'
export type { ColorType } from '../core/colorize.js'
export { colorize } from '../core/colorize.js'
