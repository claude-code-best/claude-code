# TEAMMEM — Team Shared Memory

> Feature Flag: `FEATURE_TEAMMEM=1`
> Implementation Status: Fully functional (requires Anthropic OAuth + GitHub remote)
> Reference Count: 51

## 1. Feature Overview

TEAMMEM implements a team shared memory system based on GitHub repositories. Files in the `memory/team/` directory are bidirectionally synced to Anthropic servers, allowing all authenticated team members to share project knowledge.

### Core Features

- **Incremental Sync**: Only uploads files whose content hash has changed (delta upload)
- **Conflict Resolution**: ETag-based optimistic locking + 412 conflict retry
- **Secret Scanning**: Detects and skips files containing secrets before upload (PSR M22174)
- **Path Traversal Protection**: All write paths validated to stay within `memory/team/` boundary
- **Batched Upload**: Automatically splits PUT requests exceeding 200KB to avoid gateway rejection

## 2. User Interaction

### Sync Behavior

| Event | Behavior |
|-------|----------|
| Project startup | Automatically pulls team memory to `memory/team/` |
| Local file edit | Watcher detects changes, automatically pushes |
| Server-side update | Overwrites local on next pull (server-wins) |
| Secret detected | Skips that file, logs warning, does not block other file sync |

### API Endpoints

```
GET  /api/claude_code/team_memory?repo={owner/repo}             -> full data + entryChecksums
GET  /api/claude_code/team_memory?repo={owner/repo}&view=hashes -> checksums only (for conflict resolution)
PUT  /api/claude_code/team_memory?repo={owner/repo}             -> upload entries (upsert semantics)
```

## 3. Implementation Architecture

### 3.1 Sync State

```ts
type SyncState = {
  lastKnownChecksum: string | null    // ETag conditional request
  serverChecksums: Map<string, string> // sha256:<hex> per-file hash
  serverMaxEntries: number | null      // learned from 413 server capacity
}
```

### 3.2 Pull Flow (Server -> Local)

File: `src/services/teamMemorySync/index.ts:770-867`

```
pullTeamMemory(state)
      |
      v
Check OAuth + GitHub remote
      |
      v
fetchTeamMemory(state, repo, etag)
  +-- 304 Not Modified -> return (no changes)
  +-- 404 -> return (no server data)
  +-- 200 -> parse TeamMemoryData
      |
      v
Refresh serverChecksums (per-key hashes)
      |
      v
writeRemoteEntriesToLocal(entries)
  +-- Path traversal validation (validateTeamMemKey)
  +-- File size check (> 250KB skip)
  +-- Content comparison (skip write if identical)
  +-- Parallel write (Promise.all)
```

### 3.3 Push Flow (Local -> Server)

File: `src/services/teamMemorySync/index.ts:889-1146`

```
pushTeamMemory(state)
      |
      v
readLocalTeamMemory(maxEntries)
  +-- Recursively scan memory/team/ directory
  +-- Skip oversized files (> 250KB)
  +-- Secret scanning (scanForSecrets, gitleaks rules)
  +-- Truncate by serverMaxEntries (if known)
      |
      v
Compute delta = local files - serverChecksums
  (only includes files with different hashes)
      |
      v
batchDeltaByBytes(delta)
  (split into <= 200KB batches)
      |
      v
Upload batches: uploadTeamMemory(state, repo, batch, etag)
  +-- 200 success -> update serverChecksums
  +-- 412 conflict -> fetchTeamMemoryHashes() refresh checksums
  |                -> retry delta computation (up to 2 times)
  +-- 413 over capacity -> learn serverMaxEntries
```

### 3.4 Secret Scanning

File: `src/services/teamMemorySync/secretScanner.ts`

Scans file content using gitleaks rule patterns. When a secret is detected:
- Skip that file (do not upload)
- Record `tengu_team_mem_secret_skipped` event (only records rule ID, not the value)
- Do not block other file sync

### 3.5 File Watching

File: `src/services/teamMemorySync/watcher.ts`

Watches `memory/team/` directory for changes, triggers automatic push. Suppresses false changes caused by pull writes.

### 3.6 Path Safety

File: `src/memdir/teamMemPaths.ts`

- `validateTeamMemKey(relPath)` — Validates relative path does not escape `memory/team/` boundary
- `getTeamMemPath()` — Returns team memory root directory path

## 4. Key Design Decisions

1. **Server-wins on Pull, Local-wins on Push**: Pull overwrites local with server content; push overwrites server with local edits. Local user edits should not be silently discarded
2. **Delta Upload**: Only uploads entries with changed hashes, saving bandwidth. First push is full, subsequent are incremental
3. **Batched PUT**: Single PUT <= 200KB, avoiding API gateway (~256-512KB) rejection. Each batch is independent upsert, partial failures do not affect already-committed batches
4. **Secret Scanning Before Upload**: PSR M22174 requires secrets to never leave the local machine. Scanning executes in `readLocalTeamMemory`, secret files do not enter the upload set
5. **ETag Optimistic Locking**: Push uses `If-Match` header. On 412, probe `?view=hashes` (only fetches checksums, not content), refresh then retry
6. **Dynamic Server Capacity Learning**: Does not assume client-side capacity limit, learns from 413's `extra_details.max_entries`

## 5. Usage

```bash
# Enable feature
FEATURE_TEAMMEM=1 bun run dev

# Prerequisites:
# 1. Logged in via Anthropic OAuth
# 2. Project has a GitHub remote (git remote -v shows origin)
# 3. memory/team/ directory created automatically
```

## 6. External Dependencies

| Dependency | Description |
|------------|-------------|
| Anthropic OAuth | First-party authentication |
| GitHub Remote | `getGithubRepo()` gets `owner/repo` as sync scope |
| Team Memory API | `/api/claude_code/team_memory` endpoint |

## 7. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/services/teamMemorySync/index.ts` | 1257 | Core sync logic (pull/push/sync) |
| `src/services/teamMemorySync/watcher.ts` | — | File watching + auto sync trigger |
| `src/services/teamMemorySync/secretScanner.ts` | — | gitleaks secret scanning |
| `src/services/teamMemorySync/types.ts` | — | Zod schema + type definitions |
| `src/services/teamMemorySync/teamMemSecretGuard.ts` | — | Secret guard helper |
| `src/memdir/teamMemPaths.ts` | — | Path validation + directory management |
