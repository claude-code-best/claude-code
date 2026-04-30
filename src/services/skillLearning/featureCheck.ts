import { feature } from 'bun:bundle'

/**
 * Build-time presence check: is the `/skill-learning` slash command
 * compiled into this build? Used by the command registry's `isEnabled` so
 * the command appears in the menu whenever it is buildable. Operators
 * activate the subsystem itself via `/skill-learning start`, which flips
 * `SKILL_LEARNING_ENABLED=1` and turns the runtime observers on (see
 * `isSkillLearningEnabled`).
 */
export function isSkillLearningCompiledIn(): boolean {
  if (feature('SKILL_LEARNING')) return true
  return false
}

/**
 * Runtime activation check: is the skill-learning subsystem actively
 * running (toolEvent, runtime, session observers attached, persisting
 * observations to disk)? Off by default — the operator must run
 * `/skill-learning start` (which sets `SKILL_LEARNING_ENABLED=1`).
 *
 * Legacy `FEATURE_SKILL_LEARNING=1` is also accepted for backward
 * compatibility with operators who set it before the slash-command UX
 * landed.
 *
 * Build-flag gating is intentionally NOT performed here: the command
 * registry already gates command compilation on the build flag, and this
 * function is only reached from code paths that the build flag has
 * already let through. Decoupling keeps the test surface clean (tests
 * exercise the env-var contract without needing to mock `bun:bundle`).
 */
export function isSkillLearningEnabled(): boolean {
  if (process.env.SKILL_LEARNING_ENABLED === '1') return true
  if (process.env.FEATURE_SKILL_LEARNING === '1') return true
  return false
}
