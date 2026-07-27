import { isAbsolute, resolve } from 'node:path'

export type ProductRuntimeConfig = {
  product: 'chat' | 'code'
  sessionDataDirectory: string
  browserScopeId: string | null
  sandboxRequired: boolean
}

let testOverride: ProductRuntimeConfig | null | undefined
let cached: ProductRuntimeConfig | null | undefined

function readProductRuntimeFromEnvironment(): ProductRuntimeConfig | null {
  const product = process.env.CLAUDE_CODE_PRODUCT
  if (product !== 'chat' && product !== 'code') return null
  const rawDataDirectory = process.env.CLAUDE_CODE_SESSION_DATA_DIR
  if (!rawDataDirectory) {
    throw new Error('Product sessions require CLAUDE_CODE_SESSION_DATA_DIR')
  }
  const sessionDataDirectory = resolve(rawDataDirectory)
  if (!isAbsolute(sessionDataDirectory)) {
    throw new Error('Product session data directory must be absolute')
  }
  const browserScopeId = process.env.CLAUDE_CODE_BROWSER_SCOPE_ID ?? null
  if (product === 'chat' && !browserScopeId) {
    throw new Error('Chat sessions require a browser scope ID')
  }
  return {
    product,
    sessionDataDirectory,
    browserScopeId,
    sandboxRequired:
      product === 'chat' ||
      process.env.CLAUDE_CODE_SANDBOX_FAIL_IF_UNAVAILABLE === '1',
  }
}

export function getProductRuntimeConfig(): ProductRuntimeConfig | null {
  if (testOverride !== undefined) return testOverride
  if (cached === undefined) cached = readProductRuntimeFromEnvironment()
  return cached
}

export function setProductRuntimeForTest(
  config: ProductRuntimeConfig | null,
): void {
  testOverride = config
}
