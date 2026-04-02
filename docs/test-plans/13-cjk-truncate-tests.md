# Plan 13 — truncate CJK/Emoji 补充测试

> 优先级：中 | 1 个文件 | 预估新增 ~15 个测试用例

`truncate.ts` 使用 `stringWidth` 和 grapheme segmentation 实现宽度感知截断，但现有测试仅覆盖 ASCII。这是核心场景缺失。

---

## 被测函数

- `truncateToWidth(text, maxWidth)` — 尾部截断加 `…`
- `truncateStartToWidth(text, maxWidth)` — 头部截断加 `…`
- `truncateToWidthNoEllipsis(text, maxWidth)` — 尾部截断无省略号
- `truncatePathMiddle(path, maxLength)` — 路径中间截断
- `wrapText(text, maxWidth)` — 按宽度换行

---

## 新增用例

### CJK 全角字符

| 用例 | 函数 | 输入 | maxWidth | 期望行为 |
|------|------|------|----------|----------|
| 纯中文截断 | `truncateToWidth` | `"你好世界"` | 4 | `"你好…"` (每个中文字占 2 宽度) |
| 中英混合 | `truncateToWidth` | `"hello你好"` | 8 | `"hello你…"` |
| 全角不截断 | `truncateToWidth` | `"你好"` | 4 | `"你好"` (恰好 4) |
| emoji 单字符 | `truncateToWidth` | `"👋"` | 2 | `"👋"` (emoji 通常 2 宽度) |
| emoji 截断 | `truncateToWidth` | `"hello 👋 world"` | 8 | 确认宽度计算正确 |
| 头部中文 | `truncateStartToWidth` | `"你好世界"` | 4 | `"…界"` |
| 无省略中文 | `truncateToWidthNoEllipsis` | `"你好世界"` | 4 | `"你好"` |

> **注意**：`stringWidth` 对 CJK/emoji 的宽度计算取决于具体实现。先在 REPL 中运行确认实际宽度再写断言：
> ```typescript
> import { stringWidth } from "src/utils/truncate.ts";
> console.log(stringWidth("你好")); // 确认是 4 还是 2
> console.log(stringWidth("👋"));  // 确认 emoji 宽度
> ```

### 路径中间截断补充

| 用例 | 输入 | maxLength | 期望 |
|------|------|-----------|------|
| 文件名超长 | `"/very/long/path/to/MyComponent.tsx"` | 10 | 含 `…` 且以 `.tsx` 结尾 |
| 无斜杠短串 | `"abc"` | 1 | 确认行为不抛错 |
| maxLength 极小 | `"/a/b"` | 1 | 确认不抛错 |
| maxLength=4 | `"/a/b/c.ts"` | 4 | 确认行为 |

### wrapText 补充

| 用例 | 输入 | maxWidth | 期望 |
|------|------|----------|------|
| 含换行符 | `"hello\nworld"` | 10 | 保留原有换行 |
| 宽度=0 | `"hello"` | 0 | 空串或原串（确认不抛错） |

---

## 实施步骤

1. 在 REPL 中确认 `stringWidth` 对 CJK/emoji 的实际返回值
2. 按实际值编写精确断言
3. 如果 `stringWidth` 依赖 ICU 或平台特性，添加平台检查（`process.platform !== "win32"` 跳过条件）
4. 运行测试

---

## 验收标准

- [ ] 至少 5 个 CJK/emoji 相关测试通过
- [ ] 断言基于实际 `stringWidth` 返回值，非猜测
- [ ] `bun test` 全部通过
