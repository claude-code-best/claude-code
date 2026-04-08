# VSCode IDE Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前 CLI 增加一个可运行的 VSCode `ws-ide` 扩展端实现，让 `/ide`、选区上下文注入和 IDE diff 预览在本地 VSCode 中可用。

**Architecture:** 在仓库中新增独立的 VSCode 扩展包，扩展在本地启动 WebSocket IDE Bridge，并通过 lockfile 让 CLI 自动发现。扩展在该连接上暴露一个 MCP Server，负责发送 `selection_changed` / `ide_connected` 通知，并实现 `openDiff`、`close_tab`、`closeAllDiffTabs` 这几个 CLI 已使用的 MCP tools。

**Tech Stack:** TypeScript、VSCode Extension API、WebSocket、`@modelcontextprotocol/sdk`、Node.js 文件系统 API

> 说明：执行前已校正协议边界。这里的 `openDiff` / `close_tab` / `closeAllDiffTabs` 不是自定义裸 WebSocket RPC，而是通过 MCP tool 调用完成；`selection_changed` / `ide_connected` 才是扩展主动发往 CLI 的通知。

---

### Task 1: 脚手架 VSCode 扩展包

**Files:**
- Create: `packages/vscode-ide-bridge/package.json`
- Create: `packages/vscode-ide-bridge/tsconfig.json`
- Create: `packages/vscode-ide-bridge/src/extension.ts`
- Modify: `package.json`

- [ ] **Step 1: 写出失败测试或校验入口约束**

使用最小结构校验，确保新包会被 workspace 识别并且扩展入口文件存在。

```ts
import { describe, expect, test } from "bun:test";
import pkg from "../../vscode-ide-bridge/package.json";

describe("vscode-ide-bridge package", () => {
  test("declares a VSCode extension entry", () => {
    expect(pkg.main).toBe("./dist/extension.js");
    expect(pkg.engines.vscode).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun test packages/vscode-ide-bridge/test/package.test.ts`
Expected: FAIL，提示包文件不存在或字段缺失

- [ ] **Step 3: 写最小扩展包结构**

`packages/vscode-ide-bridge/package.json`

```json
{
  "name": "vscode-ide-bridge",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/extension.js",
  "engines": {
    "vscode": "^1.90.0"
  },
  "activationEvents": [
    "onStartupFinished",
    "onCommand:claudeCodeBridge.restart",
    "onCommand:claudeCodeBridge.showStatus"
  ],
  "contributes": {
    "commands": [
      {
        "command": "claudeCodeBridge.restart",
        "title": "Claude Code Bridge: Restart"
      },
      {
        "command": "claudeCodeBridge.showStatus",
        "title": "Claude Code Bridge: Show Status"
      }
    ]
  }
}
```

`packages/vscode-ide-bridge/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vscode"]
  },
  "include": ["src/**/*.ts"]
}
```

`packages/vscode-ide-bridge/src/extension.ts`

```ts
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeCodeBridge.restart", () => {}),
    vscode.commands.registerCommand("claudeCodeBridge.showStatus", () => {})
  );
}

export async function deactivate(): Promise<void> {}
```

根目录 `package.json` workspace 增加：

```json
{
  "workspaces": [
    "packages/*",
    "packages/@ant/*",
    "packages/vscode-ide-bridge"
  ]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test packages/vscode-ide-bridge/test/package.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json packages/vscode-ide-bridge/package.json packages/vscode-ide-bridge/tsconfig.json packages/vscode-ide-bridge/src/extension.ts packages/vscode-ide-bridge/test/package.test.ts
git commit -m "feat: scaffold vscode ide bridge extension"
```

### Task 2: 实现 lockfile 与状态模型

