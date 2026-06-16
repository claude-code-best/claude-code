# 内存占用 1G 调研报告

> 诊断 session `a3593062` RSS 达 1.09 GB，定位 Bun 运行时内存膨胀根因

## 数据收集

- **诊断数据**: RSS 1,118 MB，V8 heap 84 MB，原生内存缺口 1,034 MB（92%）
- **构建方式**: `bun run build:vite` → Vite/Rollup 单文件构建，产物 17MB `dist/cli.js`
- **Vite 配置**: `codeSplitting: false`（`vite.config.ts:97`），所有代码内联为单文件
- **Node.js 对比**: 相同 17MB 产物，Node.js RSS 仅 223 MB（`--version`）/ 340 MB（完整加载）

## 探索与验证

### 已确认

| 问题 | 位置 | 说明 |
|------|------|------|
| **根因: Vite 单文件构建 + Bun 解析大文件内存效率低** | `vite.config.ts:97` | `codeSplitting: false` 产出 17MB 单文件，Bun/JSC 解析时 RSS 暴涨至 966MB |
| Node.js 对同等 17MB 文件仅需 223MB | 实测 | V8 对大文件解析的内存效率远优于 JSC |
| Bun.build 代码分割可解决问题 | 实测 | `bun run build`（代码分割 → 627 chunk）Bun RSS 仅 30MB（`--version`）/ 318MB（完整加载） |

### 已否认

- 不是 feature flags 数量问题 — 全部 35 features 开启时，代码分割构建内存正常
- 不是内存泄漏 — `detachedContexts: 0`，`activeHandles: 0`
- 不是原生 addon 问题 — vendor 文件仅 2.7MB
- 不是 TypeScript 源码体量问题 — `bun run dev`（直接加载 TS）完整路径仅 345MB

## 结论

**根因是 Vite 构建配置 `codeSplitting: false`，产出 17MB 单文件，Bun/JSC 解析单文件大 JS 时内存效率极差（966MB vs Node 的 223MB）。**

实测对比矩阵：

| 构建方式 | 产物结构 | Bun RSS | Node RSS | Bun/Node |
|----------|----------|---------|----------|----------|
| `build:vite` | 17MB 单文件 | **966 MB** | 223 MB | 4.3x |
| `build:vite` pipe mode | 同上 | **1,088 MB** | 340 MB | 3.2x |
| `build` (Bun) | 627 chunk | 30 MB | 42 MB | 0.7x |
| `build` (Bun) pipe mode | 同上 | 318 MB | 253 MB | 1.3x |
| `bun run dev` TS 源码 | 动态加载 | 42 MB | — | — |
| `bun run dev` pipe mode | 动态加载 | 345 MB | — | — |

核心差异：
- **Node/V8** 解析 17MB 文件只需 223MB — V8 的懒解析（lazy parsing）只编译入口需要的部分
- **Bun/JSC** 解析 17MB 文件需要 966MB — JSC 对单文件做全量编译，bytecode + JIT 占用大量原生内存
- 代码分割后（627 个小 chunk），Bun 按需加载，内存回到正常水平

## 建议

1. **开启 Vite 代码分割** — 在 `vite.config.ts` 中启用 `codeSplitting: true` 或使用 Rollup 的 `manualChunks` 配置。这是最直接的修复
2. **或切换到 Bun.build** — `bun run build` 已默认启用代码分割（`splitting: true`），Bun RSS 仅 30-318MB
3. **如果必须单文件** — 考虑用 Node.js 运行 Vite 产物（`node dist/cli-node.js`），代价是失去 Bun 特有 API
4. **验证 `codeSplitting: false` 的存在理由** — 注释说"all dynamic imports inlined"，可能是为了简化部署。评估是否真的需要单文件
