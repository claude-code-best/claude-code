export type UpstreamApiMode = 'chat_completions' | 'responses'

export function getUpstreamApiMode(
  value = process.env.UPSTREAM_API_MODEL,
): UpstreamApiMode {
  if (value === undefined || value === '' || value === 'chat_completions') {
    return 'chat_completions'
  }
  if (value === 'responses') return 'responses'
  throw new Error(
    `Invalid UPSTREAM_API_MODEL: ${value}. Expected "chat_completions" or "responses".`,
  )
}
