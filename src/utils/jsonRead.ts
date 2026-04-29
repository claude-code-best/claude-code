/**
 * 独立 stripBOM —— 从 json.ts 中提取出来，以打破 settings → json → log →
 * types/logs → … → settings 的循环依赖。json.ts 导入此函数用于其带缓存和日志的
 * safeParseJSON；无法导入 json.ts 的叶子调用者内联使用 stripBOM + jsonParse（例如 syncCacheState）。
 *
 * UTF-8 BOM（U+FEFF）：PowerShell 5.x 默认写入带 BOM 的 UTF-8
 *（Out-File、Set-Content）。我们无法控制用户环境，因此在读取时去除 BOM。
 * 若不处理，JSON.parse 将失败并提示 "Unexpected token"。
 */

const UTF8_BOM = '\uFEFF'

export function stripBOM(content: string): string {
  return content.startsWith(UTF8_BOM) ? content.slice(1) : content
}
