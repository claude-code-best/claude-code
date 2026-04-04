/**
 * Surfaces plugin-install prompts driven by `<claude-code-hint />` tags
 * that CLIs/SDKs emit to stderr. See docs/claude-code-hints.md.
 *
 * Show-once semantics: each plugin is prompted for at most once ever,
 * recorded in config regardless of yes/no. The pre-store gate in
 * maybeRecordPluginHint already dropped installed/shown/capped hints, so
 * anything that reaches this hook is worth resolving.
 */

import * as React from 'react'
import { useNotifications } from '../context/notifications.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../services/analytics/index.js'
import {
  clearPendingHint,
  getPendingHintSnapshot,
  markShownThisSession,
  subscribeToPendingHint,
} from '../utils/claudeCodeHints.js'
import { logForDebugging } from '../utils/debug.js'
import {
  disableHintRecommendations,
  markHintPluginShown,
  type PluginHintRecommendation,
  resolvePluginHint,
} from '../utils/plugins/hintRecommendation.js'
import { installPluginFromMarketplace } from '../utils/plugins/pluginInstallationHelpers.js'
import {
  installPluginAndNotify,
  usePluginRecommendationBase,
} from './usePluginRecommendationBase.js'

type UseClaudeCodeHintRecommendationResult = {
  recommendation: PluginHintRecommendation | null
  handleResponse: (response: 'yes' | 'no' | 'disable') => void
}

export function useClaudeCodeHintRecommendation(): UseClaudeCodeHintRecommendationResult {
  const pendingHint = React.useSyncExternalStore(
    subscribeToPendingHint,
    getPendingHintSnapshot,
  )
  const { addNotification } = useNotifications()
  const { recommendation, clearRecommendation, tryResolve } =
    usePluginRecommendationBase<PluginHintRecommendation>()

  React.useEffect(() => {
    if (!pendingHint) return
    tryResolve(async () => {
      const resolved = await resolvePluginHint(pendingHint)
      if (resolved) {
        logForDebugging(
          `[useClaudeCodeHintRecommendation] surfacing ${resolved.pluginId} from ${resolved.sourceCommand}`,
        )
        markShownThisSession()
      }
      // Drop the slot — but only if it still holds the hint we just
      // resolved. A newer hint may have overwritten it during the async
      // lookup; don't clobber that.
      if (getPendingHintSnapshot() === pendingHint) {
        clearPendingHint()
      }
      return resolved
    })
  }, [pendingHint, tryResolve])

  const handleResponse = React.useCallback(
    (response: 'yes' | 'no' | 'disable') => {
      if (!recommendation) return

      // Record show-once here, not at resolution-time — the dialog may have
      // been blocked by a higher-priority focusedInputDialog and never
      // rendered. Auto-dismiss reaches this via onResponse('no').
      markHintPluginShown(recommendation.pluginId)
      logEvent('tengu_plugin_hint_response', {
        _PROTO_plugin_name:
          recommendation.pluginName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
        _PROTO_marketplace_name:
          recommendation.marketplaceName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
        response:
          response as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      switch (response) {
        case 'yes': {
          const { pluginId, pluginName, marketplaceName } = recommendation
          void installPluginAndNotify(
            pluginId,
            pluginName,
            'hint-plugin',
            addNotification,
            async pluginData => {
              const result = await installPluginFromMarketplace({
                pluginId,
                entry: pluginData.entry,
                marketplaceName,
                scope: 'user',
                trigger: 'hint',
              })
              if (!result.success) {
                throw new Error(result.error)
              }
            },
          )
          break
        }
        case 'disable':
          disableHintRecommendations()
          break
        case 'no':
          break
      }

      clearRecommendation()
    },
    [recommendation, addNotification, clearRecommendation],
  )

  return { recommendation, handleResponse }
}
