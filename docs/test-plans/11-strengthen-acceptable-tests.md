# Plan 11 — 加强 ACCEPTABLE 评分测试

> 优先级：中 | ~15 个文件 | 预估新增 ~80 个测试用例

本计划对 ACCEPTABLE 评分文件中的具体缺陷进行定向加强。每个条目只列出需要改动的部分，不做全量重写。

---

## 11.1 `src/utils/__tests__/diff.test.ts`

| 改动 | 当前 | 改为 |
|------|------|------|
| `getPatchFromContents` 断言 | `hunks.length > 0` | 验证具体 `+`/`-` 行内容 |
| `$` 字符转义 | 未测试 | 新增含 `$` 的内容测试 |
| `ignoreWhitespace` 选项 | 未测试 | 新增 `ignoreWhitespace: true` 用例 |
| 删除全部内容 | 未测试 | `newContent: ""` |
| 多 hunk 偏移 | `adjustHunkLineNumbers` 仅单 hunk | 新增多 hunk 同数组测试 |

---

## 11.2 `src/utils/__tests__/path.test.ts`

当前仅覆盖 2/5+ 导出函数。新增：

| 函数 | 最少用例 | 关键边界 |
|------|---------|---------|
| `expandPath` | 6 | `~/` 展开、绝对路径直通、相对路径、空串、含 null 字节、`~user` 格式 |
| `toRelativePath` | 3 | 同级文件、子目录、父目录 |
| `sanitizePath` | 3 | 正常路径、含 `..` 段、空串 |

`containsPathTraversal` 补充：
- URL 编码 `%2e%2e%2f`（确认不匹配，记录为非需求）
- 混合分隔符 `foo/..\bar`

`normalizePathForConfigKey` 补充：
- 混合分隔符 `foo/bar\baz`
- 冗余分隔符 `foo//bar`
- Windows 盘符 `C:\foo\bar`

---

## 11.3 `src/utils/__tests__/uuid.test.ts`

| 改动 | 说明 |
|------|------|
| 大写测试断言强化 | `not.toBeNull()` → 验证标准化输出（小写+连字符格式） |
| 新增 `createAgentId` | 3 用例：无 label / 有 label / 输出格式正则 `/^a[a-z]*-[a-f0-9]{16}$/` |
| 前后空白 | `" 550e8400-...  "` 期望 `null` |

---

## 11.4 `src/utils/__tests__/semver.test.ts`

| 用例 | 输入 | 期望 |
|------|------|------|
| pre-release 比较 | `gt("1.0.0", "1.0.0-alpha")` | `true` |
| pre-release 间比较 | `order("1.0.0-alpha", "1.0.0-beta")` | `-1` |
| tilde range | `satisfies("1.2.5", "~1.2.3")` | `true` |
| `*` 通配符 | `satisfies("2.0.0", "*")` | `true` |
| 畸形版本 | `order("abc", "1.0.0")` | 确认不抛错 |
| `0.0.0` | `gt("0.0.0", "0.0.0")` | `false` |

---

## 11.5 `src/utils/__tests__/hash.test.ts`

| 改动 | 当前 | 改为 |
|------|------|------|
| djb2 32 位检查 | `hash \| 0`（恒 true） | `Number.isSafeInteger(hash) && Math.abs(hash) <= 0x7FFFFFFF` |
| hashContent 空串 | 未测试 | 新增 |
| hashContent 格式 | 未验证输出为数字串 | `toMatch(/^\d+$/)` |
| hashPair 空串 | 未测试 | `hashPair("", "b")`, `hashPair("", "")` |
| 已知答案 | 无 | 断言 `djb2Hash("hello")` 为特定值（需先在控制台运行一次确定） |

---

## 11.6 `src/utils/__tests__/claudemd.test.ts`

当前仅覆盖 3 个辅助函数。新增：