**Files:**
- Create: `packages/vscode-ide-bridge/src/server/lockfile.ts`
- Create: `packages/vscode-ide-bridge/src/server/workspaceInfo.ts`
- Create: `packages/vscode-ide-bridge/src/server/protocol.ts`
- Create: `packages/vscode-ide-bridge/test/lockfile.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { buildLockfilePayload } from "../src/server/lockfile";

describe("buildLockfilePayload", () => {
  test("includes ws transport, auth token and workspace folders", () => {
    const payload = buildLockfilePayload({
      port: 8123,
      pid: 100,
      ideName: "VS Code",
      workspaceFolders: ["D:/repo"],
      authToken: "token-1",
      runningInWindows: true
    });

    expect(payload.transport).toBe("ws");
    expect(payload.authToken).toBe("token-1");
    expect(payload.workspaceFolders).toEqual(["D:/repo"]);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun test packages/vscode-ide-bridge/test/lockfile.test.ts`
Expected: FAIL，提示模块不存在

- [ ] **Step 3: 写最小实现**

`packages/vscode-ide-bridge/src/server/protocol.ts`

```ts
export type LockfilePayload = {
  workspaceFolders: string[];
  pid: number;
  ideName: string;
  transport: "ws";
  runningInWindows: boolean;
  authToken: string;
};
```

`packages/vscode-ide-bridge/src/server/lockfile.ts`

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LockfilePayload } from "./protocol";

export function buildLockfilePayload(input: {
  port: number;
  pid: number;
  ideName: string;
  workspaceFolders: string[];
  authToken: string;
  runningInWindows: boolean;
}): LockfilePayload {
  return {
    workspaceFolders: input.workspaceFolders,
    pid: input.pid,
    ideName: input.ideName,
    transport: "ws",
    runningInWindows: input.runningInWindows,
    authToken: input.authToken
  };
}

export function getLockfilePath(port: number): string {
  return join(homedir(), ".claude", "ide", `${port}.lock`);
}

export async function writeLockfile(port: number, payload: LockfilePayload): Promise<string> {
  const path = getLockfilePath(port);
  await mkdir(join(homedir(), ".claude", "ide"), { recursive: true });
  await writeFile(path, JSON.stringify(payload), "utf8");
  return path;
}

export async function removeLockfile(path: string | null): Promise<void> {
  if (!path) return;
  await rm(path, { force: true });
}
```

`packages/vscode-ide-bridge/src/server/workspaceInfo.ts`

```ts
import * as vscode from "vscode";

export function getWorkspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test packages/vscode-ide-bridge/test/lockfile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vscode-ide-bridge/src/server/protocol.ts packages/vscode-ide-bridge/src/server/lockfile.ts packages/vscode-ide-bridge/src/server/workspaceInfo.ts packages/vscode-ide-bridge/test/lockfile.test.ts
git commit -m "feat: add vscode ide bridge lockfile support"
```

### Task 3: 实现选区发布链路

**Files:**
- Create: `packages/vscode-ide-bridge/src/server/selectionPublisher.ts`
- Create: `packages/vscode-ide-bridge/test/selectionPublisher.test.ts`
- Modify: `packages/vscode-ide-bridge/src/extension.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { buildSelectionChangedParams } from "../src/server/selectionPublisher";

