# Claude Code Best V5 (CCB)

[![GitHub Stars](https://img.shields.io/github/stars/claude-code-best/claude-code?style=flat-square&logo=github&color=yellow)](https://github.com/claude-code-best/claude-code/stargazers)
[![GitHub Contributors](https://img.shields.io/github/contributors/claude-code-best/claude-code?style=flat-square&color=green)](https://github.com/claude-code-best/claude-code/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/claude-code-best/claude-code?style=flat-square&color=orange)](https://github.com/claude-code-best/claude-code/issues)
[![GitHub License](https://img.shields.io/github/license/claude-code-best/claude-code?style=flat-square)](https://github.com/claude-code-best/claude-code/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/claude-code-best/claude-code?style=flat-square&color=blue)](https://github.com/claude-code-best/claude-code/commits/main)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=flat-square&logo=bun)](https://bun.sh/)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord)](https://discord.gg/uApuzJWGKX)

> Which Claude do you like? The open source one is the best.

A source code decompilation/reverse engineering project of the official [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI tool from Anthropic (aka "Old A"). The goal is to reproduce most of the features and engineering capabilities of Claude Code (the user says "Old Lafayette has already paid for it"). Although it's a bit awkward, it's called CCB (Cai Cai Bei / Step on the Back)... Moreover, we have implemented features that are usually limited to the Enterprise edition or require logging into a Claude account, achieving technology democratization.

> We will be performing lint standardization across the entire repository during the Labor Day holiday (May 1st). PRs submitted during this period may have many conflicts, so please try to submit large features before then.

[Documentation here, PR submissions welcome](https://ccb.agent-aura.top/) | [Friends list documentation here](./Friends.md) | [Discord Group](https://discord.gg/uApuzJWGKX)

| Feature                               | Description                                                                                                                                                                                                            | Documentation                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claude Group Control**              | Pipe IPC multi-instance collaboration: Automatic orchestration of local main/sub instances + zero-config LAN discovery and communication, `/pipes` selection panel + `Shift+↓` interaction + message broadcast routing | [Pipe IPC](https://ccb.agent-aura.top/docs/features/uds-inbox) / [LAN](https://ccb.agent-aura.top/docs/features/lan-pipes)                             |
| **First-class ACP Protocol Support**  | Supports integration with IDEs like Zed and Cursor, session recovery, Skills, and permission bridging                                                                                                                  | [Documentation](https://ccb.agent-aura.top/docs/features/acp-zed)                                                                                      |
| **Remote Control Private Deployment** | Docker self-hosted remote interface, allowing you to use CC on your phone                                                                                                                                              | [Documentation](https://ccb.agent-aura.top/docs/features/remote-control-self-hosting)                                                                  |
| **Langfuse Monitoring**               | Enterprise-grade Agent monitoring, clearly see every agent loop detail, and convert to datasets with one click                                                                                                         | [Documentation](https://ccb.agent-aura.top/docs/features/langfuse-monitoring)                                                                          |
| **Web Search**                        | Built-in web search tool, supports Bing and Brave search                                                                                                                                                               | [Documentation](https://ccb.agent-aura.top/docs/features/web-browser-tool)                                                                             |
| **Poor Mode**                         | For the budget-conscious: disables memory extraction and typing suggestions, significantly reducing concurrent requests                                                                                                | Toggle with `/poor`                                                                                                                                    |
| **Channels Notifications**            | MCP server pushes external messages to sessions (Feishu/Slack/Discord/WeChat, etc.), enabled with `--channels plugin:name@marketplace`                                                                                 | [Documentation](https://ccb.agent-aura.top/docs/features/channels)                                                                                     |
| **Custom Model Providers**            | Compatible with OpenAI/Anthropic/Gemini/Grok (`/login`)                                                                                                                                                                | [Documentation](https://ccb.agent-aura.top/docs/features/all-features-guide)                                                                           |
| Voice Mode                            | Voice input, supports Doubao voice input (`/voice doubao`)                                                                                                                                                             | [Documentation](https://ccb.agent-aura.top/docs/features/voice-mode)                                                                                   |
| Computer Use                          | Screenshots, keyboard and mouse control                                                                                                                                                                                | [Documentation](https://ccb.agent-aura.top/docs/features/computer-use)                                                                                 |
| Chrome Use                            | Browser automation, form filling, data scraping                                                                                                                                                                        | [Self-hosted](https://ccb.agent-aura.top/docs/features/chrome-use-mcp) [Native version](https://ccb.agent-aura.top/docs/features/claude-in-chrome-mcp) |
| Sentry                                | Enterprise-grade error tracking                                                                                                                                                                                        | [Documentation](https://ccb.agent-aura.top/docs/internals/sentry-setup)                                                                                |
| GrowthBook                            | Enterprise-grade feature flags                                                                                                                                                                                         | [Documentation](https://ccb.agent-aura.top/docs/internals/growthbook-adapter)                                                                          |
| /dream Memory Consolidation           | Automatically organize and optimize memory files                                                                                                                                                                       | [Documentation](https://ccb.agent-aura.top/docs/features/auto-dream)                                                                                   |

- 🚀 [Quick Start (Source Code Version)](#-quick-start-source-code-version)
- 🐛 [Debugging the Project](#vs-code-debugging)
- 📖 [Learn the Project](#teach-me-learning-project)

## ⚡ Quick Start (Installation Version)

No need to clone the repository. After downloading from NPM, use it directly.

```sh
npm i -g claude-code-best

# Bun installation has many issues, npm is recommended
# bun  i -g claude-code-best
# bun pm -g trust claude-code-best @claude-code-best/mcp-chrome-bridge

ccb # Open Claude Code with Node.js
ccb-bun # Open with Bun
ccb update # Update to the latest version
CLAUDE_BRIDGE_BASE_URL=https://remote-control.claude-code-best.win/ CLAUDE_BRIDGE_OAUTH_TOKEN=test-my-key ccb --remote-control # We have self-deployed remote control
```

> **Installation/Update Failed?** Run `npm rm -g claude-code-best` to clean up old versions first, then `npm i -g claude-code-best@latest`. If it still fails, specify the version number: `npm i -g claude-code-best@<version_number>`

## ⚡ Quick Start (Source Code Version)

### ⚙️ Prerequisites

You MUST use the latest version of Bun, otherwise you'll encounter many strange bugs!!! `bun upgrade`!!!

- 📦 [Bun](https://bun.sh/) >= 1.3.11

**Installing Bun:**

```bash
# Linux and macOS
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Post-installation steps:**

1.  **Make `bun` command recognized in the current terminal**

    The installation script will write `~/.bun/bin` to your shell configuration file. On macOS with zsh, you will usually see:

    ```text
    Added "~/.bun/bin" to $PATH in "~/.zshrc"
    ```

    You can restart your shell as prompted:

    ```bash
    exec /bin/zsh
    ```

    If using bash, reload the configuration:

    ```bash
    source ~/.bashrc
    ```

    Windows PowerShell users should close and reopen PowerShell.

2.  **Verify Bun is available**

    ```bash
    bun --help
    bun --version
    ```

3.  **If Bun is already installed, update to the latest version**

    ```bash
    bun upgrade
    ```

- ⚙️ Standard CC configuration methods; each provider has its own way.

### 📍 Execution Directory

- Commands to install or check Bun can be run in any directory: `curl -fsSL https://bun.sh/install | bash`, `bun --help`, `bun --version`, `bun upgrade`.
- To install dependencies, start development mode, or build the project, you MUST be in the repository root directory (the one containing `package.json`).

### 📥 Installation

```bash
cd /path/to/claude-code
bun install
```

### ▶️ Running

```bash
# Development mode, version number 888 confirms success
bun run dev

# Build
bun run build
```

The build uses code splitting for multi-file packaging (`build.ts`), outputting to the `dist/` directory (entry point `dist/cli.js` + approximately 450 chunk files).

The built version can be started with both Bun and Node.js. You can start it directly if you publish it to a private source.

If you encounter a bug, please open an issue; we prioritize solving them.

### 👤 New User Configuration /login

After running for the first time, type `/login` in the REPL to enter the login configuration interface.

1. **Anthropic Compatible**: Connect to third-party API services (OpenRouter, AWS Bedrock proxies, etc.) (no official Anthropic account required).
2. **OpenAI / Gemini / Grok**: Connect to cloud services using their respective protocols.
   - **Gemini (Google Auth)**: Supports interactive browser login.
     1. In the Google Cloud Console, navigate to **APIs & Services > OAuth consent screen** and configure the OAuth client (Set User Type to External).
     2. Download the credentials JSON format and save it as `.files/OAuth.json` in the project root. 3. Leave the API Key field blank and press Enter in the `/login` configuration interface; the CLI will automatically open your browser for Google OAuth 2.0 authorization and fetch available models.
3. **Local LLM**: **(Recommended)** Use models running locally.
   - Supports **Ollama**, **LM Studio**, **Jan.ai**, **LocalAI**.
   - **Ollama Deep Integration**: View installed models directly in the CLI, or enter a model name (e.g., `llama3.1`) to pull it instantly. Supports interactive model selection navigation and hardware status auto-detection.
   - Automatically detects local runner status and default ports.

> ℹ️ Supports all Anthropic API compatible services (e.g., OpenRouter, AWS Bedrock proxies, etc.), as long as the interface is compatible with the Messages API.

## Environment Variables

In addition to interactive `/login` configuration, you can also configure the CLI via environment variables:

- `LOCAL_BASE_URL`: The base URL for the local LLM runner (e.g., `http://localhost:11434`).
- `LOCAL_MODEL`: The model name for the local LLM (e.g., `llama3.1`). Overrides the default model when using the `local` provider.

## Feature Flags

All feature toggles are enabled via `FEATURE_<FLAG_NAME>=1` environment variables, for example:

```bash
FEATURE_BUDDY=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

Detailed descriptions of each feature can be found in the [`docs/features/`](docs/features/) directory. Contributions are welcome.

## VS Code Debugging

TUI (REPL) mode requires a real terminal and cannot be debugged directly via a VS Code launch configuration. Use **attach mode**:

### Steps

1.  **Start the inspect service in a terminal**:

    ```bash
    bun run dev:inspect
    ```

    It will output an address like `ws://localhost:8888/xxxxxxxx`.

2.  **Attach the VS Code debugger**:
    - Set breakpoints in `src/` files.
    - Press F5 → Select **"Attach to Bun (TUI debug)"**.

## Teach Me Learning Project

We've added a new `teach-me` skill, which uses a Q&A-style guide to help you understand any module of this project. (Adapted from [sigma skill](https://github.com/sanyuan0704/sanyuan-skills)).

```bash
# Enter directly in the REPL
/teach-me Claude Code Architecture
/teach-me React Ink Terminal Rendering --level beginner
/teach-me Tool System --resume
```

### What it can do

- **Level Diagnosis** — Automatically assesses your mastery of related concepts, skipping what you know and focusing on weaknesses.
- **Build Learning Paths** — Breaks down topics into 5-15 atomic concepts, progressing step-by-step based on dependencies.
- **Socratic Questioning** — Guides your thinking with options rather than giving direct answers.
- **Misconception Tracking** — Discovers and corrects deep-seated misunderstandings.
- **Resume Learning** — `--resume` continues from where you last left off.

### Learning Records

Learning progress is saved in the `.claude/skills/teach-me/` directory, supporting cross-topic learner profiles.

## Related Documents and Websites

- **Online Documentation (Mintlify)**: [ccb.agent-aura.top](https://ccb.agent-aura.top/) — Documentation source code is in the [`docs/`](docs/) directory; PRs are welcome.
- **DeepWiki**: [https://deepwiki.com/claude-code-best/claude-code](https://deepwiki.com/claude-code-best/claude-code)

## Contributors

<a href="https://github.com/claude-code-best/claude-code/graphs/contributors">
  <img src="contributors.svg" alt="Contributors" />
</a>

## Star History

<a href="https://www.star-history.com/?repos=claude-code-best%2Fclaude-code&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=claude-code-best/claude-code&type=date&legend=top-left" />
 </picture>
</a>

## Acknowledgments

- [doubaoime-asr](https://github.com/starccy/doubaoime-asr) — Doubao ASR voice recognition SDK, providing a voice input solution for Voice Mode without requiring Anthropic OAuth.

## License

This project is for educational and research purposes only. All rights to Claude Code belong to [Anthropic](https://www.anthropic.com/).
