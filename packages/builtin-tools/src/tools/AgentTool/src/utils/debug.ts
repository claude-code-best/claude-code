/** 写入调试日志文件（受日志级别与过滤规则约束）；与宿主 `src/utils/debug.js` 中 `logForDebugging` 一致。 */
export type logForDebugging =
  typeof import('src/utils/debug.js').logForDebugging
