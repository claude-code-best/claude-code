import * as React from 'react'
import { useState } from 'react'
import { getSlowOperations } from '../bootstrap/state.js'
import { Text, useInterval } from '@anthropic/ink'

// Show DevBar for dev builds or all ants
function shouldShowDevBar(): boolean {
  return (
    process.env.NODE_ENV === 'development' || process.env.USER_TYPE === 'ant'
  )
}

export function DevBar(): React.ReactNode {
  const [slowOps, setSlowOps] =
    useState<
      ReadonlyArray<{
        operation: string
        durationMs: number
        timestamp: number
      }>
    >(getSlowOperations)

  useInterval(
    () => {
      setSlowOps(getSlowOperations())
    },
    shouldShowDevBar() ? 500 : null,
  )

  // Only show when there's something to display
  if (!shouldShowDevBar() || slowOps.length === 0) {
    return null
  }

  // Single-line format so short terminals don't lose rows to dev noise.
  const recentOps = slowOps
    .slice(-3)
    .map(op => `${op.operation} (${Math.round(op.durationMs)}ms)`)
    .join(' · ')

  return (
    <Text wrap="truncate-end" color="warning">
      [ANT-ONLY] slow sync: {recentOps}
    </Text>
  )
}
