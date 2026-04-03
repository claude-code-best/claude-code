# Claude Code Best V3 (CCB)

A source code decompilation/reverse-engineering restoration project of Anthropic's official [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI tool. The goal is to reproduce most of Claude Code's functionality and engineering capabilities. It's called CCB (Claude Code Best)...

[Documentation is here, PRs welcome](https://ccb.agent-aura.top/)

Sponsor placeholder

- [x] V1 — Get the project running with basic type checking passing
- [x] V2 — Fully implement engineering infrastructure
  - [ ] Biome formatting may not be implemented first to avoid code conflicts
  - [x] Build pipeline complete, artifacts can run on both Node and Bun
- [x] V3 — Write extensive documentation, improve the docs site
- [ ] V4 — Write a large number of test files to improve stability
  - [x] Buddy pet feature is back!
  - [x] Auto Mode is back
  - [x] All features can now be configured via environment variables instead of the clunky `bun --feature`
  - [x] Removed Anthropic's anti-distillation code!
  - [x] Web search capability added (using Bing search)!
  - [x] Debug support added
- [ ] V5 — Large-scale refactoring of legacy code, full modular packaging
  - [ ] V5 will be on a new branch; the main branch will be archived as a historical version

> I don't know how long this project will survive — Star + Fork + git clone + .zip download is the safest bet. This is essentially a flag-bearing project, let's see how far it goes.
>
> This project updates very fast, with Opus continuously optimizing in the background — new changes every few hours.
>
> Already spent over $1000 on Claude, ran out of money, switching to GLM to continue. @zai-org GLM 5.1 is really solid!
>

Survival log:

1. 36 hours after open-sourcing: 9.7k stars; privilege mode enabled, new feature controls added. Push for 10k tomorrow!
2. 48 hours after open-sourcing: Broke 7k stars; test code showing good progress
3. 24 hours after open-sourcing: Broke 6k stars, thanks for the support. Completed docs site build, reached V3. Next up: test case maintenance, after which we can accept PRs. Looks like Anthropic isn't going to bother us.
4. 15 hours after open-sourcing: Completed Node.js support for build artifacts, now fully featured. Stars approaching 3k. Waiting for Anthropic's email.
5. 12 hours after open-sourcing: April Fools' Day, stars broke 1k, and Anthropic hasn't sent any emails about this project.

## Quick Start

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

## VS Code Debugging

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

> Note: The WebSocket address in `dev:inspect` and `launch.json` changes on each restart — you need to update both.

## Related Documentation and Sites

<https://deepwiki.com/claude-code-best/claude-code>

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
