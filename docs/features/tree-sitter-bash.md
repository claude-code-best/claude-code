# TREE_SITTER_BASH — Bash AST Parsing

> Feature Flag: `FEATURE_TREE_SITTER_BASH=1`
> Implementation Status: Fully functional (pure TypeScript implementation, ~7000+ lines)
> Reference Count: 3

## 1. Feature Overview

TREE_SITTER_BASH enables a complete Bash AST parser for security validation of Bash commands. It replaces the legacy regex-based shell-quote parser with a full tree-walking security analyzer. The key property is **fail-closed**: any unrecognized content is classified as `too-complex` and requires user approval.

### Related Features

| Feature | Description |
|---------|-------------|
| `TREE_SITTER_BASH` | Activates AST parser for permission checks |
| `TREE_SITTER_BASH_SHADOW` | Shadow/observation mode: runs the parser but discards results, only records telemetry |

## 2. Security Architecture

### 2.1 Fail-Closed Design

The core design uses an **allowlist** traversal pattern:

- `walkArgument()` only handles known safe node types (`word`, `number`, `raw_string`, `string`, `concatenation`, `arithmetic_expansion`, `simple_expansion`)
- Any unknown node type -> `tooComplex()` -> requires user approval
- Parser loaded but fails (timeout/node budget/panic) -> returns `PARSE_ABORTED` symbol (distinct from "module not loaded")

### 2.2 Parse Results

```ts
parseForSecurity(cmd) returns:
  { kind: 'simple', commands: SimpleCommand[] }     // statically analyzable
  { kind: 'too-complex', reason, nodeType }          // requires user approval
  { kind: 'parse-unavailable' }                      // parser not loaded
```

### 2.3 Security Check Hierarchy

```
parseForSecurity(cmd)
      |
      v
parseCommandRaw(cmd) -> AST root node
      |
      v
Pre-checks: control characters, Unicode whitespace, backslash+whitespace,
        zsh ~[ ] syntax, zsh =cmd expansion, brace+quote obfuscation
      |
      v
walkProgram(root) -> collectCommands(root, commands, varScope)
      |
      +-- 'command'         -> walkCommand()
      +-- 'pipeline'/'list' -> structural, recurse children
      +-- 'for_statement'   -> track loop variable as VAR_PLACEHOLDER
      +-- 'if/while'        -> scope-isolated branches
      +-- 'subshell'        -> scope copy
      +-- 'variable_assignment' -> walkVariableAssignment()
      +-- 'declaration_command' -> validate declare/export flags
      +-- 'test_command'    -> walk test expressions
      +-- other             -> tooComplex()
      |
      v
checkSemantics(commands)
  +-- EVAL_LIKE_BUILTINS (eval, source, exec, trap...)
  +-- ZSH_DANGEROUS_BUILTINS (zmodload, emulate...)
  +-- SUBSCRIPT_EVAL_FLAGS (test -v, printf -v, read -a)
  +-- Shell keywords as argv[0] (misparse detection)
  +-- /proc/*/environ access
  +-- jq system() and dangerous flags
  +-- Wrapper stripping (time, nohup, timeout, nice, env, stdbuf)
```

## 3. Implementation Architecture

### 3.1 Core Modules

| Module | File | Lines | Responsibility |
|--------|------|-------|----------------|
| Gated Entry | `src/utils/bash/parser.ts` | ~110 | `parseCommand()`, `parseCommandRaw()`, `ensureInitialized()` |
| Bash Parser | `src/utils/bash/bashParser.ts` | 4437 | Pure TS lexer + recursive descent parser |
| Security Analyzer | `src/utils/bash/ast.ts` | 2680 | Tree-walking security analysis + `parseForSecurity()` |
| AST Analysis Helpers | `src/utils/bash/treeSitterAnalysis.ts` | 507 | Quote context, compound structures, dangerous pattern extraction |
| Permission Check Entry | `src/tools/BashTool/bashPermissions.ts` | — | Integrates AST results into permission decisions |

