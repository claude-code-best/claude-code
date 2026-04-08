import * as React from 'react'
import { pathToFileURL } from 'url'
import { Link, supportsHyperlinks, Text } from '@anthropic/ink'
import { getStoredImagePath } from '../utils/imageStore.js'
import type { Theme } from '../utils/theme.js'

type Props = {
  imageId: number
  backgroundColor?: keyof Theme
  isSelected?: boolean
}

/**
 * Renders an image reference like [Image #1] as a clickable link.
 * When clicked, opens the stored image file in the default viewer.
 *
 * Falls back to styled text if:
 * - Terminal doesn't support hyperlinks
 * - Image file is not found in the store
 */
export function ClickableImageRef({
  imageId,
  backgroundColor,
  isSelected = false,
}: Props): React.ReactNode {
  const imagePath = getStoredImagePath(imageId)
  const displayText = `[Image #${imageId}]`

  // If we have a stored image and terminal supports hyperlinks, make it clickable
  if (imagePath && supportsHyperlinks()) {
    const fileUrl = pathToFileURL(imagePath).href

    return (
      <Link
        url={fileUrl}
        fallback={
          <Text backgroundColor={backgroundColor} inverse={isSelected}>
            {displayText}
          </Text>
        }
      >
        <Text
          backgroundColor={backgroundColor}
          inverse={isSelected}
          bold={isSelected}
        >
          {displayText}
        </Text>
      </Link>
    )
  }

  // Fallback: styled but not clickable
  return (
    <Text backgroundColor={backgroundColor} inverse={isSelected}>
      {displayText}
    </Text>
  )
}
