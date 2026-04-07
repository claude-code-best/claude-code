import { feature } from 'bun:bundle'
import figures from 'figures'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useTheme } from '@anthropic/ink'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../../services/analytics/metadata.js'
import { useAppState } from '../../../state/AppState.js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import {
  getFirstWordPrefix,
  getSimpleCommandPrefix,
} from '../../../tools/BashTool/bashPermissions.js'
import { getDestructiveCommandWarning } from '../../../tools/BashTool/destructiveCommandWarning.js'
import { parseSedEditCommand } from '../../../tools/BashTool/sedEditParser.js'
import { shouldUseSandbox } from '../../../tools/BashTool/shouldUseSandbox.js'
import { getCompoundCommandPrefixesStatic } from '../../../utils/bash/prefix.js'
import {
  createPromptRuleContent,
  generateGenericDescription,
  getBashPromptAllowDescriptions,
  isClassifierPermissionsEnabled,
} from '../../../utils/permissions/bashClassifier.js'
import { extractRules } from '../../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import { Select } from '../../CustomSelect/select.js'
import { ShimmerChar } from '../../Spinner/ShimmerChar.js'
import { useShimmerAnimation } from '../../Spinner/useShimmerAnimation.js'
import { type UnaryEvent, usePermissionRequestLogging } from '../hooks.js'
import { PermissionDecisionDebugInfo } from '../PermissionDecisionDebugInfo.js'
import { PermissionDialog } from '../PermissionDialog.js'
import {
  PermissionExplainerContent,
  usePermissionExplainerUI,
} from '../PermissionExplanation.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { PermissionRuleExplanation } from '../PermissionRuleExplanation.js'
import { SedEditPermissionRequest } from '../SedEditPermissionRequest/SedEditPermissionRequest.js'
import { useShellPermissionFeedback } from '../useShellPermissionFeedback.js'
import { logUnaryPermissionEvent } from '../utils.js'
import { bashToolUseOptions } from './bashToolUseOptions.js'

const CHECKING_TEXT = 'Attempting to auto-approve\u2026'

// Isolates the 20fps shimmer clock from BashPermissionRequestInner. Before this
// extraction, useShimmerAnimation lived inside the 535-line Inner body, so every
// 50ms clock tick re-rendered the entire dialog (PermissionDialog + Select +
// all children) for the ~1-3 seconds the classifier typically takes. Inner also
// has a Compiler bailout (see below), so nothing was auto-memoized — the full
// JSX tree was reconstructed 20-60 times per classifier check.
function ClassifierCheckingSubtitle(): React.ReactNode {
  const [ref, glimmerIndex] = useShimmerAnimation(
    'requesting',
    CHECKING_TEXT,
    false,
  )
  return (
    <Box ref={ref}>
      <Text>
        {[...CHECKING_TEXT].map((char, i) => (
          <ShimmerChar
            key={i}
            char={char}
            index={i}
            glimmerIndex={glimmerIndex}
            messageColor="inactive"
            shimmerColor="subtle"
          />
        ))}
      </Text>
    </Box>
  )
}

export function BashPermissionRequest(
  props: PermissionRequestProps,
): React.ReactNode {
  const {
    toolUseConfirm,
    toolUseContext,
    onDone,
    onReject,
    verbose,
    workerBadge,
  } = props

  const { command, description } = BashTool.inputSchema.parse(
    toolUseConfirm.input,
  )

  // Detect sed in-place edit commands and delegate to SedEditPermissionRequest
  // This renders sed edits like file edits with a diff view
  const sedInfo = parseSedEditCommand(command)

  if (sedInfo) {
    return (
      <SedEditPermissionRequest
        toolUseConfirm={toolUseConfirm}
        toolUseContext={toolUseContext}
        onDone={onDone}
        onReject={onReject}
        verbose={verbose}
        workerBadge={workerBadge}
        sedInfo={sedInfo}
      />
    )
  }

  // Regular bash command - render with hooks
  return (
    <BashPermissionRequestInner
      toolUseConfirm={toolUseConfirm}
      toolUseContext={toolUseContext}
      onDone={onDone}
      onReject={onReject}
      verbose={verbose}
      workerBadge={workerBadge}
      command={command}
      description={description}
    />
  )
}

