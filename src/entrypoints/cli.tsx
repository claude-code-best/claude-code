#!/usr/bin/env bun
import { feature } from 'bun:bundle'
import { isEnvTruthy } from '../utils/envUtils.js'

// 当未通过构建/开发定义注入时，为 MACRO.* 提供运行时回退。这发生在直
// 接运行 cli.tsx 时（而非通过 `bun run dev` 或构建后的 dist/）。
if (typeof globalThis.MACRO === 'undefined') {
  ;(globalThis as any).MACRO = {
    VERSION: process.env.CLAUDE_CODE_VERSION || '2.1.888',
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: '',
    ISSUES_EXPLAINER: '',
    NATIVE_PACKAGE_URL: '',
    PACKAGE_URL: '',
    VERSION_CHANGELOG: '',
  }
}

if (isEnvTruthy(process.env.CLAUDE_CODE_FORCE_INTERACTIVE)) {
  for (const stream of [process.stdin, process.stdout, process.stderr]) {
    if (!stream.isTTY) {
      try {
        Object.defineProperty(stream, 'isTTY', {
          value: true,
          configurable: true,
        })
      } catch {
        // 针对 Windows 上嵌套 bun 启动的尽力而为的仅开发环境覆盖。
      }
    }
  }
}

// 修复 corepack 自动锁定功能的 bug，该功能会将 yarnpkg 添加到用户的 package.json 中 eslint-d
// isable-next-line custom-rules/no-top-level-side-effects
process.env.COREPACK_ENABLE_AUTO_PIN = '0'

// 为 CCR 环境中的子进程设置最大堆大小（容器有 16GB） eslint-disable-next-line custom
// -rules/no-top-level-side-effects, custom-rules/no-process-env-top-level, custom-rules/safe-env-boolean-check
if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
  const existing = process.env.NODE_OPTIONS || ''
  // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
  process.env.NODE_OPTIONS = existing
    ? `${existing} --max-old-space-size=8192`
    : '--max-old-space-size=8192'
}

// Harness-science L0 消融基线。内联在此处（而非 init.ts）是因为 BashTool/
// AgentTool/PowerShellTool 在导入时会将 DISABLE_BACKGROUND_TA
// SKS 捕获到模块级常量中 —— init() 运行得太晚。feature() 门控将此整个代码块从外部构建
// 中死代码消除。eslint-disable-next-line c
// ustom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
if (feature('ABLATION_BASELINE') && process.env.CLAUDE_CODE_ABLATION_BASELINE) {
  for (const k of [
    'CLAUDE_CODE_SIMPLE',
    'CLAUDE_CODE_DISABLE_THINKING',
    'DISABLE_INTERLEAVED_THINKING',
    'DISABLE_COMPACT',
    'DISABLE_AUTO_COMPACT',
    'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
    'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS',
  ]) {
    // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
    process.env[k] ??= '1'
  }
}

