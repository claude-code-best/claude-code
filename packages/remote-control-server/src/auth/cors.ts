import { config } from '../config'

function originFromUrl(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).origin
  } catch {
    return undefined
  }
}

export function getAllowedWebCorsOrigins(): string[] {
  const origins = new Set<string>(config.webCorsOrigins)

  const baseOrigin = config.baseUrl ? originFromUrl(config.baseUrl) : undefined
  if (baseOrigin) {
    origins.add(baseOrigin)
  }

  origins.add(`http://localhost:${config.port}`)
  origins.add(`http://127.0.0.1:${config.port}`)

  return [...origins]
}

export function resolveWebCorsOrigin(origin: string): string | undefined {
  return getAllowedWebCorsOrigins().includes(origin) ? origin : undefined
}

export const webCorsOptions = {
  origin: resolveWebCorsOrigin,
  allowHeaders: ['Authorization', 'Content-Type', 'X-UUID'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  credentials: false,
}
