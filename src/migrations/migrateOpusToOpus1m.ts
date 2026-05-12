import { logEvent } from '../services/analytics/index.js'
import { isOpus1mMergeEnabled } from '../utils/model/model.js'

/**
 * Migration disabled: users who manually remove [1m] suffix should not
 * have it automatically re-added. The migration was too aggressive and
 * didn't respect user choice.
 */
export function migrateOpusToOpus1m(): void {
  // No-op - respect user's manual model choice
  if (!isOpus1mMergeEnabled()) {
    return
  }
  logEvent('tengu_opus_to_opus1m_migration', { skipped: true })
}
