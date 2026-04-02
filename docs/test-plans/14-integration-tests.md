# Plan 14 — 集成测试搭建

> 优先级：中 | 新建 ~3 个测试文件 | 预估 ~30 个测试用例

当前 `tests/integration/` 目录为空，spec 设计的三个集成测试均未创建。本计划搭建 mock 基础设施并实现核心集成测试。

---

## 14.1 搭建 `tests/mocks/` 基础设施

### 文件结构

```
tests/
├── mocks/
│   ├── api-responses.ts       # Claude API mock 响应
│   ├── file-system.ts         # 临时文件系统工具
│   └── fixtures/
│       ├── sample-claudemd.md # CLAUDE.md 样本
│       └── sample-messages.json # 消息样本
├── integration/
│   ├── tool-chain.test.ts
│   ├── context-build.test.ts
│   └── message-pipeline.test.ts
└── helpers/
    └── setup.ts               # 共享 beforeAll/afterAll
```

### `tests/mocks/file-system.ts`

```typescript
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempDir(prefix = "claude-test-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return dir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeTempFile(dir: string, name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content, "utf-8");
  return path;
}
```

### `tests/mocks/fixtures/sample-claudemd.md`

```markdown
# Project Instructions

This is a sample CLAUDE.md file for testing.
```

### `tests/mocks/api-responses.ts`

```typescript
export const mockStreamResponse = {
  type: "message_start" as const,
  message: {
    id: "msg_mock_001",
    type: "message" as const,
    role: "assistant",
    content: [],
    model: "claude-sonnet-4-20250514",
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 0 },
  },
};

export const mockTextBlock = {
  type: "content_block_start" as const,
  index: 0,
  content_block: { type: "text" as const, text: "Mock response" },
};

export const mockToolUseBlock = {
  type: "content_block_start" as const,
  index: 1,
  content_block: {
    type: "tool_use" as const,
    id: "toolu_mock_001",
    name: "Read",
    input: { file_path: "/tmp/test.txt" },
  },
};

export const mockEndEvent = {
  type: "message_stop" as const,
};
```

---

## 14.2 `tests/integration/tool-chain.test.ts`

**目标**：验证 Tool 注册 → 发现 → 权限检查链路。

### 前置条件

`src/tools.ts` 的 `getAllBaseTools` / `getTools` 导入链过重。策略：
- 尝试直接 import 并 mock 最重依赖
- 若不可行，改为测试 `src/Tool.ts` 的 `findToolByName` + 手动构造 tool 列表

### 用例

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `findToolByName("Bash")` 在已注册列表中查找 | 返回正确的 tool 定义 |
| 2 | `findToolByName("NonExistent")` | 返回 `undefined` |
| 3 | `findToolByName` 大小写不敏感 | `"bash"` 也能找到 |
| 4 | `filterToolsByDenyRules` 拒绝特定工具 | 被拒绝工具不在结果中 |
| 5 | `parseToolPreset("default")` 返回已知列表 | 包含核心 tools |
| 6 | `buildTool` 构建的 tool 可被 `findToolByName` 发现 | 端到端验证 |

> 如果 `getAllBaseTools` 确实不可导入，改用 mock tool list 替代。

---

## 14.3 `tests/integration/context-build.test.ts`

**目标**：验证系统提示组装流程（CLAUDE.md 加载 + git status + 日期注入）。

### 前置条件

`src/context.ts` 依赖链极重。策略：
- Mock `src/bootstrap/state.ts`（提供 cwd、projectRoot）
- Mock `src/utils/git.ts`（提供 git status）
- 使用真实 `src/utils/claudemd.ts` + 临时文件

### 用例

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 基本 context 构建 | 返回值包含系统提示字符串 |
| 2 | CLAUDE.md 内容出现在 context 中 | `stripHtmlComments` 后的内容被包含 |
| 3 | 多层目录 CLAUDE.md 合并 | 父目录 + 子目录 CLAUDE.md 都被加载 |
| 4 | 无 CLAUDE.md 时不报错 | context 正常返回，无 crash |
| 5 | git status 为 null | context 正常构建（测试环境中 git 不可用时） |

> **风险评估**：如果 mock `context.ts` 的依赖链成本过高，退化为测试 `buildEffectiveSystemPrompt`（已在 systemPrompt.test.ts 中完成），记录为已知限制。

---

## 14.4 `tests/integration/message-pipeline.test.ts`

**目标**：验证用户输入 → 消息格式化 → API 请求构建。

### 前置条件

`src/services/api/claude.ts` 构建最终 API 请求。策略：
- Mock Anthropic SDK 的 streaming endpoint
- 验证请求参数结构

### 用例

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 文本消息格式化 | `createUserMessage` 生成正确 role+content |
| 2 | tool_result 消息格式化 | 包含 tool_use_id 和 content |
| 3 | 多轮消息序列化 | messages 数组保持顺序 |
| 4 | 系统提示注入到请求 | API 请求的 system 字段非空 |
| 5 | 消息 normalize 后格式一致 | `normalizeMessages` 输出结构正确 |

> **现实评估**：消息格式化的大部分已在 `messages.test.ts` 覆盖。API 请求构建需要 mock SDK，复杂度高。如果投入产出比低，仅实现用例 1-3 和 5，用例 4 标记为 stretch goal。

---

## 实施步骤

1. 创建 `tests/mocks/` 目录和基础文件
2. 实现 `tool-chain.test.ts`（最低风险，最高价值）
3. 评估 `context-build.test.ts` 可行性，决定是否实施
4. 实现 `message-pipeline.test.ts`（可降级为单元测试）
5. 更新 `testing-spec.md` 状态

---

## 验收标准

- [ ] `tests/mocks/` 基础设施可用
- [ ] 至少 `tool-chain.test.ts` 实现并通过
- [ ] 集成测试独立于单元测试运行：`bun test tests/integration/`
- [ ] 所有集成测试使用 `createTempDir` + `cleanupTempDir`，不留文件系统残留
- [ ] `bun test` 全部通过
