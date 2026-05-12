/**
 * /cost — alias for /usage (v2.1.118 upstream alignment).
 *
 * /usage is the primary command; /cost and /stats are registered as aliases.
 * This file re-exports the unified usage command so that any code that imports
 * from cost/index directly still gets the correct Command object.
 */
export { default } from '../usage/index.js'
