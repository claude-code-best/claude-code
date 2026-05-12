// Auto-generated stub — replace with real implementation
export type ConnectorTextBlock = {
  type: string
  connector_text: string
  signature?: string
  [key: string]: unknown
}
export type ConnectorTextDelta = {
  type: string
  connector_text: string
  text?: string
  thinking?: string
  signature?: string
  [key: string]: unknown
}
export const isConnectorTextBlock: (
  block: unknown,
) => block is ConnectorTextBlock = (_block): _block is ConnectorTextBlock =>
  false
