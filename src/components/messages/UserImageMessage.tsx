import * as React from 'react'
import { pathToFileURL } from 'url'
import { Box, Link, supportsHyperlinks, Text } from '@anthropic/ink'
import { getStoredImagePath } from '../../utils/imageStore.js'
import { MessageResponse } from '../MessageResponse.js'

type Props = {
  imageId?: number
  addMargin?: boolean
}

/**
 * Renders an image attachment in user messages.
 * Shows as a clickable link if the image is stored and terminal supports hyperlinks.
 * Uses MessageResponse styling to appear connected to the message above,
 * unless addMargin is true (image starts a new user turn without text).
 */
export function UserImageMessage({
  imageId,
  addMargin,
}: Props): React.ReactNode {
  const label = imageId ? `[Image #${imageId}]` : '[Image]'
  const imagePath = imageId ? getStoredImagePath(imageId) : null

  const content =
    imagePath && supportsHyperlinks() ? (
      <Link url={pathToFileURL(imagePath).href}>
        <Text>{label}</Text>
      </Link>
    ) : (
      <Text>{label}</Text>
    )

  // When this image starts a new user turn (no text before it),
  // show with margin instead of the connected line style
  if (addMargin) {
    return <Box marginTop={1}>{content}</Box>
  }

  return <MessageResponse>{content}</MessageResponse>
}
