# Phase 17 -- Tool Submodule Pure Logic Tests

> Created: 2026-04-02
> Estimated: +150 tests / 11 files
> Goal: Cover tool directory submodules with rich pure logic but zero test coverage

---

## 17.1 `src/tools/PowerShellTool/__tests__/powershellSecurity.test.ts` (~25 tests)

**Target module**: `src/tools/PowerShellTool/powershellSecurity.ts` (1091 lines)

**Security critical** -- detects ~20 attack vectors.

| Test Group | Test Count | Verification |
|---------|-------|--------|
| Invoke-Expression detection | 3 | `IEX`, `Invoke-Expression`, variants |
| Download cradle detection | 3 | `Net.WebClient`, `Invoke-WebRequest`, pipe |
| Privilege escalation | 3 | `Start-Process -Verb RunAs`, `runas.exe` |
| COM object | 2 | `New-Object -ComObject`, WScript.Shell |
| Scheduled tasks | 2 | `schtasks`, `Register-ScheduledTask` |
| WMI | 2 | `Invoke-WmiMethod`, `Get-WmiObject` |
| Module loading | 2 | `Import-Module` from network path |
| Safe commands pass | 3 | `Get-Process`, `Get-ChildItem`, `Write-Host` |
| Obfuscation bypass attempts | 3 | base64, string concatenation, whitespace variants |
| Combined commands | 2 | Multi-command separated by `;` |

**Mock**: Construct `ParsedPowerShellCommand` objects (no real AST needed)

---

## 17.2 `src/tools/PowerShellTool/__tests__/commandSemantics.test.ts` (~10 tests)

**Target module**: `src/tools/PowerShellTool/commandSemantics.ts` (143 lines)

| Test Case | Verification |
|---------|--------|
| grep exit 0/1/2 | Semantic mapping |
| robocopy exit codes | Windows-specific exit codes |
| findstr exit codes | Windows find tool |
| unknown command | Default semantics |
| extractBaseCommand -- basic | `grep "pattern" file` -> `grep` |
| extractBaseCommand -- path | `C:\tools\rg.exe` -> `rg` |
| heuristicallyExtractBaseCommand | Fuzzy matching |

---

## 17.3 `src/tools/PowerShellTool/__tests__/destructiveCommandWarning.test.ts` (~15 tests)

**Target module**: `src/tools/PowerShellTool/destructiveCommandWarning.ts` (110 lines)

| Test Case | Verification |
|---------|--------|
| Remove-Item -Recurse -Force | Dangerous |
| Format-Volume | Dangerous |
| git reset --hard | Dangerous |
| DROP TABLE | Dangerous |
| Remove-Item (no -Force) | Safe |
| Get-ChildItem | Safe |
| Pipeline combination | `rm -rf` + pipe |
| Mixed case | `ReMoVe-ItEm` |

---

## 17.4 `src/tools/PowerShellTool/__tests__/gitSafety.test.ts` (~12 tests)

**Target module**: `src/tools/PowerShellTool/gitSafety.ts` (177 lines)

| Test Case | Verification |
|---------|--------|
| normalizeGitPathArg -- forward slash | Normalization |
| normalizeGitPathArg -- backslash | Windows path normalization |
| normalizeGitPathArg -- NTFS short name | `GITFI~1` -> `.git` |
| isGitInternalPathPS -- .git/config | true |
| isGitInternalPathPS -- normal file | false |
| isDotGitPathPS -- hidden git dir | true |
| isDotGitPathPS -- .gitignore | false |
| bare repo attack | `.git` path traversal |

---

## 17.5 `src/tools/LSPTool/__tests__/formatters.test.ts` (~20 tests)

**Target module**: `src/tools/LSPTool/formatters.ts` (593 lines)

| Test Case | Verification |
|---------|--------|
| formatGoToDefinitionResult — single | Single definition |
| formatGoToDefinitionResult — multiple | Multiple definitions (grouped) |
| formatFindReferencesResult | Reference list |
| formatHoverResult — markdown | Markdown content |
| formatHoverResult — plaintext | Plain text |
| formatDocumentSymbolResult — classes | Class symbols |
| formatDocumentSymbolResult — functions | Function symbols |
| formatDocumentSymbolResult — nested | Nested symbols |
| formatWorkspaceSymbolResult | Workspace symbols |
| formatPrepareCallHierarchyResult | Call hierarchy |
| formatIncomingCallsResult | Incoming calls |
| formatOutgoingCallsResult | Outgoing calls |
| empty results | Empty results for each function |
| groupByFile helper | File grouping logic |

