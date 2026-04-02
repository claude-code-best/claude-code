# Cron 调度测试计划

## 概述

Cron 模块提供 cron 表达式解析、下次运行时间计算和人类可读描述。全部为纯函数，无外部依赖，是最适合单元测试的模块之一。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/utils/cron.ts` | `CronFields`, `parseCronExpression`, `computeNextCronRun`, `cronToHuman` |

---

## 测试用例

### describe('parseCronExpression')

#### 有效表达式

- test('parses wildcard fields') — `'* * * * *'` → 每个字段为完整范围
- test('parses specific values') — `'30 14 1 6 3'` → minute=[30], hour=[14], dom=[1], month=[6], dow=[3]
- test('parses step syntax') — `'*/5 * * * *'` → minute=[0,5,10,...,55]
- test('parses range syntax') — `'1-5 * * * *'` → minute=[1,2,3,4,5]
- test('parses range with step') — `'1-10/3 * * * *'` → minute=[1,4,7,10]
- test('parses comma-separated list') — `'1,15,30 * * * *'` → minute=[1,15,30]
- test('parses day-of-week 7 as Sunday alias') — `'0 0 * * 7'` → dow=[0]
- test('parses range with day-of-week 7') — `'0 0 * * 5-7'` → dow=[0,5,6]
- test('parses complex combined expression') — `'0,30 9-17 * * 1-5'` → 工作日 9-17 每半小时

#### 无效表达式

- test('returns null for wrong field count') — `'* * *'` → null
- test('returns null for out-of-range values') — `'60 * * * *'` → null（minute max=59）
- test('returns null for invalid step') — `'*/0 * * * *'` → null（step=0）
- test('returns null for reversed range') — `'10-5 * * * *'` → null（lo>hi）
- test('returns null for empty string') — `''` → null
- test('returns null for non-numeric tokens') — `'abc * * * *'` → null

#### 字段范围验证

- test('minute: 0-59')
- test('hour: 0-23')
- test('dayOfMonth: 1-31')
- test('month: 1-12')
- test('dayOfWeek: 0-6 (plus 7 alias)')

---

### describe('computeNextCronRun')

#### 基本匹配

- test('finds next minute') — from 14:30:45, cron `'31 14 * * *'` → 14:31:00 同天
- test('finds next hour') — from 14:30, cron `'0 15 * * *'` → 15:00 同天
- test('rolls to next day') — from 14:30, cron `'0 10 * * *'` → 10:00 次日
- test('rolls to next month') — from 1月31日, cron `'0 0 1 * *'` → 2月1日
- test('is strictly after from date') — from 恰好匹配时应返回下一次而非当前时间

#### DOM/DOW 语义

- test('OR semantics when both dom and dow constrained') — dom=15, dow=3 → 匹配 15 号 OR 周三
- test('only dom constrained uses dom') — dom=15, dow=* → 只匹配 15 号
- test('only dow constrained uses dow') — dom=*, dow=3 → 只匹配周三
- test('both wildcarded matches every day') — dom=*, dow=* → 每天

#### 边界情况

- test('handles month boundary') — 从 2 月 28 日寻找 2 月 29 日或 3 月 1 日
- test('returns null after 366-day search') — 不可能匹配的表达式返回 null（理论上不会发生）
- test('handles step across midnight') — `'0 0 * * *'` 从 23:59 → 次日 0:00

#### 每 N 分钟

- test('every 5 minutes from arbitrary time') — `'*/5 * * * *'` from 14:32 → 14:35
- test('every minute') — `'* * * * *'` from 14:32:45 → 14:33:00

---

### describe('cronToHuman')

#### 常见模式

- test('every N minutes') — `'*/5 * * * *'` → `'Every 5 minutes'`
- test('every minute') — `'*/1 * * * *'` → `'Every minute'`
- test('every hour at :00') — `'0 * * * *'` → `'Every hour'`
- test('every hour at :30') — `'30 * * * *'` → `'Every hour at :30'`
- test('every N hours') — `'0 */2 * * *'` → `'Every 2 hours'`
- test('daily at specific time') — `'30 9 * * *'` → `'Every day at 9:30 AM'`
- test('specific day of week') — `'0 9 * * 3'` → `'Every Wednesday at 9:00 AM'`
- test('weekdays') — `'0 9 * * 1-5'` → `'Weekdays at 9:00 AM'`

#### Fallback

- test('returns raw cron for complex patterns') — 非常见模式返回原始 cron 字符串
- test('returns raw cron for wrong field count') — `'* * *'` → 原样返回

#### UTC 模式

- test('UTC option formats time in local timezone') — `{ utc: true }` 时 UTC 时间转本地显示
- test('UTC midnight crossing adjusts day name') — UTC 时间跨天时本地星期名正确

---

## Mock 需求

**无需 Mock**。所有函数为纯函数，唯一的外部依赖是 `Date` 构造器和 `toLocaleTimeString`，可通过传入确定性的 `from` 参数控制。

## 注意事项

- `cronToHuman` 的时间格式化依赖系统 locale，测试中建议使用 `'en-US'` locale 或只验证部分输出
- `computeNextCronRun` 使用本地时区，DST 相关测试需注意运行环境
