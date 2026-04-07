import type { ReactNode } from 'react'
import React from 'react'
import { supportsHyperlinks } from '../supports-hyperlinks.js'
import Text from './Text.js'

export type Props = {
  readonly children?: ReactNode
  readonly url: string
  readonly fallback?: ReactNode
}

export default function Link({
  children,
  url,
  fallback,
}: Props): React.ReactNode {
  // Use children if provided, otherwise display the URL
  const content = children ?? url

  if (supportsHyperlinks()) {
    // Wrap in Text to ensure we're in a text context
    // (ink-link is a text element like ink-text)
    return (
      <Text>
        <ink-link href={url}>{content}</ink-link>
      </Text>
    )
  }

  return <Text>{fallback ?? content}</Text>
}