---

## 17.6 `src/tools/GrepTool/__tests__/utils.test.ts` (~10 tests)

**Target module**: `src/tools/GrepTool/GrepTool.ts` (577 lines)

| Test Case | Verification |
|---------|--------|
| applyHeadLimit — within limit | No truncation |
| applyHeadLimit — exceeds limit | Correct truncation |
| applyHeadLimit — offset + limit | Pagination logic |
| applyHeadLimit — zero limit | Boundary |
| formatLimitInfo — basic | Formatted output |

**Mock**: `mock.module("src/utils/log.ts", ...)` to unlock imports

---

## 17.7 `src/tools/WebFetchTool/__tests__/utils.test.ts` (~15 tests)

**Target module**: `src/tools/WebFetchTool/utils.ts` (531 lines)

| Test Case | Verification |
|---------|--------|
| validateURL — valid http | Pass |
| validateURL — valid https | Pass |
| validateURL — ftp | Reject |
| validateURL — no protocol | Reject |
| validateURL — localhost | Handled |
| isPermittedRedirect — same host | Allow |
| isPermittedRedirect — different host | Reject |
| isPermittedRedirect — subdomain | Handled |
| isRedirectInfo — valid object | true |
| isRedirectInfo — invalid | false |

---

## 17.8 `src/tools/WebFetchTool/__tests__/preapproved.test.ts` (~10 tests)

**Target module**: `src/tools/WebFetchTool/preapproved.ts` (167 lines)

| Test Case | Verification |
|---------|--------|
| exact hostname match | Pass |
| subdomain match | Handled |
| path prefix match | `/docs/api` matches |
| path non-match | `/internal` does not match |
| unknown hostname | false |
| empty pathname | Boundary |

---

## 17.9 `src/tools/FileReadTool/__tests__/utils.test.ts` (~15 tests)

**Target module**: `src/tools/FileReadTool/FileReadTool.ts` (1184 lines)

| Test Case | Verification |
|---------|--------|
| isBlockedDevicePath — /dev/sda | true |
| isBlockedDevicePath — /dev/null | Handled |
| isBlockedDevicePath — normal file | false |
| detectSessionFileType — .jsonl | Session file type |
| detectSessionFileType — unknown | Unknown type |
| formatFileLines — basic | Line number format |
| formatFileLines — empty | Empty file |

---

## 17.10 `src/tools/AgentTool/__tests__/agentToolUtils.test.ts` (~18 tests)

**Target module**: `src/tools/AgentTool/agentToolUtils.ts` (688 lines)

| Test Case | Verification |
|---------|--------|
| filterToolsForAgent — builtin only | Returns only built-in tools |
| filterToolsForAgent — exclude async | Excludes async tools |
| filterToolsForAgent — permission mode | Permission filtering |
| resolveAgentTools — wildcard | Wildcard expansion |
| resolveAgentTools — explicit list | Explicit list |
| countToolUses — multiple | Tool call count in messages |
| countToolUses — zero | No tool calls |
| extractPartialResult — text only | Extract text |
| extractPartialResult — mixed | Mixed content |
| getLastToolUseName — basic | Last tool name |
| getLastToolUseName — no tool use | No tool calls |

**Mock**: `mock.module("src/bootstrap/state.ts", ...)`, `mock.module("src/utils/log.ts", ...)`

---

## 17.11 `src/tools/LSPTool/__tests__/schemas.test.ts` (~5 tests)

**Target module**: `src/tools/LSPTool/schemas.ts` (216 lines)

| Test Case | Verification |
|---------|--------|
| isValidLSPOperation — goToDefinition | true |
| isValidLSPOperation — findReferences | true |
| isValidLSPOperation — hover | true |
| isValidLSPOperation — invalid | false |
| isValidLSPOperation — empty string | false |