| 用例 | 函数 | 说明 |
|------|------|------|
| 未闭合注释 | `stripHtmlComments` | `"<!-- no close some text"` → 原样返回 |
| 跨行注释 | `stripHtmlComments` | `"<!--\nmulti\nline\n-->text"` → `"text"` |
| 同行注释+内容 | `stripHtmlComments` | `"<!-- note -->some text"` → `"some text"` |
| 内联代码中的注释 | `stripHtmlComments` | `` `<!-- kept -->` `` → 保留 |
| 大小写不敏感 | `isMemoryFilePath` | `"claude.md"`, `"CLAUDE.MD"` |
| 非 .md 规则文件 | `isMemoryFilePath` | `.claude/rules/foo.txt` → `false` |
| 空数组 | `getLargeMemoryFiles` | `[]` → `[]` |

---

## 11.7 `src/tools/FileEditTool/__tests__/utils.test.ts`

| 函数 | 新增用例 |
|------|---------|
| `normalizeQuotes` | 混合引号 `"`she said 'hello'"` |
| `stripTrailingWhitespace` | CR-only `\r`、无尾部换行、全空白串 |
| `findActualString` | 空 content、Unicode content |
| `preserveQuoteStyle` | 单引号、缩写中的撇号（如 `it's`）、空串 |
| `applyEditToFile` | `replaceAll=true` 零匹配、`oldString` 无尾部 `\n`、多行内容 |

---

## 11.8 `src/utils/model/__tests__/providers.test.ts`

| 改动 | 说明 |
|------|------|
| 删除 `originalEnv` | 未使用，消除死代码 |
| env 恢复改为快照 | `beforeEach` 保存 `process.env`，`afterEach` 恢复 |
| 新增三变量同时设置 | bedrock + vertex + foundry 全部为 `"1"`，验证优先级 |
| 新增非 `"1"` 值 | `"true"`, `"0"`, `""` |
| `isFirstPartyAnthropicBaseUrl` | URL 含路径 `/v1`、含尾斜杠、非 HTTPS |

---

## 11.9 `src/utils/__tests__/hyperlink.test.ts`

| 用例 | 说明 |
|------|------|
| 空 URL | `createHyperlink("http://x.com", "", { supported: true })` 不抛错 |
| undefined supportsHyperlinks | 选项未传时走默认检测 |
| 非 ant staging URL | `USER_TYPE !== "ant"` 时 staging 返回 `false` |

---

## 11.10 `src/utils/__tests__/objectGroupBy.test.ts`

| 用例 | 说明 |
|------|------|
| key 返回 undefined | `(_, i) => undefined` → 全部归入 `undefined` 组 |
| key 为特殊字符 | `({ name }) => name` 含空格/中文 |

---

## 11.11 `src/utils/__tests__/CircularBuffer.test.ts`

| 用例 | 说明 |
|------|------|
| capacity=1 | 添加 2 个元素，仅保留最后一个 |
| 空 buffer 调用 getRecent | 返回空数组 |
| getRecent(0) | 返回空数组 |

---

## 11.12 `src/utils/__tests__/contentArray.test.ts`

| 用例 | 说明 |
|------|------|
| 混合交替 | `[tool_result, text, tool_result]` — 验证插入到正确位置 |

---

## 11.13 `src/utils/__tests__/argumentSubstitution.test.ts`

| 用例 | 说明 |
|------|------|
| 转义引号 | `"he said \"hello\""` |
| 越界索引 | `$ARGUMENTS[99]`（参数不够时） |
| 多占位符 | `"cmd $0 $1 $0"` |

---

## 11.14 `src/utils/__tests__/messages.test.ts`

| 改动 | 说明 |
|------|------|
| `normalizeMessages` 断言加强 | 验证拆分后的消息内容，不只是长度 |
| `isNotEmptyMessage` 空白 | `[{ type: "text", text: "  " }]` |

---

## 验收标准

- [ ] `bun test` 全部通过
- [ ] 目标文件评分从 ACCEPTABLE 提升至 GOOD
- [ ] 无 `toContain` 用于精确值检查的场景
