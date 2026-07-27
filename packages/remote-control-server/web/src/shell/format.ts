// =============================================================================
// 展示格式化工具 — 新外壳专用
// =============================================================================

/** 相对时间：刚刚 / n 分钟前 / n 小时前 / 昨天 / M月D日 */
export function timeAgo(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return ''
  const ms = tsSeconds * 1000
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(ms)
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  )
  if (ms >= startOfToday.getTime() - 86_400_000) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 目录路径取末段：/Users/a/dev/my-repo → my-repo */
export function dirBasename(dir: string | null | undefined): string {
  if (!dir) return ''
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || dir
}

/** 会话排序用的时间戳（秒） */
export function sessionTimestamp(s: {
  updated_at?: number
  created_at?: number
}): number {
  return s.updated_at || s.created_at || 0
}
