# Cron Scheduling Test Plan

## Overview

The cron module provides cron expression parsing, next run time computation, and human-readable descriptions. All functions are pure with no external dependencies, making this one of the most suitable modules for unit testing.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/utils/cron.ts` | `CronFields`, `parseCronExpression`, `computeNextCronRun`, `cronToHuman` |

---

## Test Cases

### describe('parseCronExpression')

#### Valid Expressions

- test('parses wildcard fields') — `'* * * * *'` → each field is the full range
- test('parses specific values') — `'30 14 1 6 3'` → minute=[30], hour=[14], dom=[1], month=[6], dow=[3]
- test('parses step syntax') — `'*/5 * * * *'` → minute=[0,5,10,...,55]
- test('parses range syntax') — `'1-5 * * * *'` → minute=[1,2,3,4,5]
- test('parses range with step') — `'1-10/3 * * * *'` → minute=[1,4,7,10]
- test('parses comma-separated list') — `'1,15,30 * * * *'` → minute=[1,15,30]
- test('parses day-of-week 7 as Sunday alias') — `'0 0 * * 7'` → dow=[0]
- test('parses range with day-of-week 7') — `'0 0 * * 5-7'` → dow=[0,5,6]
- test('parses complex combined expression') — `'0,30 9-17 * * 1-5'` → weekdays 9-17 every half hour

#### Invalid Expressions

- test('returns null for wrong field count') — `'* * *'` → null
- test('returns null for out-of-range values') — `'60 * * * *'` → null (minute max=59)
- test('returns null for invalid step') — `'*/0 * * * *'` → null (step=0)
- test('returns null for reversed range') — `'10-5 * * * *'` → null (lo>hi)
- test('returns null for empty string') — `''` → null
- test('returns null for non-numeric tokens') — `'abc * * * *'` → null

#### Field Range Validation

- test('minute: 0-59')
- test('hour: 0-23')
- test('dayOfMonth: 1-31')
- test('month: 1-12')
- test('dayOfWeek: 0-6 (plus 7 alias)')

---

### describe('computeNextCronRun')

#### Basic Matching

- test('finds next minute') — from 14:30:45, cron `'31 14 * * *'` → 14:31:00 same day
- test('finds next hour') — from 14:30, cron `'0 15 * * *'` → 15:00 same day
- test('rolls to next day') — from 14:30, cron `'0 10 * * *'` → 10:00 next day
- test('rolls to next month') — from January 31, cron `'0 0 1 * *'` → February 1
- test('is strictly after from date') — When from exactly matches, should return next occurrence rather than current time

#### DOM/DOW Semantics

- test('OR semantics when both dom and dow constrained') — dom=15, dow=3 → matches the 15th OR Wednesday
- test('only dom constrained uses dom') — dom=15, dow=* → matches only the 15th
- test('only dow constrained uses dow') — dom=*, dow=3 → matches only Wednesday
- test('both wildcarded matches every day') — dom=*, dow=* → every day

#### Edge Cases

- test('handles month boundary') — From February 28, searching for February 29 or March 1
- test('returns null after 366-day search') — Returns null for impossible expressions (theoretically should not happen)
- test('handles step across midnight') — `'0 0 * * *'` from 23:59 → next day 0:00

#### Every N Minutes

- test('every 5 minutes from arbitrary time') — `'*/5 * * * *'` from 14:32 → 14:35
- test('every minute') — `'* * * * *'` from 14:32:45 → 14:33:00

---

### describe('cronToHuman')

#### Common Patterns

- test('every N minutes') — `'*/5 * * * *'` → `'Every 5 minutes'`
- test('every minute') — `'*/1 * * * *'` → `'Every minute'`
- test('every hour at :00') — `'0 * * * *'` → `'Every hour'`
- test('every hour at :30') — `'30 * * * *'` → `'Every hour at :30'`
- test('every N hours') — `'0 */2 * * *'` → `'Every 2 hours'`
- test('daily at specific time') — `'30 9 * * *'` → `'Every day at 9:30 AM'`
- test('specific day of week') — `'0 9 * * 3'` → `'Every Wednesday at 9:00 AM'`
- test('weekdays') — `'0 9 * * 1-5'` → `'Weekdays at 9:00 AM'`

#### Fallback

- test('returns raw cron for complex patterns') — Returns original cron string for uncommon patterns
- test('returns raw cron for wrong field count') — `'* * *'` → returned as-is

#### UTC Mode

- test('UTC option formats time in local timezone') — UTC time converted to local display when `{ utc: true }`
- test('UTC midnight crossing adjusts day name') — Local day name is correct when UTC time crosses day boundary

---

## Mock Requirements

**No mocks needed**. All functions are pure. The only external dependency is the `Date` constructor and `toLocaleTimeString`, which can be controlled by passing a deterministic `from` parameter.

## Notes

- `cronToHuman` time formatting depends on system locale; tests should use `'en-US'` locale or only verify partial output
- `computeNextCronRun` uses local timezone; DST-related tests should be aware of the execution environment
