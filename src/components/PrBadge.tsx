import React from 'react'
import { Link, Text } from '../ink.js'
import type { PrReviewState } from '../utils/ghPrStatus.js'

type Props = {
  number: number
  url: string
  reviewState?: PrReviewState
  bold?: boolean
}

export function PrBadge({
  number,
  url,
  reviewState,
  bold,
}: Props): React.ReactNode {
  const statusColor = getPrStatusColor(reviewState)
  const label = (
    <Text color={statusColor} dimColor={!statusColor && !bold} bold={bold}>
      #{number}
    </Text>
  )
  return (
    <Text>
      <Text dimColor={!bold}>PR</Text>{' '}
      <Link url={url} fallback={label}>
        <Text
          color={statusColor}
          dimColor={!statusColor && !bold}
          underline
          bold={bold}
        >
          #{number}
        </Text>
      </Link>
    </Text>
  )
}

function getPrStatusColor(
  state?: PrReviewState,
): 'success' | 'error' | 'warning' | 'merged' | undefined {
  switch (state) {
    case 'approved':
      return 'success'
    case 'changes_requested':
      return 'error'
    case 'pending':
      return 'warning'
    case 'merged':
      return 'merged'
    default:
      return undefined
  }
}
