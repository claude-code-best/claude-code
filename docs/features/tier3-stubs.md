# Tier 3 — Pure Stub / N/A Low-Priority Feature Overview

> This document summarizes all Tier 3 features. These are either pure stubs (all functions return empty values),
> Anthropic internal infrastructure (N/A), or low-reference-count auxiliary features.

## Overview

| Feature | References | Status | Category | Brief Description |
|---------|------------|--------|----------|-------------------|
| CHICAGO_MCP | 16 | N/A | Internal Infrastructure | Anthropic internal MCP infrastructure, not externally available |
| UDS_INBOX | 17 | Stub | Messaging | Unix domain socket peer messaging, inter-process message passing |
| MONITOR_TOOL | 13 | Stub | Tool | File/process monitoring tool, detects changes and notifies |
| BG_SESSIONS | 11 | Stub | Session Management | Background session management, supports parallel multi-session |
| SHOT_STATS | 10 | No Implementation | Statistics | Per-prompt statistics collection |
| EXTRACT_MEMORIES | 7 | No Implementation | Memory | Automatically extracts important information from conversations as memories |
| TEMPLATES | 6 | Stub | Project Management | Project/prompt template system |
| LODESTONE | 6 | N/A | Internal Infrastructure | Internal infrastructure module |
| STREAMLINED_OUTPUT | 1 | — | Output | Streamlined output mode, reduces terminal output volume |
| HOOK_PROMPTS | 1 | — | Hooks | Hook prompts, custom hook prompt injection |
| CCR_AUTO_CONNECT | 3 | — | Remote Control | CCR auto-connect, automatically establishes remote control sessions |
| CCR_MIRROR | 4 | — | Remote Control | CCR mirror mode, session state synchronization |
| CCR_REMOTE_SETUP | 1 | — | Remote Control | CCR remote setup, initializes remote control configuration |
| NATIVE_CLIPBOARD_IMAGE | 2 | — | System Integration | Native clipboard image, reads images from clipboard |
| CONNECTOR_TEXT | 7 | — | Connector | Connector text, external system text adaptation |
| COMMIT_ATTRIBUTION | 12 | — | Git | Commit attribution, tags commit origin |
| CACHED_MICROCOMPACT | 12 | — | Compression | Cached micro-compaction, optimizes compaction performance |
| PROMPT_CACHE_BREAK_DETECTION | 9 | — | Performance | Prompt cache break detection, monitors cache misses |
| MEMORY_SHAPE_TELEMETRY | 3 | — | Telemetry | Memory shape telemetry, memory usage pattern tracking |
| MCP_RICH_OUTPUT | 3 | — | MCP | MCP rich output, enhanced MCP tool output formatting |
| FILE_PERSISTENCE | 3 | — | Persistence | File persistence, maintains state across sessions |
| TREE_SITTER_BASH_SHADOW | 5 | Shadow | Security | Bash AST Shadow mode (see tree-sitter-bash.md) |
| QUICK_SEARCH | 5 | — | Search | Quick search, optimized file/content search |
| MESSAGE_ACTIONS | 5 | — | UI | Message actions, post-processing actions on messages |
| DOWNLOAD_USER_SETTINGS | 5 | — | Configuration | Download user settings, syncs configuration from server |
| DIRECT_CONNECT | 5 | — | Network | Direct connect mode, bypasses proxy for direct API connection |
| VERIFICATION_AGENT | 4 | — | Agent | Verification agent, dedicated to verifying code changes |
| TERMINAL_PANEL | 4 | — | UI | Terminal panel, embedded terminal output display |
| SSH_REMOTE | 4 | — | Remote | SSH remote, connects to remote Claude via SSH |
| REVIEW_ARTIFACT | 4 | — | Review | Review artifact, code review deliverables |
| REACTIVE_COMPACT | 4 | — | Compression | Reactive compaction, triggers compaction based on context changes |
| HISTORY_PICKER | 4 | — | UI | History picker, browse and select historical conversations |
| UPLOAD_USER_SETTINGS | 2 | — | Configuration | Upload user settings, syncs configuration to server |
| POWERSHELL_AUTO_MODE | 2 | — | Platform | PowerShell auto mode, Windows permission automation |
| OVERFLOW_TEST_TOOL | 2 | — | Testing | Overflow test tool, tests context overflow handling |
| NEW_INIT | 2 | — | Initialization | New initialization flow |
| HARD_FAIL | 2 | — | Error Handling | Hard fail mode, terminates immediately on unrecoverable errors |
| ENHANCED_TELEMETRY_BETA | 2 | — | Telemetry | Enhanced telemetry beta, detailed performance metrics collection |
| COWORKER_TYPE_TELEMETRY | 2 | — | Telemetry | Coworker type telemetry, tracks collaboration patterns |
| BREAK_CACHE_COMMAND | 2 | — | Cache | Break cache command, forces prompt cache refresh |
| AWAY_SUMMARY | 2 | — | Summary | Away summary, summarizes work during user absence upon return |
| AUTO_THEME | 2 | — | UI | Auto theme, switches theme based on terminal settings |
| ALLOW_TEST_VERSIONS | 2 | — | Version | Allow test versions, skips version checks |
| AGENT_TRIGGERS_REMOTE | 2 | — | Agent | Agent remote triggers, triggers agent tasks from remote |
| AGENT_MEMORY_SNAPSHOT | 2 | — | Agent | Agent memory snapshot, saves/restores agent state |

## Single-Reference Features (40+)

The following features each have only 1 reference, mostly internal flags or experimental features:

UNATTENDED_RETRY, ULTRATHINK, TORCH, SLOW_OPERATION_LOGGING, SKILL_IMPROVEMENT,
SELF_HOSTED_RUNNER, RUN_SKILL_GENERATOR, PERFETTO_TRACING, NATIVE_CLIENT_ATTESTATION,
KAIROS_DREAM (see kairos.md), IS_LIBC_MUSL, IS_LIBC_GLIBC, DUMP_SYSTEM_PROMPT,
COMPACTION_REMINDERS, CCR_REMOTE_SETUP, BYOC_ENVIRONMENT_RUNNER, BUILTIN_EXPLORE_PLAN_AGENTS,
BUILDING_CLAUDE_APPS, ANTI_DISTILLATION_CC, AGENT_TRIGGERS, ABLATION_BASELINE

## Priority Explanation

These features are classified as Tier 3 for the following reasons:

1. **Internal Infrastructure** (CHICAGO_MCP, LODESTONE): Used internally by Anthropic, cannot be run externally
2. **Pure Stub with Low References** (UDS_INBOX, MONITOR_TOOL, BG_SESSIONS): Require significant work to implement
3. **Experimental Features** (SHOT_STATS, EXTRACT_MEMORIES): Still in concept stage
4. **Auxiliary Features** (STREAMLINED_OUTPUT, HOOK_PROMPTS): Small impact scope
5. **CCR Series**: Depends on remote control infrastructure, requires BRIDGE_MODE to be completed first

To learn more about a specific Tier 3 feature, search the codebase for `feature('FEATURE_NAME')` to see specific usage scenarios.
