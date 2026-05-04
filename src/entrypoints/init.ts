import { profileCheckpoint } from '../utils/startupProfiler.js'
import '../bootstrap/state.js'
import '../utils/config.js'
import type { Attributes, MetricOptions } from '@opentelemetry/api'
import memoize from 'lodash-es/memoize.js'
import { getIsNonInteractiveSession } from 'src/bootstrap/state.js'
import type { AttributedCounter } from '../bootstrap/state.js'
import { getSessionCounter, setMeter } from '../bootstrap/state.js'
import { shutdownLspServerManager } from '../services/lsp/manager.js'
import { populateOAuthAccountInfoIfNeeded } from '../services/oauth/client.js'
import {
  initializePolicyLimitsLoadingPromise,
  isPolicyLimitsEligible,
} from '../services/policyLimits/index.js'
import {
  initializeRemoteManagedSettingsLoadingPromise,
  isEligibleForRemoteManagedSettings,
  waitForRemoteManagedSettingsToLoad,
} from '../services/remoteManagedSettings/index.js'
import { preconnectAnthropicApi } from '../utils/apiPreconnect.js'
import { applyExtraCACertsFromConfig } from '../utils/caCertsConfig.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import {
  enableConfigs,
  getGlobalConfig,
  recordFirstStartTime,
  saveGlobalConfig,
} from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { detectCurrentRepository } from '../utils/detectRepository.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { initJetBrainsDetection } from '../utils/envDynamic.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { ConfigParseError, errorMessage } from '../utils/errors.js'
// showInvalidConfigDialog 在错误路径中动态导入，以避免在初始化时加载 React
import {
  gracefulShutdownSync,
  setupGracefulShutdown,
} from '../utils/gracefulShutdown.js'
import {
  applyConfigEnvironmentVariables,
  applySafeConfigEnvironmentVariables,
} from '../utils/managedEnv.js'
import { configureGlobalMTLS } from '../utils/mtls.js'
import {
  ensureScratchpadDir,
  isScratchpadEnabled,
} from '../utils/permissions/filesystem.js'
// initializeTelemetry 通过 import() 懒加载，以便将约 400KB 的 OpenTelemetry + protobuf 模块延迟到遥测真正初始化时加载。
// gRPC 导出器（通过 @grpc/grpc-js 约 700KB）进一步在 instrumentation.ts 中懒加载。
import { configureGlobalAgents } from '../utils/proxy.js'
import { isBetaTracingEnabled } from '../utils/telemetry/betaSessionTracing.js'
import { getTelemetryAttributes } from '../utils/telemetryAttributes.js'
import { setShellIfWindows } from '../utils/windowsPaths.js'
import { initSentry } from '../utils/sentry.js'
import { initUser } from '../utils/user.js'
import { initLangfuse, shutdownLangfuse } from '../services/langfuse/index.js'
import { setThemeConfigCallbacks } from '@anthropic/ink'

// initialize1PEventLogging 动态导入，以延迟 OpenTelemetry sdk-logs/resources

// 跟踪遥测是否已初始化，防止重复初始化
let telemetryInitialized = false

