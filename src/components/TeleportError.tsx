import React, { useCallback, useEffect, useState } from 'react'
import {
  checkIsGitClean,
  checkNeedsClaudeAiLogin,
} from 'src/utils/background/remote/preconditions.js'
import { gracefulShutdownSync } from 'src/utils/gracefulShutdown.js'
import { Box, Text } from '../ink.js'
import { ConsoleOAuthFlow } from './ConsoleOAuthFlow.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'
import { TeleportStash } from './TeleportStash.js'

export type TeleportLocalErrorType = 'needsLogin' | 'needsGitStash'

type TeleportErrorProps = {
  onComplete: () => void
  errorsToIgnore?: ReadonlySet<TeleportLocalErrorType>
}

// Module-level sentinel so the default parameter has stable identity.
// Previously `= new Set()` created a fresh Set every render, which put
// a new object in checkErrors' deps and caused the mount effect to
// re-fire on every render.
const EMPTY_ERRORS_TO_IGNORE: ReadonlySet<TeleportLocalErrorType> = new Set()

export function TeleportError({
  onComplete,
  errorsToIgnore = EMPTY_ERRORS_TO_IGNORE,
}: TeleportErrorProps): React.ReactNode {
  const [currentError, setCurrentError] =
    useState<TeleportLocalErrorType | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false)

  // Check for errors on mount and when error resolution occurs
  const checkErrors = useCallback(async () => {
    const currentErrors = await getTeleportErrors()
    const filteredErrors = new Set(
      Array.from(currentErrors).filter(
        (error: TeleportLocalErrorType) => !errorsToIgnore.has(error),
      ),
    )

    // If no errors remain, call onComplete
    if (filteredErrors.size === 0) {
      onComplete()
      return
    }

    // Set current error to handle (prioritize login over git)
    if (filteredErrors.has('needsLogin')) {
      setCurrentError('needsLogin')
    } else if (filteredErrors.has('needsGitStash')) {
      setCurrentError('needsGitStash')
    }
  }, [onComplete, errorsToIgnore])

  // Check errors on mount
  useEffect(() => {
    void checkErrors()
  }, [checkErrors])

  const onCancel = useCallback(() => {
    gracefulShutdownSync(0)
  }, [])

  const handleLoginComplete = useCallback(() => {
    setIsLoggingIn(false)
    void checkErrors()
  }, [checkErrors])

  const handleLoginWithClaudeAI = useCallback(() => {
    setIsLoggingIn(true)
  }, [setIsLoggingIn])

  const handleLoginDialogSelect = useCallback(
    (value: string) => {
      if (value === 'login') {
        handleLoginWithClaudeAI()
      } else {
        // User selected exit
        onCancel()
      }
    },
    [handleLoginWithClaudeAI, onCancel],
  )

  const handleStashComplete = useCallback(() => {
    void checkErrors()
  }, [checkErrors])

  // Don't render anything if no current error (onComplete will be called)
  if (!currentError) {
    return null
  }

  switch (currentError) {
    case 'needsGitStash':
      return (
        <TeleportStash
          onStashAndContinue={handleStashComplete}
          onCancel={onCancel}
        />
      )

    case 'needsLogin': {
      if (isLoggingIn) {
        return (
          <ConsoleOAuthFlow
            onDone={handleLoginComplete}
            mode="login"
            forceLoginMethod="claudeai"
          />
        )
      }

      return (
        <Dialog title="Log in to Claude" onCancel={onCancel}>
          <Box flexDirection="column">
            <Text dimColor>Teleport requires a Claude.ai account.</Text>
            <Text dimColor>
              Your Claude Pro/Max subscription will be used by Claude Code.
            </Text>
          </Box>
          <Select
            options={[
              { label: 'Login with Claude account', value: 'login' },
              { label: 'Exit', value: 'exit' },
            ]}
            onChange={handleLoginDialogSelect}
          />
        </Dialog>
      )
    }
  }
}

/**
 * Gets current teleport errors that need to be resolved
 * @returns Set of teleport error types that need to be handled
 */
export async function getTeleportErrors(): Promise<
  Set<TeleportLocalErrorType>
> {
  const errors = new Set<TeleportLocalErrorType>()

  const [needsLogin, isGitClean] = await Promise.all([
    checkNeedsClaudeAiLogin(),
    checkIsGitClean(),
  ])

  if (needsLogin) {
    errors.add('needsLogin')
  }
  if (!isGitClean) {
    errors.add('needsGitStash')
  }

  return errors
}
