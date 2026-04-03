# Claude Code Best V5 (CCB)

[![GitHub Stars](https://img.shields.io/github/stars/claude-code-best/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/claude-code-best/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/claude-code-best/claude-code?style=flat-square&color=green)](https://github.com/claude-code-best/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/claude-code-best/claude-code?style=flat-square&color=orange)](https://github.com/claude-code-best/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/claude-code-best/claude-code?style=flat-square)](https://github.com/claude-code-best/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/claude-code-best/claude-code?style=flat-square&color=blue)](https://github.com/claude-code-best/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord)](https://discord.gg/qZU6zS7Q)

> Which Claude do you like? The open source one is the best.

牢 A (Anthropic) 官方 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 工具的源码反编译/逆向还原项目。目标是将 Claude Code 大部分功能及工程化能力复现 (问就是老佛爷已经付过钱了)。虽然很难绷, 但是它叫做 CCB(踩踩背)...

[文档在这里, 支持投稿 PR](https://ccb.agent-aura.top/)

[Discord 群组](https://discord.gg/qZU6zS7Q)

赞助商占位符

- [x] v1 会完成跑通及基本的类型检查通过;
- [x] V2 会完整实现工程化配套设施;
  - [ ] Biome 格式化可能不会先实施, 避免代码冲突
  - [x] 构建流水线完成, 产物 Node/Bun 都可以运行
- [x] V3 会写大量文档, 完善文档站点
- [x] V4 会完成大量的测试文件, 以提高稳定性
  - [x] Buddy 小宠物回来啦 [文档](https://ccb.agent-aura.top/docs/features/buddy)
  - [x] Auto Mode 回归 [文档](https://ccb.agent-aura.top/docs/safety/auto-mode)
  - [x] 所有 Feature 现在可以通过环境变量配置, 而不是垃圾的 bun --feature
- [x] V5 支持企业级的监控上报功能, 补全缺失的工具, 解除限制
  - [x] 移除牢 A 的反蒸馏代码!!!
  - [x] 补全 web search 能力(用的 Bing 搜索)!!! [文档](https://ccb.agent-aura.top/docs/features/web-browser-tool)
  - [x] 支持 Debug [文档](https://ccb.agent-aura.top/docs/features/debug-mode)
  - [x] 关闭自动更新;
  - [x] 添加自定义 sentry 错误上报支持 [文档](https://ccb.agent-aura.top/docs/internals/sentry-setup)
  - [x] 添加自定义 GrowthBook 支持 (GB 也是开源的, 现在你可以配置一个自定义的遥控平台) [文档](https://ccb.agent-aura.top/docs/internals/growthbook-adapter)
  - [x] 自定义 login 模式, 大家可以用这个配置 Claude 的模型!
  - [x] 修复搜索工具的 rg 缺失问题(需要重新 bun i)
- [ ] V6 大规模重构石山代码, 全面模块分包
  - [ ] V6 将会为全新分支, 届时 main 分支将会封存为历史版本

> 我不知道这个项目还会存在多久, Star + Fork + git clone + .zip 包最稳健; 说白了就是扛旗项目, 看看能走多远
>
> 这个项目更新很快, 后台有 Opus 持续优化, 几乎几个小时就有新变化;
>
> Claude 已经烧了 1000$ 以上, 没钱了, 换成 GLM 继续玩; @zai-org GLM 5.1 非常可以;
>

## 快速开始

### 环境要求

一定要最新版本的 bun 啊, 不然一堆奇奇怪怪的 BUG!!! bun upgrade!!!

- [Bun](https://bun.sh/) >= 1.3.11
- 常规的配置 CC 的方式, 各大提供商都有自己的配置方式

### 安装

```bash
bun install
```

### 运行

```bash
# 开发模式, 看到版本号 888 说明就是对了
bun run dev

# 构建
bun run build
```

构建采用 code splitting 多文件打包（`build.ts`），产物输出到 `dist/` 目录（入口 `dist/cli.js` + 约 450 个 chunk 文件）。

构建出的版本 bun 和 node 都可以启动, 你 publish 到私有源可以直接启动

如果遇到 bug 请直接提一个 issues, 我们优先解决

### 新人配置 /login

首次运行后，在 REPL 中输入 `/login` 命令进入登录配置界面，选择 **Custom Platform** 即可对接第三方 API 兼容服务（无需 Anthropic 官方账号）。

需要填写的字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | API 服务地址 | `https://api.example.com/v1` |
| API Key | 认证密钥 | `sk-xxx` |
| Haiku Model | 快速模型 ID | `claude-haiku-4-5-20251001` |
| Sonnet Model | 均衡模型 ID | `claude-sonnet-4-6` |
| Opus Model | 高性能模型 ID | `claude-opus-4-6` |

- **Tab / Shift+Tab** 切换字段，**Enter** 确认并跳到下一个，最后一个字段按 Enter 保存
- 模型字段会自动读取当前环境变量预填
- 配置保存到 `~/.claude/settings.json` 的 `env` 字段，保存后立即生效

也可以直接编辑 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com/v1",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5-20251001",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-6"
  }
}
```

> 支持所有 Anthropic API 兼容服务（如 OpenRouter、AWS Bedrock 代理等），只要接口兼容 Messages API 即可。

## Feature Flags

所有功能开关通过 `FEATURE_<FLAG_NAME>=1` 环境变量启用，例如：

```bash
FEATURE_BUDDY=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

各 Feature 的详细说明见 [`docs/features/`](docs/features/) 目录，欢迎投稿补充。

## VS Code 调试

TUI (REPL) 模式需要真实终端，无法直接通过 VS Code launch 启动调试。使用 **attach 模式**：

### 步骤

1. **终端启动 inspect 服务**：
   ```bash
   bun run dev:inspect
   ```
   会输出类似 `ws://localhost:8888/xxxxxxxx` 的地址。

2. **VS Code 附着调试器**：
   - 在 `src/` 文件中打断点
   - F5 → 选择 **"Attach to Bun (TUI debug)"**


## 相关文档及网站

- **在线文档（Mintlify）**: [ccb.agent-aura.top](https://ccb.agent-aura.top/) — 文档源码位于 [`docs/`](docs/) 目录，欢迎投稿 PR
- **DeepWiki**: <https://deepwiki.com/claude-code-best/claude-code>

## Contributors

<a href="https://github.com/claude-code-best/claude-code/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=claude-code-best/claude-code" />
</a>

## Star History

<a href="https://www.star-history.com/?repos=claude-code-best%2Fclaude-code&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&legend=top-left" />
 </picture>
</a>

## 许可证

本项目仅供学习研究用途。Claude Code 的所有权利归 [Anthropic](https://www.anthropic.com/) 所有。