export const init = memoize(async (): Promise<void> => {
  const initStartTime = Date.now()
  logForDiagnosticsNoPII('info', 'init_started')
  profileCheckpoint('init_function_start')

  // 验证配置是否有效并启用配置系统
  try {
    const configsStart = Date.now()
    enableConfigs()
    setThemeConfigCallbacks({
      loadTheme: () => getGlobalConfig().theme,
      saveTheme: setting =>
        saveGlobalConfig(current => ({ ...current, theme: setting })),
    })
    logForDiagnosticsNoPII('info', 'init_configs_enabled', {
      duration_ms: Date.now() - configsStart,
    })
    profileCheckpoint('init_configs_enabled')

    // 在信任对话框之前仅应用安全的环境变量
    // 完整的环境变量在信任建立后应用
    const envVarsStart = Date.now()
    applySafeConfigEnvironmentVariables()

    // 从 settings.json 中提前将 NODE_EXTRA_CA_CERTS 应用到 process.env，
    // 在任何 TLS 连接之前。Bun 在启动时通过 BoringSSL 缓存 TLS 证书存储，
    // 因此必须在第一次 TLS 握手之前完成此操作。
    applyExtraCACertsFromConfig()

    logForDiagnosticsNoPII('info', 'init_safe_env_vars_applied', {
      duration_ms: Date.now() - envVarsStart,
    })
    profileCheckpoint('init_safe_env_vars_applied')

    // 确保退出时刷新资源
    setupGracefulShutdown()
    profileCheckpoint('init_after_graceful_shutdown')

    // 初始化第一方事件日志记录（无安全顾虑，但延迟以避免在启动时加载 OpenTelemetry sdk-logs）。
    // 此时 growthbook.js 已在模块缓存中（firstPartyEventLogger 导入了它），
    // 因此第二次动态导入不会增加加载成本。
    void Promise.all([
      import('../services/analytics/firstPartyEventLogger.js'),
      import('../services/analytics/growthbook.js'),
    ]).then(([fp, gb]) => {
      fp.initialize1PEventLogging()
      // 如果 tengu_1p_event_batch_config 在会话中期发生变化，则重建日志记录器提供者。
      // 变更检测（isEqual）在处理函数内部，因此不变的刷新是无操作的。
      gb.onGrowthBookRefresh(() => {
        void fp.reinitialize1PEventLoggingIfConfigChanged()
      })
    })
    profileCheckpoint('init_after_1p_event_logging')

    // 启动余额轮询（除非通过环境变量配置了提供者，否则无操作）。
    void import('../services/providerUsage/balance/poller.js').then(m =>
      m.startBalancePolling(),
    )
    profileCheckpoint('init_after_balance_polling')

    // 如果 OAuth 账户信息尚未缓存在配置中，则填充它。这是必要的，因为
    // 通过 VSCode 扩展登录时 OAuth 账户信息可能尚未填充。
    void populateOAuthAccountInfoIfNeeded()
    profileCheckpoint('init_after_oauth_populate')

    // 异步初始化 JetBrains IDE 检测（填充缓存以供后续同步访问）
    void initJetBrainsDetection()
    profileCheckpoint('init_after_jetbrains_detection')

    // 异步检测 GitHub 仓库（填充缓存以供 gitDiff PR 链接使用）
    void detectCurrentRepository()

    // 提前初始化加载 promise，以便其他系统（如插件钩子）可以等待远程设置加载。
    // 该 promise 包含超时，以防止在从未调用 loadRemoteManagedSettings() 时死锁（例如 Agent SDK 测试）。
    if (isEligibleForRemoteManagedSettings()) {
      initializeRemoteManagedSettingsLoadingPromise()
    }
    if (isPolicyLimitsEligible()) {
      initializePolicyLimitsLoadingPromise()
    }
    profileCheckpoint('init_after_remote_settings_check')

    // 记录首次启动时间
    recordFirstStartTime()

    // 配置全局 mTLS 设置
    const mtlsStart = Date.now()
    logForDebugging('[init] configureGlobalMTLS 开始')
    configureGlobalMTLS()
    logForDiagnosticsNoPII('info', 'init_mtls_configured', {
      duration_ms: Date.now() - mtlsStart,
    })
    logForDebugging('[init] configureGlobalMTLS 完成')

    // 配置全局 HTTP 代理（代理和/或 mTLS）
    const proxyStart = Date.now()
    logForDebugging('[init] configureGlobalAgents 开始')
    configureGlobalAgents()
    logForDiagnosticsNoPII('info', 'init_proxy_configured', {
      duration_ms: Date.now() - proxyStart,
    })
    logForDebugging('[init] configureGlobalAgents 完成')
    profileCheckpoint('init_network_configured')

    // 初始化 Sentry 错误报告（如果未设置 SENTRY_DSN，则为无操作）
    initSentry()

    // 初始化 Langfuse 追踪（如果未配置密钥，则为无操作）
    // 预热用户邮箱缓存，以便 Langfuse 追踪包含 userId
    await initUser()
    initLangfuse()
    registerCleanup(shutdownLangfuse)

    // 预连接到 Anthropic API — 将 TCP+TLS 握手（约 100-200ms）
    // 与 API 请求之前约 100ms 的动作处理器工作重叠。
    // 在 CA 证书 + 代理代理配置完成后进行，以便预热连接使用正确的传输。
    // 即发即弃；对于代理/mTLS/unix/云提供者跳过，因为 SDK 的调度程序不会重用全局连接池。
    preconnectAnthropicApi()

    // CCR 上游代理：启动本地 CONNECT 中继，以便代理子进程能够通过凭据注入访问组织配置的上游。
    // 门控条件：CLAUDE_CODE_REMOTE + GrowthBook；任何错误时失败开放。懒加载导入，以便非 CCR 启动不支付模块加载成本。
    // getUpstreamProxyEnv 函数注册到 subprocessEnv.ts，以便子进程生成时可以注入代理变量，而无需静态导入 upstreamproxy 模块。
    if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
      try {
        const { initUpstreamProxy, getUpstreamProxyEnv } = await import(
          '../upstreamproxy/upstreamproxy.js'
        )
        const { registerUpstreamProxyEnvFn } = await import(
          '../utils/subprocessEnv.js'
        )
        registerUpstreamProxyEnvFn(getUpstreamProxyEnv)
        await initUpstreamProxy()
      } catch (err) {
        logForDebugging(
          `[init] upstreamproxy 初始化失败：${err instanceof Error ? err.message : String(err)}；继续运行而不使用代理`,
          { level: 'warn' },
        )
      }
    }

    // 设置 git-bash（如果相关）
    setShellIfWindows()

    // 注册 LSP 管理器清理（初始化在 main.tsx 中处理 --plugin-dir 后发生）
    registerCleanup(shutdownLspServerManager)

    // gh-32730：由子代理（或未显式调用 TeamDelete 的主代理）创建的团队会永远留在磁盘上。
    // 为此会话创建的所有团队注册清理。懒加载导入：群组代码受功能门控保护，大多数会话从不创建团队。
    registerCleanup(async () => {
      const { cleanupSessionTeams } = await import(
        '../utils/swarm/teamHelpers.js'
      )
      await cleanupSessionTeams()
    })

    // 如果启用了暂存目录，则初始化暂存目录
    if (isScratchpadEnabled()) {
      const scratchpadStart = Date.now()
      await ensureScratchpadDir()
      logForDiagnosticsNoPII('info', 'init_scratchpad_created', {
        duration_ms: Date.now() - scratchpadStart,
      })
    }

    logForDiagnosticsNoPII('info', 'init_completed', {
      duration_ms: Date.now() - initStartTime,
    })
    profileCheckpoint('init_function_end')
  } catch (error) {
    if (error instanceof ConfigParseError) {
      // 当无法安全渲染交互式 Ink 对话框时跳过。
      // 该对话框会破坏 JSON 消费者（例如在 VM 沙箱中运行 `plugin marketplace list --json` 的桌面市场插件管理器）。
      if (getIsNonInteractiveSession()) {
        process.stderr.write(
          `配置文件 ${error.filePath} 中的配置错误：${error.message}\n`,
        )
        gracefulShutdownSync(1)
        return
      }

      // 显示无效配置对话框并等待其完成
      return import('../components/InvalidConfigDialog.js').then(m =>
        m.showInvalidConfigDialog({ error }),
      )
      // 对话框本身处理 process.exit，因此此处无需额外清理
    } else {
      // 对于非配置错误，重新抛出
      throw error
    }
  }
})