/** 引导入口点 - 在加载完整 CLI 前检查特殊标志。
所有导入都是动态的，以最小化快速路径的模块求值。
--version 的快速路径在此文件之外零导入。 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // --version/-v 的快速路径：无需加载任何模块
  if (
    args.length === 1 &&
    (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')
  ) {
    // MACRO.VERSION is inlined at build time
    console.log(`${MACRO.VERSION} (Claude Code)`)
    return
  }

  // 对于所有其他路径，加载启动性能分析器
  const { profileCheckpoint } = await import('../utils/startupProfiler.js')
  profileCheckpoint('cli_entry')

  // --dump-system-prompt 的快速路径：输出渲染
  // 后的系统提示并退出。用于提示词敏感性评估，以在特定提交处提取系统
  // 提示。仅限内部：通过功能标志从外部构建中消除。
  if (feature('DUMP_SYSTEM_PROMPT') && args[0] === '--dump-system-prompt') {
    profileCheckpoint('cli_dump_system_prompt_path')
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()
    const { getMainLoopModel } = await import('../utils/model/model.js')
    const modelIdx = args.indexOf('--model')
    const model = (modelIdx !== -1 && args[modelIdx + 1]) || getMainLoopModel()
    const { getSystemPrompt } = await import('../constants/prompts.js')
    const prompt = await getSystemPrompt([], model)
    console.log(prompt.join('\n'))
    return
  }

  if (process.argv[2] === '--claude-in-chrome-mcp') {
    profileCheckpoint('cli_claude_in_chrome_mcp_path')
    const { runClaudeInChromeMcpServer } = await import(
      '../utils/claudeInChrome/mcpServer.js'
    )
    await runClaudeInChromeMcpServer()
    return
  } else if (process.argv[2] === '--chrome-native-host') {
    profileCheckpoint('cli_chrome_native_host_path')
    const { runChromeNativeHost } = await import(
      '../utils/claudeInChrome/chromeNativeHost.js'
    )
    await runChromeNativeHost()
    return
  } else if (
    feature('CHICAGO_MCP') &&
    process.argv[2] === '--computer-use-mcp'
  ) {
    profileCheckpoint('cli_computer_use_mcp_path')
    const { runComputerUseMcpServer } = await import(
      '../utils/computerUse/mcpServer.js'
    )
    await runComputerUseMcpServer()
    return
  }

  // `--acp` 的快速路径 —— 通过标准输入/输出的 ACP（Agent Client Protocol）代理模式。
  if (feature('ACP') && process.argv[2] === '--acp') {
    profileCheckpoint('cli_acp_path')
    const { runAcpAgent } = await import('../services/acp/entry.js')
    await runAcpAgent()
    return
  }

  if (args[0] === 'weixin') {
    profileCheckpoint('cli_weixin_path')
    const { handleWeixinCli } = await import('@claude-code-best/weixin')
    const { enableConfigs } = await import('../utils/config.js')
    const { initializeAnalyticsSink } = await import('../services/analytics/sink.js')
    const { shutdownDatadog } = await import('../services/analytics/datadog.js')
    const { shutdown1PEventLogging } = await import('../services/analytics/firstPartyEventLogger.js')
    const { logForDebugging } = await import('../utils/debug.js')
    const { ChannelPermissionRequestNotificationSchema } = await import('../services/mcp/channelNotification.js')
    await handleWeixinCli(args.slice(1), {
      enableConfigs,
      initializeAnalyticsSink,
      shutdownDatadog,
      shutdown1PEventLogging,
      logForDebugging,
      registerPermissionHandler(server, handler) {
        server.setNotificationHandler(
          ChannelPermissionRequestNotificationSchema(),
          async notification => handler(notification.params),
        )
      },
    }, MACRO.VERSION)
    return
  }

  // Fast-path for `--daemon-worker=<kind>` (internal — supervisor spawns this).
  // Must come before the daemon subcommand check: spawned per-worker, so
  // perf-sensitive. No enableConfigs(), no analytics sinks at this layer —
  // workers are lean. If a worker kind needs configs/auth (assistant will),
  // it calls them inside its run() fn.
  if (args[0] === '--daemon-worker' || args[0]?.startsWith('--daemon-worker=')) {
    if (!feature('DAEMON')) {
      console.error('Error: --daemon-worker requires DAEMON feature to be enabled. Set FEATURE_DAEMON=1 or add DAEMON to DEFAULT_BUILD_FEATURES.')
      process.exitCode = 1
      return
    }
    const kind = args[0] === '--daemon-worker' ? args[1] : args[0].split('=')[1]
    const { runDaemonWorker } = await import('../daemon/workerRegistry.js')
    await runDaemonWorker(kind)
    return
  }

  // `claude remote-control` 的快速路径（也接受旧的 `claude remote` / `claude sync` /
  // `claude bridge`）：将本地机器作为桥接环
  // 境提供服务。feature() 必须保持内联以便进行构建时死代码消除；isBrid
  // geEnabled() 检查运行时的 GrowthBook 门控。
  if (
    feature('BRIDGE_MODE') &&
    (args[0] === 'remote-control' ||
      args[0] === 'rc' ||
      args[0] === 'remote' ||
      args[0] === 'sync' ||
      args[0] === 'bridge')
  ) {
    profileCheckpoint('cli_bridge_path')
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()

    const { getBridgeDisabledReason, checkBridgeMinVersion } = await import(
      '../bridge/bridgeEnabled.js'
    )
    const { BRIDGE_LOGIN_ERROR } = await import('../bridge/types.js')
    const { bridgeMain } = await import('../bridge/bridgeMain.js')
    const { exitWithError } = await import('../utils/process.js')

    // 认证检查必须在 GrowthBook 门控检查之前 —— 没有认证，G
    // rowthBook 没有用户上下文，会返回过时的/默认的 false。
    // getBridgeDisabledReason 等待 GB 初始化，因
    // 此返回值是新鲜的（不是过时的磁盘缓存），但初始化仍然需要认证头才能工作。
    const { getClaudeAIOAuthTokens } = await import('../utils/auth.js')
    const { getBridgeAccessToken } = await import('../bridge/bridgeConfig.js')
    if (!getClaudeAIOAuthTokens()?.accessToken && !getBridgeAccessToken()) {
      exitWithError(BRIDGE_LOGIN_ERROR)
    }
    const disabledReason = await getBridgeDisabledReason()
    if (disabledReason) {
      exitWithError(`Error: ${disabledReason}`)
    }
    const versionError = checkBridgeMinVersion()
    if (versionError) {
      exitWithError(versionError)
    }

    // 桥接是一个远程控制功能 - 检查策略限制
    const { waitForPolicyLimitsToLoad, isPolicyAllowed } = await import(
      '../services/policyLimits/index.js'
    )
    await waitForPolicyLimitsToLoad()
    if (!isPolicyAllowed('allow_remote_control')) {
      exitWithError(
        "错误：远程控制已被您组织的策略禁用。",
      )
    }

    await bridgeMain(args.slice(1))
    return
  }

  // `claude daemon [subcommand]` 的快速路径：统一的守护进程
  // + 会话管理。在一个命名空间下处理监督进程（启动/停止）和后台会话（bg/atta
  // ch/logs/kill）子命令。
  if (
    (feature('DAEMON') || feature('BG_SESSIONS')) &&
    args[0] === 'daemon'
  ) {
    profileCheckpoint('cli_daemon_path')
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()
    const { setShellIfWindows } = await import('../utils/windowsPaths.js')
    setShellIfWindows()
    const { initSinks } = await import('../utils/sinks.js')
    initSinks()
    const { daemonMain } = await import('../daemon/main.js')
    await daemonMain(args.slice(1))
    return
  }

  // `--bg`/`--background` 快捷方式的快速路径 → daemon bg。
  if (
    feature('BG_SESSIONS') &&
    (args.includes('--bg') || args.includes('--background'))
  ) {
    profileCheckpoint('cli_daemon_path')
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()
    const { setShellIfWindows } = await import('../utils/windowsPaths.js')
    setShellIfWindows()
    const bg = await import('../cli/bg.js')
    await bg.handleBgStart(
      args.filter(a => a !== '--bg' && a !== '--background'),
    )
    return
  }

  // 向后兼容：ps/logs/attach/kill → daemon <子命令>（已弃用）
  if (
    feature('BG_SESSIONS') &&
    (args[0] === 'ps' ||
      args[0] === 'logs' ||
      args[0] === 'attach' ||
      args[0] === 'kill')
  ) {
    const mapped = args[0] === 'ps' ? 'status' : args[0]
    console.error(
      `[已弃用] 请使用：claude daemon ${mapped}${args[1] ? ' ' + args[1] : ''}`,
    )
    profileCheckpoint('cli_daemon_path')
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()
    const { setShellIfWindows } = await import('../utils/windowsPaths.js')
    setShellIfWindows()
    const { initSinks } = await import('../utils/sinks.js')
    initSinks()
    const { daemonMain } = await import('../daemon/main.js')
    await daemonMain([args[0] === 'ps' ? 'status' : args[0]!, ...args.slice(1)])
    return
  }

  // `claude job <subcommand>` 的快速路径：模板作业。
  if (feature('TEMPLATES') && args[0] === 'job') {
    profileCheckpoint('cli_templates_path')
    const { templatesMain } = await import('../cli/handlers/templateJobs.js')
    await templatesMain(args.slice(1))
    // process.exit（而非 return）—— mountFleetView 的 Ink TUI 可
    // 能会留下阻止自然退出的事件循环句柄。eslint-disab
    // le-next-line custom-rules/no-process-exit
    process.exit(0)
  }

  // 向后兼容：new/list/reply → job <子命令>（已弃用）
  if (
    feature('TEMPLATES') &&
    (args[0] === 'new' || args[0] === 'list' || args[0] === 'reply')
  ) {
    console.error(
      `[已弃用] 请使用：claude job ${args[0]} ${args.slice(1).join(' ')}`.trim(),
    )
    profileCheckpoint('cli_templates_path')
    const { templatesMain } = await import('../cli/handlers/templateJobs.js')
    await templatesMain(args)
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  }

  // `claude environment-runner` 的快速路径：无头 B
  // YOC 运行器。feature() 必须保持内联以便进行构建时死代码消除。
  if (feature('BYOC_ENVIRONMENT_RUNNER') && args[0] === 'environment-runner') {
    profileCheckpoint('cli_environment_runner_path')
    const { environmentRunnerMain } = await import(
      '../environment-runner/main.js'
    )
    await environmentRunnerMain(args.slice(1))
    return
  }

  // `claude self-hosted-runner` 的快速路径：面向 Sel
  // fHostedRunnerWorkerService API 的无头自托管运行器（
  // 注册 + 轮询；轮询即心跳）。feature() 必须保持内联以实现构建时死代码消除。
  if (feature('SELF_HOSTED_RUNNER') && args[0] === 'self-hosted-runner') {
    profileCheckpoint('cli_self_hosted_runner_path')
    const { selfHostedRunnerMain } = await import(
      '../self-hosted-runner/main.js'
    )
    await selfHostedRunnerMain(args.slice(1))
    return
  }

  // --worktree --tmux 的快速路径：在加载完整 CLI 前通过 exec 进入 tmux
  const hasTmuxFlag = args.includes('--tmux') || args.includes('--tmux=classic')
  if (
    hasTmuxFlag &&
    (args.includes('-w') ||
      args.includes('--worktree') ||
      args.some(a => a.startsWith('--worktree=')))
  ) {
    profileCheckpoint('cli_tmux_worktree_fast_path')
    const { enableConfigs } = await import('../utils/config.js')
    enableConfigs()
    const { isWorktreeModeEnabled } = await import(
      '../utils/worktreeModeEnabled.js'
    )
    if (isWorktreeModeEnabled()) {
      const { execIntoTmuxWorktree } = await import('../utils/worktree.js')
      const result = await execIntoTmuxWorktree(args)
      if (result.handled) {
        return
      }
      // 如果未处理（例如，错误），则回退到正常 CLI
      if (result.error) {
        const { exitWithError } = await import('../utils/process.js')
        exitWithError(result.error)
      }
    }
  }

  // 将常见的更新标志错误重定向到 update 子命令
  if (
    args.length === 1 &&
    (args[0] === '--update' || args[0] === '--upgrade')
  ) {
    process.argv = [process.argv[0]!, process.argv[1]!, 'update']
  }

  // --bare：尽早设置 SIMPLE，以便在模块评估 / commande
  // r 选项构建期间触发门控（而不仅仅在操作处理程序内部）。
  if (args.includes('--bare')) {
    process.env.CLAUDE_CODE_SIMPLE = '1'
  }

  // 未检测到特殊标志，加载并运行完整 CLI
  const { startCapturingEarlyInput } = await import('../utils/earlyInput.js')
  startCapturingEarlyInput()
  profileCheckpoint('cli_before_main_import')
  const { main: cliMain } = await import('../main.jsx')
  profileCheckpoint('cli_after_main_import')
  await cliMain()
  profileCheckpoint('cli_after_main_complete')
}

// eslint-disable-next-line custom-rules/no-top-level-side-effects
void main()
