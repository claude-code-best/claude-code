/**
 * 通过 AsyncLocalStorage 实现回合级别的工作负载标签。
 *
 * 为什么单独放在一个模块而不是 bootstrap/state.ts 中：
 * bootstrap 被 src/entrypoints/browser-sdk.ts 传递导入，而浏览器 bundle 无法导入 Node 的 async_hooks。
 * 本模块仅从 CLI/SDK 代码路径中导入，这些路径永远不会进入浏览器构建。
 *
 * 为什么使用 AsyncLocalStorage（而不是全局可变槽）：
 * void-detached 的后台 agent（executeForkedSlashCommand、AgentTool）会在第一个 await 处让出。
 * 父回合的同步延续代码 —— 包括任何 `finally` 块 —— 在 detached 闭包恢复之前就会运行完成。
 * 在闭包顶部设置全局的 setWorkload('cron') 会被确定性地覆盖。
 * ALS 在调用时捕获上下文，并且在该链中的每个 await 之后依然保持，与父上下文隔离。
 * 与 agentContext.ts 使用相同的模式。
 */

import { AsyncLocalStorage } from 'async_hooks'

/**
 * 服务端清理器（claude_code.py 中的 _sanitize_entrypoint）仅接受小写 [a-z0-9_-]{0,32}。
 * 大写字母会导致解析在第 0 个字符处停止。
 */
export type Workload = 'cron'
export const WORKLOAD_CRON: Workload = 'cron'

const workloadStorage = new AsyncLocalStorage<{
  workload: string | undefined
}>()

export function getWorkload(): string | undefined {
  return workloadStorage.getStore()?.workload
}

/**
 * 将 `fn` 包裹在 workload ALS 上下文中。始终建立一个新的上下文边界，即使 `workload` 为 undefined。
 *
 * 之前的实现在 `undefined` 时会短路，直接 `return fn()` —— 但这是透传，而不是边界。
 * 如果调用者已经处于泄漏的 cron 上下文中（REPL：queryGuard.end() →
 * _notify() → React 订阅者 → 调度时捕获 ALS 的计划重渲染 → useQueueProcessor 效果 → executeQueuedInput → 此处），
 * 透传会导致 `fn` 内部的 `getWorkload()` 返回泄漏的标签。
 * 一旦泄漏，就会永久粘滞：每个回合的 end-notify 都会将环境上下文重新传播到下一个回合的调度链中。
 *
 * 始终调用 `.run()` 保证了 `fn` 内部的 `getWorkload()` 精确返回调用者传入的值 —— 包括 `undefined`。
 */
export function runWithWorkload<T>(
  workload: string | undefined,
  fn: () => T,
): T {
  return workloadStorage.run({ workload }, fn)
}
