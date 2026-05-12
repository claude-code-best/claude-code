/**
 * CoStrict Review Module
 *
 * Provides builtin review skills and agents that are embedded
 * in the binary and extracted to cache on first run.
 */

export * as Extension from './extension.js'
export * as SkillBuiltin from './skill/builtin.js'
export {
  REVIEW_AGENTS,
  AGENT_VERSIONS,
  PRIMARY_REVIEW_AGENT,
  SUB_REVIEW_AGENT,
} from './agent/builtin.js'
