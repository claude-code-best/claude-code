import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import type { MaskFunction } from '@langfuse/otel'
import { setLangfuseTracerProvider } from '@langfuse/tracing'
import { sanitizeGlobal } from './sanitize.js'
import { logForDebugging } from 'src/utils/debug.js'

declare const MACRO: { VERSION: string }

let processor: LangfuseSpanProcessor | null = null
let provider: BasicTracerProvider | null = null

export function isLangfuseEnabled(): boolean {
  return !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

export function getLangfuseProcessor(): LangfuseSpanProcessor | null {
  return processor
}

export function initLangfuse(): boolean {
  if (processor !== null) return true
  if (!isLangfuseEnabled()) {
    logForDebugging('[langfuse] No keys configured, running in no-op mode')
    return false
  }

  try {
    const maskFn: MaskFunction = ({ data }) => sanitizeGlobal(data)

    processor = new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      flushAt: parseInt(process.env.LANGFUSE_FLUSH_AT ?? '20', 10),
      flushInterval: parseInt(process.env.LANGFUSE_FLUSH_INTERVAL ?? '10', 10),
      mask: maskFn,
      environment: process.env.LANGFUSE_TRACING_ENVIRONMENT ?? 'development',
      release: MACRO.VERSION,
      exportMode: (process.env.LANGFUSE_EXPORT_MODE as 'batched' | 'immediate' | undefined) ?? 'batched',
      timeout: parseInt(process.env.LANGFUSE_TIMEOUT ?? '5', 10),
    })

    provider = new BasicTracerProvider({
      spanProcessors: [processor],
    })

    setLangfuseTracerProvider(provider)

    logForDebugging('[langfuse] Initialized with LangfuseSpanProcessor')
    return true
  } catch (e) {
    logForDebugging(`[langfuse] Init failed: ${e}`, { level: 'error' })
    processor = null
    provider = null
    return false
  }
}

export async function shutdownLangfuse(): Promise<void> {
  try {
    if (processor) {
      await processor.forceFlush()
      await processor.shutdown()
    }
    processor = null
    provider = null
    logForDebugging('[langfuse] Shutdown complete')
  } catch (e) {
    logForDebugging(`[langfuse] Shutdown error: ${e}`, { level: 'error' })
  }
}
