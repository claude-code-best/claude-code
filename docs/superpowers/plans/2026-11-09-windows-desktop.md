# Windows Desktop Implementation Plan

> **For agentic workers:** Execute the following tasks inline in this session.

**Goal:** Publish a reusable Windows desktop shell and automatic shortcut installer.

**Architecture:** A WinForms/WebView2 shell loads the existing RCS UI. PowerShell restores the SDK, builds the executable, installs per-user files, and starts a loopback backend.

**Tech Stack:** C#, .NET Framework, WebView2, PowerShell, existing Bun backend.

**Spec:** User request: commit and submit automatic shortcut generation and desktop window support to claude-code-best/claude-code.

## Global Constraints

- Preserve workspace trust, sandbox and TLS checks.
- Exclude personal paths, providers, credentials, profiles, logs and binaries.
- Publish a focused branch against upstream main without unrelated fork history.

### Task 1: Portable client and installer

**Files:** `scripts/windows-desktop/{RealAgenticDesktop.cs,RealAgentic.png,build.ps1,start.ps1,install.ps1,.gitignore,README.md}`.

- [x] Move native window source and transparent logo into the source tree.
- [x] Restore pinned SDK into ignored sdk directory and compile into ignored build directory.
- [x] Generate per-user config and desktop shortcut with absolute install destinations.
- [x] Start existing local stack or upstream server/bridge; reuse healthy service.
- [x] Parse PowerShell scripts, compile C#, and run isolated install + WebView2 smoke test.
- [x] Inspect diff and commit only source, asset and documentation.

### Task 2: Upstream submission

- [x] Verify upstream permissions and create a fork when direct writing is unavailable.
- [ ] Push the focused branch and open a PR with validation and known limitations.
- [ ] Preserve preexisting local edits and report commit and PR URL.
