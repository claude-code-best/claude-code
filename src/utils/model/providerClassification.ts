export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'grok'

export function isThirdPartyAPIProvider(provider: APIProvider): boolean {
  return provider !== 'firstParty'
}
