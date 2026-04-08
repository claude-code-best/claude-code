import React, { Suspense, use, useState } from 'react'
import { Box, Text } from '@anthropic/ink'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import type { Message } from '../../types/message.js'
import {
  generatePermissionExplanation,
  isPermissionExplainerEnabled,
  type PermissionExplanation as PermissionExplanationType,
  type RiskLevel,
} from '../../utils/permissions/permissionExplainer.js'
import { ShimmerChar } from '../Spinner/ShimmerChar.js'
import { useShimmerAnimation } from '../Spinner/useShimmerAnimation.js'

const LOADING_MESSAGE = 'Loading explanation…'

function ShimmerLoadingText(): React.ReactNode {
  const [ref, glimmerIndex] = useShimmerAnimation(
    'responding',
    LOADING_MESSAGE,
    false,
  )

  return (
    <Box ref={ref}>
      <Text>
        {LOADING_MESSAGE.split('').map((char, index) => (
          <ShimmerChar
            key={index}
            char={char}
            index={index}
            glimmerIndex={glimmerIndex}
            messageColor="inactive"
            shimmerColor="text"
          />
        ))}
      </Text>
    </Box>
  )
}

function getRiskColor(riskLevel: RiskLevel): 'success' | 'warning' | 'error' {
  switch (riskLevel) {
    case 'LOW':
      return 'success'
    case 'MEDIUM':
      return 'warning'
    case 'HIGH':
      return 'error'
  }
}

function getRiskLabel(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'LOW':
      return 'Low risk'
    case 'MEDIUM':
      return 'Med risk'
    case 'HIGH':
      return 'High risk'
  }
}

type PermissionExplanationProps = {
  toolName: string
  toolInput: unknown
  toolDescription?: string
  messages?: Message[]
}

type ExplainerState = {
  visible: boolean
  enabled: boolean
  promise: Promise<PermissionExplanationType | null> | null
}

/**
 * Creates an explanation promise that never rejects.
 * Errors are caught and returned as null.
 */
function createExplanationPromise(
  props: PermissionExplanationProps,
): Promise<PermissionExplanationType | null> {
  return generatePermissionExplanation({
    toolName: props.toolName,
    toolInput: props.toolInput,
    toolDescription: props.toolDescription,
    messages: props.messages,
    signal: new AbortController().signal, // Won't abort - request is fast enough
  }).catch(() => null)
}

/**
 * Hook that manages the permission explainer state.
 * Creates the fetch promise lazily (only when user hits Ctrl+E)
 * to avoid consuming tokens for explanations users never view.
 */
export function usePermissionExplainerUI(
  props: PermissionExplanationProps,
): ExplainerState {
  const enabled = isPermissionExplainerEnabled()
  const [visible, setVisible] = useState(false)
  const [promise, setPromise] =
    useState<Promise<PermissionExplanationType | null> | null>(null)

  // Use keybinding for ctrl+e toggle (configurable via keybindings.json)
  useKeybinding(
    'confirm:toggleExplanation',
    () => {
      if (!visible) {
        logEvent('tengu_permission_explainer_shortcut_used', {})
        // Only create the promise on first toggle (lazy loading)
        if (!promise) {
          setPromise(createExplanationPromise(props))
        }
      }
      setVisible(v => !v)
    },
    { context: 'Confirmation', isActive: enabled },
  )

  return { visible, enabled, promise }
}

/**
 * Inner component that uses React 19's use() to read the promise.
 * Suspends while loading, returns null on error.
 */
function ExplanationResult({
  promise,
}: {
  promise: Promise<PermissionExplanationType | null>
}): React.ReactNode {
  const explanation = use(promise)

  if (!explanation) {
    return (
      <Box marginTop={1}>
        <Text dimColor>Explanation unavailable</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{explanation.explanation}</Text>
      <Box marginTop={1}>
        <Text>{explanation.reasoning}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color={getRiskColor(explanation.riskLevel)}>
            {getRiskLabel(explanation.riskLevel)}:
          </Text>
          <Text> {explanation.risk}</Text>
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Content component - shows loading (via Suspense) or explanation when visible
 */
export function PermissionExplainerContent({
  visible,
  promise,
}: {
  visible: boolean
  promise: Promise<PermissionExplanationType | null> | null
}): React.ReactNode {
  if (!visible || !promise) {
    return null
  }

  return (
    <Suspense
      fallback={
        <Box marginTop={1}>
          <ShimmerLoadingText />
        </Box>
      }
    >
      <ExplanationResult promise={promise} />
    </Suspense>
  )
}
