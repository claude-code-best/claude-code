/**
 * ConnectorText — a content block type returned by the Anthropic API
 * containing signed text with cryptographic signature metadata.
 *
 * Used for citation verification and source tracking. Rendered as
 * plain text in the UI but carries signature for integrity checks.
 */
export type ConnectorTextBlock = {
  type: 'connector_text'
  connector_text: string
  signature?: string
  [key: string]: unknown
}

export type ConnectorTextDelta = {
  type: 'connector_text_delta'
  connector_text: string
  text?: string
  thinking?: string
  signature?: string
  [key: string]: unknown
}

/**
 * Type guard: checks whether a content block is a connector_text block.
 */
export const isConnectorTextBlock = (
  block: unknown,
): block is ConnectorTextBlock => {
  if (block == null || typeof block !== 'object') return false
  return (block as Record<string, unknown>).type === 'connector_text'
}

/**
 * Extract plain text from a connector_text block, stripping signature metadata.
 */
export function connectorTextToPlainText(block: unknown): string {
  if (!isConnectorTextBlock(block)) return ''
  return block.connector_text ?? ''
}
