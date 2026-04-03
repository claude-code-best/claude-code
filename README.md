# Claude Code Best V5 (CCB)

[![GitHub Stars](https://img.shields.io/github/stars/claude-code-best/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/claude-code-best/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/claude-code-best/claude-code?style=flat-square&color=green)](https://github.com/claude-code-best/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/claude-code-best/claude-code?style=flat-square&color=orange)](https://github.com/claude-code-best/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/claude-code-best/claude-code?style=flat-square)](https://github.com/claude-code-best/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/claude-code-best/claude-code?style=flat-square&color=blue)](https://github.com/claude-code-best/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)

> Which Claude do you like? The open source one is the best.

牢 A (Anthropic) 官方 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 工具的源码反编译/逆向还原项目。目标是将 Claude Code 大部分功能及工程化能力复现 (问就是老佛爷已经付过钱了)。虽然很难绷, 但是它叫做 CCB(踩踩背)...

[文档在这里, 支持投稿 PR](https://ccb.agent-aura.top/)

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
- [ ] V6 大规模重构石山代码, 全面模块分包
  - [ ] V6 将会为全新分支, 届时 main 分支将会封存为历史版本

> 我不知道这个项目还会存在多久, Star + Fork + git clone + .zip 包最稳健; 说白了就是扛旗项目, 看看能走多远
>
> This project updates very fast, with Opus continuously optimizing in the background — new changes every few hours.
>
> Already spent over $1000 on Claude, ran out of money, switching to GLM to continue. @zai-org GLM 5.1 is really solid!
>

## 快速开始

### Requirements

Make sure you have the latest version of Bun — otherwise you'll get all sorts of weird bugs! Run `bun upgrade`!

- [Bun](https://bun.sh/) >= 1.3.11
- Standard Claude Code configuration — each provider has its own setup method

### Installation

```bash
bun install
```

### Running

```bash
# Dev mode — if you see version 888, you're good
bun run dev

# Build
bun run build
```

The build uses code splitting with multi-file bundling (`build.ts`), outputting to the `dist/` directory (entry point `dist/cli.js` + ~450 chunk files).

The built version can be started with both Bun and Node. You can publish to a private registry and run it directly.

If you encounter a bug, please open an issue directly — we prioritize fixing them.

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

TUI (REPL) mode requires a real terminal and cannot be launched directly via VS Code launch config. Use **attach mode** instead:

### Steps

1. **Start the inspect server in terminal**:
   ```bash
   bun run dev:inspect
   ```
   This will output an address like `ws://localhost:8888/xxxxxxxx`.

2. **Attach the VS Code debugger**:
   - Set breakpoints in `src/` files
   - F5 → Select **"Attach to Bun (TUI debug)"**


## Related Documentation and Sites

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

## License

This project is for learning and research purposes only. All rights to Claude Code belong to [Anthropic](https://www.anthropic.com/).