### 3.2 Bash Parser

File: `src/utils/bash/bashParser.ts` (4437 lines)

- Pure TypeScript implementation (no native dependencies)
- Generates tree-sitter-bash compatible AST
- Key types: `TsNode` (type, text, startIndex, endIndex, children)
- Safety limits: `PARSE_TIMEOUT_MS = 50`, `MAX_NODES = 50_000` — prevents OOM from adversarial input

### 3.3 Security Analyzer

File: `src/utils/bash/ast.ts` (2680 lines)

Core functions:

| Function | Responsibility |
|----------|----------------|
| `parseForSecurity(cmd)` | Top-level entry, returns `simple/too-complex/parse-unavailable` |
| `parseForSecurityFromAst(cmd, root)` | Accepts pre-parsed AST |
| `checkSemantics(commands)` | Post-parse semantic checks |
| `walkCommand()` | Extracts argv, envVars, redirects |
| `walkArgument()` | Allowlist argument traversal |
| `collectCommands()` | Recursively collects all commands |

### 3.4 AST Analysis Helpers

File: `src/utils/bash/treeSitterAnalysis.ts` (507 lines)

| Function | Responsibility |
|----------|----------------|
| `extractQuoteContext()` | Identifies single quotes, double quotes, ANSI-C strings, heredoc |
| `extractCompoundStructure()` | Detects pipelines, subshells, command groups |
| `hasActualOperatorNodes()` | Distinguishes real `;`/`&&`/`||` from escaped forms |
| `extractDangerousPatterns()` | Detects command substitution, parameter expansion, heredocs |
| `analyzeCommand()` | Single-pass extraction |

### 3.5 Shadow Mode

`TREE_SITTER_BASH_SHADOW` runs the parser but **never affects permission decisions**:

```ts
// Shadow mode: record telemetry, then force legacy path
astResult = { kind: 'parse-unavailable' }
astRoot = null
// Record: available, astTooComplex, astSemanticFail, subsDiffer, ...
```

Records `tengu_tree_sitter_shadow` events, including comparison data with the legacy `splitCommand()`. Used to collect telemetry without affecting behavior.

## 4. Key Design Decisions

1. **Allowlist Traversal**: Only processes known safe node types, unknown types directly `tooComplex()`
2. **PARSE_ABORTED Symbol**: Distinguishes "parser not loaded" from "parser loaded but failed". The latter prevents fallback to legacy (which lacks `EVAL_LIKE_BUILTINS` checks)
3. **Variable Scope Tracking**: `VAR=value && cmd $VAR` pattern. Static values resolve to real strings, `$()` output uses `VAR_PLACEHOLDER`
4. **PS4/IFS Allowlist**: PS4 assignment uses strict character allowlist `[A-Za-z0-9 _+:.\/=\[\]-]`, only allows `${VAR}` references
5. **Wrapper Stripping**: Strips `time/nohup/timeout/nice/env/stdbuf` from argv prefix, unknown flags -> fail-closed
6. **Shadow Safety**: Shadow mode **always** forces `astResult = { kind: 'parse-unavailable' }`, never affects permissions

## 5. Usage

```bash
# Activate AST parsing for permission checks
FEATURE_TREE_SITTER_BASH=1 bun run dev

# Shadow mode (telemetry only, does not affect behavior)
FEATURE_TREE_SITTER_BASH_SHADOW=1 bun run dev
```

## 6. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/utils/bash/parser.ts` | ~110 | Gated entry point |
| `src/utils/bash/bashParser.ts` | 4437 | Pure TS bash parser |
| `src/utils/bash/ast.ts` | 2680 | Security analyzer (core) |
| `src/utils/bash/treeSitterAnalysis.ts` | 507 | AST analysis helpers |
| `src/tools/BashTool/bashPermissions.ts:1670-1810` | ~140 | Permission integration + Shadow telemetry |
