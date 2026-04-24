# Claude Code Best V5 (CCB)

[![GitHub Stars](https://img.shields.io/github/stars/claude-code-best/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/claude-code-best/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/claude-code-best/claude-code?style=flat-square&color=green)](https://github.com/claude-code-best/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/claude-code-best/claude-code?style=flat-square&color=orange)](https://github.com/claude-code-best/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/claude-code-best/claude-code?style=flat-square)](https://github.com/claude-code-best/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/claude-code-best/claude-code?style=flat-square&color=blue)](https://github.com/claude-code-best/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)

> Which Claude do you like? The open source one is the best.

A reverse-engineered / decompiled source restoration of Anthropic's official [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI tool. The goal is to reproduce most of Claude Code's functionality and engineering capabilities. It's abbreviated as CCB.

[Documentation (Chinese)](https://ccb.agent-aura.top/) — PR contributions welcome.

Sponsor placeholder.

- [x] v1: Basic runability and type checking pass
- [x] V2: Complete engineering infrastructure
  - [ ] Biome formatting may not be implemented first to avoid code conflicts
  - [x] Build pipeline complete, output runnable on both Node.js and Bun
- [x] V3: Extensive documentation and documentation site improvements
- [x] V4: Large-scale test suite for improved stability
  - [x] Buddy pet feature restored [Docs](https://ccb.agent-aura.top/docs/features/buddy)
  - [x] Auto Mode restored [Docs](https://ccb.agent-aura.top/docs/safety/auto-mode)
  - [x] All features now configurable via environment variables instead of `bun --feature`
- [x] V5: Enterprise-grade monitoring/reporting, missing tools补全, restrictions removed
  - [x] Removed anti-distillation code
  - [x] Web search capability (using Bing) [Docs](https://ccb.agent-aura.top/docs/features/web-browser-tool)
  - [x] Debug mode support [Docs](https://ccb.agent-aura.top/docs/features/debug-mode)
  - [x] Disabled auto-updates
  - [x] Custom Sentry error reporting support [Docs](https://ccb.agent-aura.top/docs/internals/sentry-setup)
  - [x] Custom GrowthBook support (GB is open source — configure your own feature flag platform) [Docs](https://ccb.agent-aura.top/docs/internals/growthbook-adapter)
  - [x] Custom login mode — configure Claude models your way
- [ ] V6: Large-scale refactoring, full modular packaging
  - [ ] V6 will be a new branch; main branch will be archived as a historical version

> I don't know how long this project will survive. Star + Fork + git clone + .zip is the safest bet.
>
> This project updates rapidly — Opus continuously optimizes in the background, with new changes almost every few hours.
>
> Claude has burned over $1000, out of budget, switching to GLM to continue; @zai-org GLM 5.1 is quite capable.

## Quick Start

### Prerequisites

Make sure you're on the latest version of Bun, otherwise you'll run into all sorts of weird bugs. Run `bun upgrade`!

- [Bun](https://bun.sh/) >= 1.3.11

**Install Bun:**

```bash
# Linux and macOS
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Post-installation steps:**

1. **Make `bun` available in the current terminal**

   The installer adds `~/.bun/bin` to the matching shell configuration file. On macOS with the default zsh shell, you may see:

   ```text
   Added "~/.bun/bin" to $PATH in "~/.zshrc"
   ```

   Restart the current shell as the installer suggests:

   ```bash
   exec /bin/zsh
   ```

   If you use bash, reload the bash configuration:

   ```bash
   source ~/.bashrc
   ```

   Windows PowerShell users can close and reopen PowerShell.

2. **Verify that Bun is available:**
   ```bash
   bun --help
   bun --version
   ```

3. **Update to latest version (if already installed):**
   ```bash
   bun upgrade
   ```

- Standard Claude Code configuration — each provider has its own setup method

### Command Execution Location

- Bun installation and checking commands can be run from any directory:
  `curl -fsSL https://bun.sh/install | bash`, `bun --help`, `bun --version`, `bun upgrade`
- Project dependency installation, development mode, and builds must be run from this repository root, the directory containing `package.json`.

### Install

```bash
cd /path/to/claude-code
bun install
```

### Run

```bash
# Dev mode — if you see version 888, it's working
bun run dev

# Build
bun run build
```

The build uses code splitting (`build.ts`), outputting to `dist/` (entry `dist/cli.js` + ~450 chunk files).

The build output runs on both Bun and Node.js — you can publish to a private registry and run directly.

If you encounter a bug, please open an issue — we'll prioritize it.

### First-time Setup /login

After the first run, enter `/login` in the REPL to access the login configuration screen. Select **Anthropic Compatible** to connect to third-party API-compatible services (no Anthropic account required).

Fields to fill in:

| Field | Description | Example |
|-------|-------------|---------|
| Base URL | API service URL | `https://api.example.com/v1` |
| API Key | Authentication key | `sk-xxx` |
| Haiku Model | Fast model ID | `claude-haiku-4-5-20251001` |
| Sonnet Model | Balanced model ID | `claude-sonnet-4-6` |
| Opus Model | High-performance model ID | `claude-opus-4-6` |

- **Tab / Shift+Tab** to switch fields, **Enter** to confirm and move to the next, press Enter on the last field to save
- Model fields auto-fill from current environment variables
- Configuration saves to `~/.claude/settings.json` under the `env` key, effective immediately

You can also edit `~/.claude/settings.json` directly:

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

> Supports all Anthropic API-compatible services (e.g., OpenRouter, AWS Bedrock proxies, etc.) as long as the interface is compatible with the Messages API.

## Feature Flags

All feature toggles are enabled via `FEATURE_<FLAG_NAME>=1` environment variables, for example:

```bash
FEATURE_BUDDY=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

See [`docs/features/`](docs/features/) for detailed descriptions of each feature. Contributions welcome.

## VS Code Debugging

The TUI (REPL) mode requires a real terminal and cannot be launched directly via VS Code's launch config. Use **attach mode**:

### Steps

1. **Start inspect server in terminal**:
   ```bash
   bun run dev:inspect
   ```
   This outputs an address like `ws://localhost:8888/xxxxxxxx`.

2. **Attach debugger from VS Code**:
   - Set breakpoints in `src/` files
   - Press F5 → select **"Attach to Bun (TUI debug)"**

## Documentation & Links

- **Online docs (Mintlify)**: [ccb.agent-aura.top](https://ccb.agent-aura.top/) — source in [`docs/`](docs/), PR contributions welcome
- **DeepWiki**: <https://deepwiki.com/claude-code-best/claude-code>

## Contributors

<a href="https://github.com/claude-code-best/claude-code/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=claude-code-best/claude-code" />
</a>

## Star History

<a href="https://www.star-history.com/?repos=claude-code-best%2Fclaude-code&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=claude-code-best%2Fclaude-code&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=claude-code-best%2Fclaude-code&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=claude-code-best%2Fclaude-code&type=date&legend=top-left" />
 </picture>
</a>

## License

This project is for educational and research purposes only. All rights to Claude Code belong to [Anthropic](https://www.anthropic.com/).