/**
 * 在信任被授予后初始化遥测。
 * 对于有资格使用远程设置的用户，等待设置加载（非阻塞），
 * 然后重新应用环境变量（以包含远程设置），再初始化遥测。
 * 对于无资格的用户，立即初始化遥测。
 * 此函数应仅在信任对话框被接受后调用一次。
 */
export function initializeTelemetryAfterTrust(): void {
  if (isEligibleForRemoteManagedSettings()) {
    // 对于启用 beta 追踪的 SDK/无头模式，首先急切初始化，
    // 以确保追踪器在第一次查询运行之前准备就绪。
    // 下面的异步路径仍会运行，但 doInitializeTelemetry() 会防止双重初始化。
    if (getIsNonInteractiveSession() && isBetaTracingEnabled()) {
      void doInitializeTelemetry().catch(error => {
        logForDebugging(
          `[3P telemetry] 急切遥测初始化失败（beta 追踪）：${errorMessage(error)}`,
          { level: 'error' },
        )
      })
    }
    logForDebugging('[3P telemetry] 正在等待远程托管设置加载，然后初始化遥测')
    void waitForRemoteManagedSettingsToLoad()
      .then(async () => {
        logForDebugging('[3P telemetry] 远程托管设置已加载，正在初始化遥测')
        // 重新应用环境变量以在初始化遥测之前获取远程设置。
        applyConfigEnvironmentVariables()
        await doInitializeTelemetry()
      })
      .catch(error => {
        logForDebugging(
          `[3P telemetry] 遥测初始化失败（远程设置路径）：${errorMessage(error)}`,
          { level: 'error' },
        )
      })
  } else {
    void doInitializeTelemetry().catch(error => {
      logForDebugging(`[3P telemetry] 遥测初始化失败：${errorMessage(error)}`, {
        level: 'error',
      })
    })
  }
}

async function doInitializeTelemetry(): Promise<void> {
  if (telemetryInitialized) {
    // 已初始化，无需操作
    return
  }

  // 在初始化前设置标志，防止重复初始化
  telemetryInitialized = true
  try {
    await setMeterState()
  } catch (error) {
    // 失败时重置标志，以便后续调用可以重试
    telemetryInitialized = false
    throw error
  }
}

async function setMeterState(): Promise<void> {
  // 懒加载插桩，以延迟约 400KB 的 OpenTelemetry + protobuf
  const { initializeTelemetry } = await import(
    '../utils/telemetry/instrumentation.js'
  )
  // 初始化客户 OTLP 遥测（指标、日志、追踪）
  const meter = await initializeTelemetry()
  if (meter) {
    // 创建带属性的计数器的工厂函数
    const createAttributedCounter = (
      name: string,
      options: MetricOptions,
    ): AttributedCounter => {
      const counter = meter?.createCounter(name, options)

      return {
        add(value: number, additionalAttributes: Attributes = {}) {
          // 始终获取最新的遥测属性，以确保它们是最新的
          const currentAttributes = getTelemetryAttributes()
          const mergedAttributes = {
            ...currentAttributes,
            ...additionalAttributes,
          }
          counter?.add(value, mergedAttributes)
        },
      }
    }

    setMeter(meter, createAttributedCounter)

    // 在此处增加会话计数器，因为启动遥测路径在此异步初始化完成之前运行，
    // 因此那时计数器将为 null。
    getSessionCounter()?.add(1)
  }
}
