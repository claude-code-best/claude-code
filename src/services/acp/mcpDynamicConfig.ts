import { feature } from 'bun:bundle'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { filterMcpServersByPolicy } from '../mcp/config.js'
import type { ScopedMcpServerConfig } from '../mcp/types.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'
import { getGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import {
  setupClaudeInChrome,
  shouldAutoEnableClaudeInChrome,
  shouldEnableClaudeInChrome,
} from '../../utils/claudeInChrome/setup.js'
import { getPlatform } from '../../utils/platform.js'

function shouldEnableClaudeInChromeForAcp(): boolean {
  if (process.env.CCB_VSCODE_ACP !== '1') {
    const enableClaudeInChrome =
      shouldEnableClaudeInChrome() &&
      (process.env.USER_TYPE === 'ant' || isClaudeAISubscriber())
    return enableClaudeInChrome || shouldAutoEnableClaudeInChrome()
  }

  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_CFC)) {
    return false
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_CFC)) {
    return process.env.USER_TYPE === 'ant' || isClaudeAISubscriber()
  }

  const config = getGlobalConfig()
  if (config.claudeInChromeDefaultEnabled === false) {
    return false
  }

  return process.env.USER_TYPE === 'ant' || isClaudeAISubscriber()
}

export async function buildAcpDynamicMcpConfig(): Promise<
  Record<string, ScopedMcpServerConfig>
> {
  const dynamicMcpConfig: Record<string, ScopedMcpServerConfig> = {
    'mcp-chrome': {
      type: 'http',
      url: 'http://127.0.0.1:12306/mcp',
      scope: 'dynamic',
    },
  }

  try {
    if (shouldEnableClaudeInChromeForAcp()) {
      Object.assign(
        dynamicMcpConfig,
        setupClaudeInChrome({ installNativeHost: false }).mcpConfig,
      )
    }
  } catch (error) {
    logForDebugging(`[ACP MCP] Claude in Chrome setup skipped: ${error}`)
  }

  if (feature('CHICAGO_MCP')) {
    try {
      if (getPlatform() !== 'unknown' && !getIsNonInteractiveSession()) {
        const { getChicagoEnabled } = await import(
          '../../utils/computerUse/gates.js'
        )
        if (getChicagoEnabled()) {
          const { setupComputerUseMCP } = await import(
            '../../utils/computerUse/setup.js'
          )
          Object.assign(dynamicMcpConfig, setupComputerUseMCP().mcpConfig)
        }
      }
    } catch (error) {
      logForDebugging(`[ACP MCP] Computer Use setup skipped: ${error}`)
    }
  }

  const { allowed, blocked } = filterMcpServersByPolicy(dynamicMcpConfig)
  if (blocked.length > 0) {
    logForDebugging(
      `[ACP MCP] Dynamic MCP ${blocked.length === 1 ? 'server' : 'servers'} blocked by policy: ${blocked.join(', ')}`,
    )
  }

  return allowed
}
