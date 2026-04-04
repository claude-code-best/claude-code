import { useEffect } from 'react'
import { useNotifications } from 'src/context/notifications.js'
import { useAppState, useSetAppState } from 'src/state/AppState.js'
import {
  type CooldownReason,
  isFastModeEnabled,
  onCooldownExpired,
  onCooldownTriggered,
  onFastModeOverageRejection,
  onOrgFastModeChanged,
} from 'src/utils/fastMode.js'
import { formatDuration } from 'src/utils/format.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'

const COOLDOWN_STARTED_KEY = 'fast-mode-cooldown-started'
const COOLDOWN_EXPIRED_KEY = 'fast-mode-cooldown-expired'
const ORG_CHANGED_KEY = 'fast-mode-org-changed'
const OVERAGE_REJECTED_KEY = 'fast-mode-overage-rejected'

export function useFastModeNotification(): void {
  const { addNotification } = useNotifications()
  const isFastMode = useAppState(s => s.fastMode)
  const setAppState = useSetAppState()

  // Notify when org fast mode status changes
  useEffect(() => {
    if (getIsRemoteMode()) return
    if (!isFastModeEnabled()) {
      return
    }

    return onOrgFastModeChanged(orgEnabled => {
      if (orgEnabled) {
        addNotification({
          key: ORG_CHANGED_KEY,
          color: 'fastMode',
          priority: 'immediate',
          text: 'Fast mode is now available · /fast to turn on',
        })
      } else if (isFastMode) {
        // Org disabled fast mode — permanently turn off fast mode
        setAppState(prev => ({ ...prev, fastMode: false }))
        addNotification({
          key: ORG_CHANGED_KEY,
          color: 'warning',
          priority: 'immediate',
          text: 'Fast mode has been disabled by your organization',
        })
      }
    })
  }, [addNotification, isFastMode, setAppState])

  // Notify when fast mode is rejected due to overage/extra usage issues
  useEffect(() => {
    if (getIsRemoteMode()) return
    if (!isFastModeEnabled()) return

    return onFastModeOverageRejection(message => {
      setAppState(prev => ({ ...prev, fastMode: false }))
      addNotification({
        key: OVERAGE_REJECTED_KEY,
        color: 'warning',
        priority: 'immediate',
        text: message,
      })
    })
  }, [addNotification, setAppState])

  useEffect(() => {
    if (getIsRemoteMode()) return
    if (!isFastMode) {
      return
    }

    const unsubTriggered = onCooldownTriggered((resetAt, reason) => {
      const resetIn = formatDuration(resetAt - Date.now(), {
        hideTrailingZeros: true,
      })
      const message = getCooldownMessage(reason, resetIn)
      addNotification({
        key: COOLDOWN_STARTED_KEY,
        invalidates: [COOLDOWN_EXPIRED_KEY],
        text: message,
        color: 'warning',
        priority: 'immediate',
      })
    })
    const unsubExpired = onCooldownExpired(() => {
      addNotification({
        key: COOLDOWN_EXPIRED_KEY,
        invalidates: [COOLDOWN_STARTED_KEY],
        color: 'fastMode',
        text: `Fast limit reset · now using fast mode`,
        priority: 'immediate',
      })
    })
    return () => {
      unsubTriggered()
      unsubExpired()
    }
  }, [addNotification, isFastMode])
}

function getCooldownMessage(reason: CooldownReason, resetIn: string): string {
  switch (reason) {
    case 'overloaded':
      return `Fast mode overloaded and is temporarily unavailable · resets in ${resetIn}`
    case 'rate_limit':
      return `Fast limit reached and temporarily disabled · resets in ${resetIn}`
  }
}
