export interface DiscoverySignal {
  trigger: 'user_input' | 'assistant_turn' | 'tool_call'
  queryText: string
  startedAt: number
  durationMs: number
  indexSize: number
  method: 'tfidf' | 'keyword'
}
