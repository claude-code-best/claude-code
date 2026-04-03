# Configuration System Test Plan

## Overview

The configuration system consists of three layers: GlobalConfig, ProjectConfig, and Settings. The testing focus is on pure function validation logic, Zod schema validation, and configuration merging strategies.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/utils/config.ts` | `getGlobalConfig`, `saveGlobalConfig`, `getCurrentProjectConfig`, `checkHasTrustDialogAccepted`, `isPathTrusted`, `getOrCreateUserID`, `isAutoUpdaterDisabled` |
| `src/utils/settings/settings.ts` | `getSettingsForSource`, `parseSettingsFile`, `getSettingsFilePathForSource`, `getInitialSettings` |
| `src/utils/settings/types.ts` | `SettingsSchema` (Zod schema) |
| `src/utils/settings/validation.ts` | Settings validation functions |
| `src/utils/settings/constants.ts` | Settings constants |

---

## Test Cases

### src/utils/config.ts — Pure Functions/Constants

#### describe('DEFAULT_GLOBAL_CONFIG')

- test('has all required fields') — Default config object contains all required fields
- test('has null auth fields by default') — oauthAccount etc. are null

#### describe('DEFAULT_PROJECT_CONFIG')

- test('has empty allowedTools') — Default is an empty array
- test('has empty mcpServers') — Default is an empty object

#### describe('isAutoUpdaterDisabled')

- test('returns true when CLAUDE_CODE_DISABLE_AUTOUPDATER is set') — Disabled when env is set
- test('returns true when disableAutoUpdater config is true')
- test('returns false by default')

---

### src/utils/config.ts — Requires Mocks

#### describe('getGlobalConfig')

- test('returns cached config on subsequent calls') — Caching mechanism
- test('returns TEST_GLOBAL_CONFIG_FOR_TESTING in test mode')
- test('reads config from ~/.claude.json')
- test('returns default config when file does not exist')

#### describe('saveGlobalConfig')

- test('applies updater function to current config') — Updater modifications are saved
- test('creates backup before writing') — Backup created before write
- test('prevents auth state loss') — `wouldLoseAuthState` check

#### describe('getCurrentProjectConfig')

- test('returns project config for current directory')
- test('returns default config when no project config exists')

#### describe('checkHasTrustDialogAccepted')

- test('returns true when trust is accepted in current directory')
- test('returns true when parent directory is trusted') — Trust propagates from parent directory
- test('returns false when no trust accepted')
- test('caches positive results')

#### describe('isPathTrusted')

- test('returns true for trusted path')
- test('returns false for untrusted path')

#### describe('getOrCreateUserID')

- test('returns existing user ID from config')
- test('creates and persists new ID when none exists')
- test('returns consistent ID across calls')

---

### src/utils/settings/settings.ts

#### describe('getSettingsFilePathForSource')

- test('returns ~/.claude/settings.json for userSettings') — Global user settings path
- test('returns .claude/settings.json for projectSettings') — Project settings path
- test('returns .claude/settings.local.json for localSettings') — Local settings path

#### describe('parseSettingsFile') (requires mock file reading)

- test('parses valid settings JSON') — Valid JSON → `{ settings, errors: [] }`
- test('returns errors for invalid fields') — Invalid fields → errors is non-empty
- test('returns empty settings for non-existent file')
- test('handles JSON with comments') — JSONC format support

#### describe('getInitialSettings')

- test('merges settings from all sources') — user + project + local merged
- test('later sources override earlier ones') — Priority: policy > user > project > local

---

### src/utils/settings/types.ts — Zod Schema Validation

#### describe('SettingsSchema validation')

- test('accepts valid minimal settings') — `{}` → valid
- test('accepts permissions block') — `{ permissions: { allow: ['Bash(*)'] } }` → valid
- test('accepts model setting') — `{ model: 'sonnet' }` → valid
- test('accepts hooks configuration') — Valid hooks object is accepted
- test('accepts env variables') — `{ env: { FOO: 'bar' } }` → valid
- test('rejects unknown top-level keys') — Unknown fields are rejected or ignored (depends on schema configuration)
- test('rejects invalid permission mode') — `{ permissions: { defaultMode: 'invalid' } }` → error
- test('rejects non-string model') — `{ model: 123 }` → error
- test('accepts mcpServers configuration') — MCP server configuration is valid
- test('accepts sandbox configuration')

---

### src/utils/settings/validation.ts

#### describe('settings validation')

- test('validates permission rules format') — `'Bash(npm install)'` format is correct
- test('rejects malformed permission rules')
- test('validates hook configuration structure')
- test('provides helpful error messages') — Error messages include field path

---

## Mock Requirements

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| Filesystem | Temporary directory + mock | Config file read/write |
| `lockfile` | mock module | File locking |
| `getCwd` | mock module | Project path resolution |
| `findGitRoot` | mock module | Project root directory |
| `process.env` | Set/restore directly | `CLAUDE_CODE_DISABLE_AUTOUPDATER` etc. |

### Temporary File Structure for Tests

```
/tmp/claude-test-xxx/
├── .claude/
│   ├── settings.json        # projectSettings
│   └── settings.local.json  # localSettings
├── home/
│   └── .claude/
│       └── settings.json    # userSettings (mock HOME)
└── project/
    └── .git/
```

## Integration Test Scenarios

### describe('Config + Settings merge pipeline')

- test('user settings + project settings merge correctly') — Verify merge priority
- test('deny rules from settings are reflected in tool permission context')
- test('trust dialog state persists across config reads')
