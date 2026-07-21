export function shouldUseCcrV2ForSession(
  product: 'chat' | 'code' | undefined,
  serverUseCcrV2: boolean,
  overrideUseCcrV2: boolean,
): boolean {
  return product === 'code' || serverUseCcrV2 || overrideUseCcrV2
}
