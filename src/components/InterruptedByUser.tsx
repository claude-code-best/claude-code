import * as React from 'react'
import { Text } from '@anthropic/ink'

export function InterruptedByUser(): React.ReactNode {
  return (
    <>
      <Text dimColor>Interrupted </Text>
      {process.env.USER_TYPE === 'ant' ? (
        <Text dimColor>· [ANT-ONLY] /issue to report a model issue</Text>
      ) : (
        <Text dimColor>· What should Claude do instead?</Text>
      )}
    </>
  )
}
