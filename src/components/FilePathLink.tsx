import React from 'react'
import { pathToFileURL } from 'url'
import { Link } from '@anthropic/ink'

type Props = {
  /** The absolute file path */
  filePath: string
  /** Optional display text (defaults to filePath) */
  children?: React.ReactNode
}

/**
 * Renders a file path as an OSC 8 hyperlink.
 * This helps terminals like iTerm correctly identify file paths
 * even when they appear inside parentheses or other text.
 */
export function FilePathLink({ filePath, children }: Props): React.ReactNode {
  return <Link url={pathToFileURL(filePath).href}>{children ?? filePath}</Link>
}
