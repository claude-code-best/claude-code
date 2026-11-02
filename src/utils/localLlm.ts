import { logForDebugging } from './debug.js'

export interface OllamaModel {
  name: string
}

export async function checkOllamaStatus(
  baseUrl: string = 'http://localhost:11434',
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch (error) {
    logForDebugging(`Ollama status check failed: ${error}`)
    return false
  }
}

export async function listOllamaModels(
  baseUrl: string = 'http://localhost:11434',
): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return []
    const data = (await response.json()) as { models: OllamaModel[] }
    return data.models.map(m => m.name)
  } catch (error) {
    logForDebugging(`Failed to list Ollama models: ${error}`)
    return []
  }
}

export async function* pullOllamaModel(
  model: string,
  baseUrl: string = 'http://localhost:11434',
  signal?: AbortSignal,
): AsyncGenerator<{ status: string; percentage?: number }> {
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Failed to get response body reader')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const data = JSON.parse(line)
        let percentage: number | undefined
        if (data.total && data.completed) {
          percentage = Math.round((data.completed / data.total) * 100)
        }
        yield { status: data.status, percentage }
      } catch (e) {
        logForDebugging(`Failed to parse Ollama pull delta: ${e}`)
      }
    }
  }
}

export async function pingUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    // Try GET if HEAD fails
    try {
      const response = await fetch(url, { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  }
}
