export class OpenAIStreamIncompleteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenAIStreamIncompleteError'
  }
}

export function allowsIncompleteOpenAIStream(): boolean {
  const value = process.env.OPENAI_ALLOW_INCOMPLETE_STREAM
  return value === '1' || value?.toLowerCase() === 'true'
}
