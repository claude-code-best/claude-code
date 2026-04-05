import { useEffect, useRef } from 'react'
import { useNotifications } from 'src/context/notifications.js'
import { getModelDeprecationWarning } from 'src/utils/model/deprecation.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'

export function useDeprecationWarningNotification(model: string): void {
  const { addNotification } = useNotifications()
  const lastWarningRef = useRef<string | null>(null)

  useEffect(() => {
    if (getIsRemoteMode()) return
    const deprecationWarning = getModelDeprecationWarning(model)

    // Show warning if model is deprecated and we haven't shown this exact warning yet
    if (deprecationWarning && deprecationWarning !== lastWarningRef.current) {
      lastWarningRef.current = deprecationWarning
      addNotification({
        key: 'model-deprecation-warning',
        text: deprecationWarning,
        color: 'warning',
        priority: 'high',
      })
    }

    // Reset tracking if model changes to non-deprecated
    if (!deprecationWarning) {
      lastWarningRef.current = null
    }
  }, [model, addNotification])
}