// Inner component that uses hooks - only called for non-MCP CLI commands
function BashPermissionRequestInner({
  toolUseConfirm,
  toolUseContext,
  onDone,
  onReject,
  verbose: _verbose,
  workerBadge,
  command,
  description,
}: PermissionRequestProps & {
  command: string
  description?: string
}): React.ReactNode {
  const [theme] = useTheme()
  const toolPermissionContext = useAppState(s => s.toolPermissionContext)
  const explainerState = usePermissionExplainerUI({
    toolName: toolUseConfirm.tool.name,
    toolInput: toolUseConfirm.input,
    toolDescription: toolUseConfirm.description,
    messages: toolUseContext.messages,
  })
  const {
    yesInputMode,
    noInputMode,
    yesFeedbackModeEntered,
    noFeedbackModeEntered,
    acceptFeedback,
    rejectFeedback,
    setAcceptFeedback,
    setRejectFeedback,
    focusedOption,
    handleInputModeToggle,
    handleReject,
    handleFocus,
  } = useShellPermissionFeedback({
    toolUseConfirm,
    onDone,
    onReject,
    explainerVisible: explainerState.visible,
  })
  const [showPermissionDebug, setShowPermissionDebug] = useState(false)
  const [classifierDescription, setClassifierDescription] = useState(
    description || '',
  )
  // Track whether the initial description (from prop or async generation) was empty.
  // Once we receive a non-empty description, this stays false.
  const [
    initialClassifierDescriptionEmpty,
    setInitialClassifierDescriptionEmpty,
  ] = useState(!description?.trim())

  // Asynchronously generate a generic description for the classifier
  useEffect(() => {
    if (!isClassifierPermissionsEnabled()) return

    const abortController = new AbortController()
    generateGenericDescription(command, description, abortController.signal)
      .then(generic => {
        if (generic && !abortController.signal.aborted) {
          setClassifierDescription(generic)
          setInitialClassifierDescriptionEmpty(false)
        }
      })
      .catch(() => {}) // Keep original on error
    return () => abortController.abort()
  }, [command, description])

  // GH#11380: For compound commands (cd src && git status && npm test), the
  // backend already computed correct per-subcommand suggestions via tree-sitter
  // split + per-subcommand permission checks. decisionReason.type ===
  // 'subcommandResults' marks this path. The sync prefix heuristics below
  // (getSimpleCommandPrefix/getFirstWordPrefix) operate on the FULL compound
  // string and pick the first two words — producing dead rules like
  // `Bash(cd src:*)` or `Bash(./script.sh && npm test)` that never match again.
  // Users accumulate 150+ of these in settings.local.json.
  //
  // When compound with exactly one Bash rule (e.g. `cd src && npm test` where
  // cd is read-only → only npm test needs approval), seed the editable input
  // from the backend rule. When compound with 2+ rules, editablePrefix stays
  // undefined so bashToolUseOptions falls through to yes-apply-suggestions,
  // which saves all per-subcommand rules atomically.
  const isCompound =
    toolUseConfirm.permissionResult.decisionReason?.type === 'subcommandResults'

  // Editable prefix — initialize synchronously with the best prefix we can
  // extract without tree-sitter, then refine via tree-sitter for compound
  // commands. The sync path matters because TREE_SITTER_BASH is gated
  // ant-only: in external builds the async refinement below always resolves
  // to [] and this initial value is what the user sees.
  //
  // Lazy initializer: this runs regex + split on every render if left in
  // the render body; it's only needed for initial state.
  const [editablePrefix, setEditablePrefix] = useState<string | undefined>(
    () => {
      if (isCompound) {
        // Backend suggestion is the source of truth for compound commands.
        // Single rule → seed the editable input so the user can refine it.
        // Multiple/zero rules → undefined → yes-apply-suggestions handles it.
        const backendBashRules = extractRules(
          'suggestions' in toolUseConfirm.permissionResult
            ? toolUseConfirm.permissionResult.suggestions
            : undefined,
        ).filter(r => r.toolName === BashTool.name && r.ruleContent)
        return backendBashRules.length === 1
          ? backendBashRules[0]!.ruleContent
          : undefined
      }
      const two = getSimpleCommandPrefix(command)
      if (two) return `${two}:*`
      const one = getFirstWordPrefix(command)
      if (one) return `${one}:*`
      return command
    },
  )
  const hasUserEditedPrefix = useRef(false)
  const onEditablePrefixChange = useCallback((value: string) => {
    hasUserEditedPrefix.current = true
    setEditablePrefix(value)
  }, [])
  useEffect(() => {
    // Skip async refinement for compound commands — the backend already ran
    // the full per-subcommand analysis and its suggestion is correct.
    if (isCompound) return
    let cancelled = false
    getCompoundCommandPrefixesStatic(command, subcmd =>
      BashTool.isReadOnly({ command: subcmd }),
    )
      .then(prefixes => {
        if (cancelled || hasUserEditedPrefix.current) return
        if (prefixes.length > 0) {
          setEditablePrefix(`${prefixes[0]}:*`)
        }
      })
      .catch(() => {}) // Keep sync prefix on tree-sitter failure
    return () => {
      cancelled = true
    }
  }, [command, isCompound])

  // Track whether classifier check was ever in progress (persists after completion).
  // classifierCheckInProgress is set once at queue-push time (interactiveHandler)
  // and only ever transitions true→false, so capturing the mount-time value is
  // sufficient — no latch/ref needed. The feature() ternary keeps the property
  // read out of external builds (forbidden-string check).
  const [classifierWasChecking] = useState(
    feature('BASH_CLASSIFIER')
      ? !!toolUseConfirm.classifierCheckInProgress
      : false,
  )

  // These derive solely from the tool input (fixed for the dialog lifetime).
  // The shimmer clock used to live in this component and re-render it at 20fps
  // while the classifier ran (see ClassifierCheckingSubtitle above for the
  // extraction). React Compiler can't auto-memoize imported functions (can't
  // prove side-effect freedom), so this useMemo still guards against any
  // re-render source (e.g. Inner state updates). Same pattern as PR#20730.
  const { destructiveWarning, sandboxingEnabled, isSandboxed } = useMemo(() => {
    const destructiveWarning = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_destructive_command_warning',
      false,
    )
      ? getDestructiveCommandWarning(command)
      : null

    const sandboxingEnabled = SandboxManager.isSandboxingEnabled()
    const isSandboxed =
      sandboxingEnabled && shouldUseSandbox(toolUseConfirm.input)

    return { destructiveWarning, sandboxingEnabled, isSandboxed }
  }, [command, toolUseConfirm.input])

  const unaryEvent = useMemo<UnaryEvent>(
    () => ({ completion_type: 'tool_use_single', language_name: 'none' }),
    [],
  )

  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  const existingAllowDescriptions = useMemo(
    () => getBashPromptAllowDescriptions(toolPermissionContext),
    [toolPermissionContext],
  )

  const options = useMemo(
    () =>
      bashToolUseOptions({
        suggestions:
          toolUseConfirm.permissionResult.behavior === 'ask'
            ? toolUseConfirm.permissionResult.suggestions
            : undefined,
        decisionReason: toolUseConfirm.permissionResult.decisionReason,
        onRejectFeedbackChange: setRejectFeedback,
        onAcceptFeedbackChange: setAcceptFeedback,
        onClassifierDescriptionChange: setClassifierDescription,
        classifierDescription,
        initialClassifierDescriptionEmpty,
        existingAllowDescriptions,
        yesInputMode,
        noInputMode,
        editablePrefix,
        onEditablePrefixChange,
      }),
    [
      toolUseConfirm,
      classifierDescription,
      initialClassifierDescriptionEmpty,
      existingAllowDescriptions,
      yesInputMode,
      noInputMode,
      editablePrefix,
      onEditablePrefixChange,
    ],
  )

  // Toggle permission debug info with keybinding
  const handleToggleDebug = useCallback(() => {
    setShowPermissionDebug(prev => !prev)
  }, [])
  useKeybinding('permission:toggleDebug', handleToggleDebug, {
    context: 'Confirmation',
  })

  // Allow Esc to dismiss the checkmark after auto-approval
  const handleDismissCheckmark = useCallback(() => {
    toolUseConfirm.onDismissCheckmark?.()
  }, [toolUseConfirm])
  useKeybinding('confirm:no', handleDismissCheckmark, {
    context: 'Confirmation',
    isActive: feature('BASH_CLASSIFIER')
      ? !!toolUseConfirm.classifierAutoApproved
      : false,
  })

  function onSelect(value: string) {
    // Map options to numeric values for analytics (strings not allowed in logEvent)
    let optionIndex: Record<string, number> = {
      yes: 1,
      'yes-apply-suggestions': 2,
      'yes-prefix-edited': 2,
      no: 3,
    }
    if (feature('BASH_CLASSIFIER')) {
      optionIndex = {
        yes: 1,
        'yes-apply-suggestions': 2,
        'yes-prefix-edited': 2,
        'yes-classifier-reviewed': 3,
        no: 4,
      }
    }
    logEvent('tengu_permission_request_option_selected', {
      option_index: optionIndex[value],
      explainer_visible: explainerState.visible,
    })

    const toolNameForAnalytics = sanitizeToolNameForAnalytics(
      toolUseConfirm.tool.name,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    if (value === 'yes-prefix-edited') {
      const trimmedPrefix = (editablePrefix ?? '').trim()
      logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
      if (!trimmedPrefix) {
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
      } else {
        const prefixUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [
              {
                toolName: BashTool.name,
                ruleContent: trimmedPrefix,
              },
            ],
            behavior: 'allow',
            destination: 'localSettings',
          },
        ]
        toolUseConfirm.onAllow(toolUseConfirm.input, prefixUpdates)
      }
      onDone()
      return
    }

    if (feature('BASH_CLASSIFIER') && value === 'yes-classifier-reviewed') {
      const trimmedDescription = classifierDescription.trim()
      logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
      if (!trimmedDescription) {
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
      } else {
        const permissionUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [
              {
                toolName: BashTool.name,
                ruleContent: createPromptRuleContent(trimmedDescription),
              },
            ],
            behavior: 'allow',
            destination: 'session',
          },
        ]
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates)
      }
      onDone()
      return
    }

    switch (value) {
      case 'yes': {
        const trimmedFeedback = acceptFeedback.trim()
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        // Log accept submission with feedback context
        logEvent('tengu_accept_submitted', {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: yesFeedbackModeEntered,
        })
        toolUseConfirm.onAllow(
          toolUseConfirm.input,
          [],
          trimmedFeedback || undefined,
        )
        onDone()
        break
      }
      case 'yes-apply-suggestions': {
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        // Extract suggestions if present (works for both 'ask' and 'passthrough' behaviors)
        const permissionUpdates =
          'suggestions' in toolUseConfirm.permissionResult
            ? toolUseConfirm.permissionResult.suggestions || []
            : []
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates)
        onDone()
        break
      }
      case 'no': {
        const trimmedFeedback = rejectFeedback.trim()

        // Log reject submission with feedback context
        logEvent('tengu_reject_submitted', {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: noFeedbackModeEntered,
        })

        // Process rejection (with or without feedback)
        handleReject(trimmedFeedback || undefined)
        break
      }
    }
  }

  const classifierSubtitle = feature('BASH_CLASSIFIER') ? (
    toolUseConfirm.classifierAutoApproved ? (
      <Text>
        <Text color="success">{figures.tick} Auto-approved</Text>
        {toolUseConfirm.classifierMatchedRule && (
          <Text dimColor>
            {' \u00b7 matched "'}
            {toolUseConfirm.classifierMatchedRule}
            {'"'}
          </Text>
        )}
      </Text>
    ) : toolUseConfirm.classifierCheckInProgress ? (
      <ClassifierCheckingSubtitle />
    ) : classifierWasChecking ? (
      <Text dimColor>Requires manual approval</Text>
    ) : undefined
  ) : undefined

  return (
    <PermissionDialog
      workerBadge={workerBadge}
      title={
        sandboxingEnabled && !isSandboxed
          ? 'Bash command (unsandboxed)'
          : 'Bash command'
      }
      subtitle={classifierSubtitle}
    >
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text dimColor={explainerState.visible}>
          {BashTool.renderToolUseMessage(
            { command, description },
            { theme, verbose: true }, // always show the full command
          )}
        </Text>
        {!explainerState.visible && (
          <Text dimColor>{toolUseConfirm.description}</Text>
        )}
        <PermissionExplainerContent
          visible={explainerState.visible}
          promise={explainerState.promise}
        />
      </Box>
      {showPermissionDebug ? (
        <>
          <PermissionDecisionDebugInfo
            permissionResult={toolUseConfirm.permissionResult}
            toolName="Bash"
          />
          {toolUseContext.options.debug && (
            <Box justifyContent="flex-end" marginTop={1}>
              <Text dimColor>Ctrl-D to hide debug info</Text>
            </Box>
          )}
        </>
      ) : (
        <>
          <Box flexDirection="column">
            <PermissionRuleExplanation
              permissionResult={toolUseConfirm.permissionResult}
              toolType="command"
            />
            {destructiveWarning && (
              <Box marginBottom={1}>
                <Text
                  color="warning"
                  dimColor={
                    feature('BASH_CLASSIFIER')
                      ? toolUseConfirm.classifierAutoApproved
                      : false
                  }
                >
                  {destructiveWarning}
                </Text>
              </Box>
            )}
            <Text
              dimColor={
                feature('BASH_CLASSIFIER')
                  ? toolUseConfirm.classifierAutoApproved
                  : false
              }
            >
              Do you want to proceed?
            </Text>
            <Select
              options={
                feature('BASH_CLASSIFIER')
                  ? toolUseConfirm.classifierAutoApproved
                    ? options.map(o => ({ ...o, disabled: true }))
                    : options
                  : options
              }
              isDisabled={
                feature('BASH_CLASSIFIER')
                  ? toolUseConfirm.classifierAutoApproved
                  : false
              }
              inlineDescriptions
              onChange={onSelect}
              onCancel={() => handleReject()}
              onFocus={handleFocus}
              onInputModeToggle={handleInputModeToggle}
            />
          </Box>
          <Box justifyContent="space-between" marginTop={1}>
            <Text dimColor>
              Esc to cancel
              {((focusedOption === 'yes' && !yesInputMode) ||
                (focusedOption === 'no' && !noInputMode)) &&
                ' · Tab to amend'}
              {explainerState.enabled &&
                ` · ctrl+e to ${explainerState.visible ? 'hide' : 'explain'}`}
            </Text>
            {toolUseContext.options.debug && (
              <Text dimColor>Ctrl+d to show debug info</Text>
            )}
          </Box>
        </>
      )}
    </PermissionDialog>
  )
}