describe("buildSelectionChangedParams", () => {
  test("serializes editor selection and text", () => {
    const params = buildSelectionChangedParams({
      filePath: "D:/repo/src/app.ts",
      text: "const x = 1;",
      start: { line: 1, character: 0 },
      end: { line: 1, character: 12 }
    });

    expect(params.filePath).toBe("D:/repo/src/app.ts");
    expect(params.text).toBe("const x = 1;");
    expect(params.selection?.start.line).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun test packages/vscode-ide-bridge/test/selectionPublisher.test.ts`
Expected: FAIL，提示导出不存在

- [ ] **Step 3: 写最小实现**

`packages/vscode-ide-bridge/src/server/selectionPublisher.ts`

```ts
export type SelectionPoint = {
  line: number;
  character: number;
};

export type SelectionChangedParams = {
  selection: {
    start: SelectionPoint;
    end: SelectionPoint;
  } | null;
  text?: string;
  filePath?: string;
};

export function buildSelectionChangedParams(input: {
  filePath?: string;
  text?: string;
  start?: SelectionPoint;
  end?: SelectionPoint;
}): SelectionChangedParams {
  if (!input.start || !input.end) {
    return {
      selection: null,
      text: input.text,
      filePath: input.filePath
    };
  }

  return {
    selection: {
      start: input.start,
      end: input.end
    },
    text: input.text,
    filePath: input.filePath
  };
}
```

`packages/vscode-ide-bridge/src/extension.ts` 先增加一个占位发布调用：

```ts
import * as vscode from "vscode";
import { buildSelectionChangedParams } from "./server/selectionPublisher";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const disposable = vscode.window.onDidChangeTextEditorSelection(event => {
    const editor = event.textEditor;
    const selection = editor.selection;
    buildSelectionChangedParams({
      filePath: editor.document.uri.fsPath,
      text: editor.document.getText(selection),
      start: {
        line: selection.start.line,
        character: selection.start.character
      },
      end: {
        line: selection.end.line,
        character: selection.end.character
      }
    });
  });

  context.subscriptions.push(
    disposable,
    vscode.commands.registerCommand("claudeCodeBridge.restart", () => {}),
    vscode.commands.registerCommand("claudeCodeBridge.showStatus", () => {})
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test packages/vscode-ide-bridge/test/selectionPublisher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vscode-ide-bridge/src/server/selectionPublisher.ts packages/vscode-ide-bridge/test/selectionPublisher.test.ts packages/vscode-ide-bridge/src/extension.ts
git commit -m "feat: add vscode selection publisher primitives"
```

### Task 4: 实现 WebSocket bridge server 与鉴权

**Files:**
- Create: `packages/vscode-ide-bridge/src/server/bridgeServer.ts`
- Create: `packages/vscode-ide-bridge/test/bridgeServer.test.ts`
- Modify: `packages/vscode-ide-bridge/src/extension.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { isAuthorizedUpgrade } from "../src/server/bridgeServer";

describe("isAuthorizedUpgrade", () => {
  test("accepts matching token", () => {
    expect(isAuthorizedUpgrade("abc", "abc")).toBe(true);
  });

  test("rejects mismatched token", () => {
    expect(isAuthorizedUpgrade("abc", "def")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun test packages/vscode-ide-bridge/test/bridgeServer.test.ts`
Expected: FAIL，提示模块不存在

- [ ] **Step 3: 写最小实现**

`packages/vscode-ide-bridge/src/server/bridgeServer.ts`

```ts
import { WebSocketServer } from "ws";

export function isAuthorizedUpgrade(expected: string, actual: string | undefined): boolean {
  return Boolean(actual) && expected === actual;
}

export class BridgeServer {
  private server: WebSocketServer | null = null;

  constructor(private readonly authToken: string) {}

  async start(port: number): Promise<void> {
    this.server = new WebSocketServer({
      host: "127.0.0.1",
      port
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>(resolve => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server = null;
    });
  }
}
```

`packages/vscode-ide-bridge/src/extension.ts` 中接入：

```ts
import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { BridgeServer } from "./server/bridgeServer";

let bridgeServer: BridgeServer | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  bridgeServer = new BridgeServer(randomUUID());
  await bridgeServer.start(0);
  context.subscriptions.push({
    dispose() {
      void bridgeServer?.stop();
    }
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test packages/vscode-ide-bridge/test/bridgeServer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vscode-ide-bridge/src/server/bridgeServer.ts packages/vscode-ide-bridge/test/bridgeServer.test.ts packages/vscode-ide-bridge/src/extension.ts
git commit -m "feat: add vscode ide bridge websocket server"
```

### Task 5: 实现 diff RPC 和状态命令

**Files:**
- Create: `packages/vscode-ide-bridge/src/server/diffController.ts`
- Modify: `packages/vscode-ide-bridge/src/extension.ts`
- Create: `packages/vscode-ide-bridge/test/diffController.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { DiffSessionStore } from "../src/server/diffController";

describe("DiffSessionStore", () => {
  test("stores and removes tab mappings by tab name", () => {
    const store = new DiffSessionStore();
    store.set("tab-1", "memfs:/right.ts");
    expect(store.get("tab-1")).toBe("memfs:/right.ts");
    store.delete("tab-1");
    expect(store.get("tab-1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun test packages/vscode-ide-bridge/test/diffController.test.ts`
Expected: FAIL，提示模块不存在

- [ ] **Step 3: 写最小实现**

`packages/vscode-ide-bridge/src/server/diffController.ts`

```ts
export class DiffSessionStore {
  private readonly sessions = new Map<string, string>();

  set(tabName: string, uri: string): void {
    this.sessions.set(tabName, uri);
  }

  get(tabName: string): string | undefined {
    return this.sessions.get(tabName);
  }

  delete(tabName: string): void {
    this.sessions.delete(tabName);
  }

  clear(): void {
    this.sessions.clear();
  }
}
```

`packages/vscode-ide-bridge/src/extension.ts` 增加状态命令：

```ts
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Claude Code IDE Bridge");

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("claudeCodeBridge.showStatus", async () => {
      output.appendLine("Claude Code IDE Bridge is running.");
      output.show(true);
    })
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test packages/vscode-ide-bridge/test/diffController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vscode-ide-bridge/src/server/diffController.ts packages/vscode-ide-bridge/test/diffController.test.ts packages/vscode-ide-bridge/src/extension.ts
git commit -m "feat: add vscode ide bridge diff state and status command"
```

### Task 6: 接通完整激活流程与手工验证说明

**Files:**
- Modify: `packages/vscode-ide-bridge/src/extension.ts`
- Modify: `README.md`
- Modify: `README_EN.md`

- [ ] **Step 1: 写失败校验**

用文档断言确保 README 中包含 bridge 启动与 `/ide` 使用说明。

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("README bridge docs", () => {
  test("documents vscode ide bridge usage", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme.includes("VSCode IDE Bridge")).toBe(true);
    expect(readme.includes("/ide")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `bun test packages/vscode-ide-bridge/test/readme.test.ts`
Expected: FAIL，提示 README 中没有 bridge 文档

- [ ] **Step 3: 实现激活主流程与文档**

`packages/vscode-ide-bridge/src/extension.ts` 最终需要做到：

```ts
import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { writeLockfile, removeLockfile, buildLockfilePayload } from "./server/lockfile";
import { getWorkspaceFolders } from "./server/workspaceInfo";
import { BridgeServer } from "./server/bridgeServer";

let lockfilePath: string | null = null;
let bridgeServer: BridgeServer | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const authToken = randomUUID();
  const output = vscode.window.createOutputChannel("Claude Code IDE Bridge");

  bridgeServer = new BridgeServer(authToken);
  await bridgeServer.start(0);

  const payload = buildLockfilePayload({
    port: 0,
    pid: process.pid,
    ideName: "VS Code",
    workspaceFolders: getWorkspaceFolders(),
    authToken,
    runningInWindows: process.platform === "win32"
  });

  lockfilePath = await writeLockfile(0, payload);
  output.appendLine(`Bridge started. Lockfile: ${lockfilePath}`);

  context.subscriptions.push(output, {
    dispose() {
      void bridgeServer?.stop();
      void removeLockfile(lockfilePath);
    }
  });
}

export async function deactivate(): Promise<void> {
  await bridgeServer?.stop();
  await removeLockfile(lockfilePath);
}
```

README 中文和英文各补一个简短章节，说明：

- 扩展启动后会暴露本地 bridge
- 启动 CLI 后执行 `/ide`
- 在 VSCode 里选中代码，再向 CLI 提问
- diff 预览由 CLI 主动触发

- [ ] **Step 4: 运行验证**

Run: `bun test packages/vscode-ide-bridge/test/readme.test.ts`
Expected: PASS

Run: `bun test packages/vscode-ide-bridge/test/*.test.ts`
Expected: PASS

手工验证：

Run: `bun run build.ts`
Expected: 构建完成，无本次改动引入的额外错误

手工步骤：

1. 在 VSCode 启动扩展开发宿主
2. 打开本仓库
3. 启动 CLI
4. 执行 `/ide`
5. 在编辑器中选中文本后提问
6. 验证 CLI 可见 IDE 选区上下文

- [ ] **Step 5: Commit**

```bash
git add packages/vscode-ide-bridge/src/extension.ts README.md README_EN.md packages/vscode-ide-bridge/test/readme.test.ts
git commit -m "feat: wire vscode ide bridge activation and docs"
```
