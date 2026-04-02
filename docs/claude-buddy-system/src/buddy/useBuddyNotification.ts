/**
 * Claude Code Buddy System — Buddy 通知 & 可用性检查
 * 从 @anthropic-ai/claude-code cli.js (v2.1.89) 反编译还原
 *
 * 源码位置: src/buddy/useBuddyNotification.ts
 */

/**
 * 判断 Buddy 系统是否可用
 *
 * 源码中的变量映射: Fd8 = isBuddyLive
 *
 * 条件:
 * 1. 必须是 firstParty (OAuth 登录的 claude.ai 用户)
 * 2. 不能是 headless 模式
 * 3. 日期限制: 2026 年 4 月 1 日之后 (April Fools 彩蛋，但保留至今)
 *    源码: q.getFullYear() > 2026 || (q.getFullYear() === 2026 && q.getMonth() >= 3)
 *    注意: getMonth() 是 0-based，3 = April
 */
export function isBuddyLive(): boolean {
  // 源码: if (getAuthType() !== 'firstParty') return false;
  // 源码: if (isHeadless()) return false;
  const now = new Date();
  return now.getFullYear() > 2026 || (now.getFullYear() === 2026 && now.getMonth() >= 3);
}

/**
 * Buddy 预告通知 Hook
 *
 * 源码中的变量映射: LFK = useBuddyTeaser
 *
 * 如果用户还没有 companion 且 buddy 功能可用，
 * 显示一个 15 秒的 "/buddy" 彩虹文字通知提示用户去孵化
 */
export function useBuddyTeaser(): void {
  // 源码实现 (React Hook):
  // useEffect(() => {
  //   if (getGlobalConfig().companion || !isBuddyLive()) return;
  //   const cleanup = addNotification({
  //     key: 'buddy-teaser',
  //     jsx: <RainbowText text="/buddy" />,
  //     priority: 'immediate',
  //     timeoutMs: 15000,
  //   });
  //   return () => removeNotification('buddy-teaser');
  // }, [addNotification, removeNotification]);
}

/**
 * 检测消息中是否包含 /buddy 命令
 *
 * 源码中的变量映射: hFK = findBuddyMentions
 */
export function findBuddyMentions(text: string): Array<{ start: number; end: number }> {
  const matches: Array<{ start: number; end: number }> = [];
  const regex = /\/buddy\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length });
  }
  return matches;
}
