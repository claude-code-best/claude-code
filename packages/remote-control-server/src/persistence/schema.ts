import type { Database } from 'bun:sqlite'
import { DURABLE_EVENT_RETENTION_CAPS } from '../transport/event-delivery-policy'

const VERSION_1 = 1
const VERSION_2 = 2
const VERSION_3 = 3
const VERSION_4 = 4
const VERSION_5 = 5
const VERSION_6 = 6
const VERSION_7 = 7
const VERSION_8 = 8
const VERSION_9 = 9
const VERSION_10 = 10

const VERSION_1_SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  environment_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  permission_mode TEXT,
  worker_epoch INTEGER NOT NULL DEFAULT 0,
  username TEXT,
  last_seq INTEGER NOT NULL DEFAULT 0,
  archived_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_owners (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  owner_uuid TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, owner_uuid)
);
CREATE TABLE IF NOT EXISTS session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq_num INTEGER NOT NULL,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  payload_json TEXT NOT NULL,
  source_event_id TEXT,
  dedupe_scope TEXT,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq_num)
);
CREATE UNIQUE INDEX IF NOT EXISTS session_events_dedupe
  ON session_events(session_id, dedupe_scope, source_event_id)
  WHERE dedupe_scope IS NOT NULL AND source_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS session_workers (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  worker_status TEXT,
  external_metadata_json TEXT,
  requires_action_details_json TEXT,
  last_heartbeat_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
`

const VERSION_2_SCHEMA = `
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device_id TEXT,
  device_name TEXT,
  workspace_key TEXT,
  machine_name TEXT,
  directory TEXT,
  branch TEXT,
  git_repo_url TEXT,
  max_sessions INTEGER NOT NULL DEFAULT 1,
  worker_type TEXT NOT NULL,
  bridge_id TEXT,
  capabilities_json TEXT,
  status TEXT NOT NULL,
  username TEXT,
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  lease_token_hash TEXT,
  connection_id TEXT,
  last_poll_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS environments_logical_identity
  ON environments(account_id, device_id, workspace_key, worker_type)
  WHERE device_id IS NOT NULL AND workspace_key IS NOT NULL;
`

/** Per-session working-directory override (web "choose folder" flow). */
const VERSION_3_SCHEMA = `
ALTER TABLE sessions ADD COLUMN directory TEXT;
`

const VERSION_4_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  product TEXT NOT NULL CHECK(product IN ('chat', 'code')),
  name TEXT NOT NULL,
  project_prompt TEXT NOT NULL DEFAULT '',
  prompt_revision INTEGER NOT NULL DEFAULT 0 CHECK(prompt_revision >= 0),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK(state IN ('active', 'archived', 'missing')),
  device_id TEXT,
  workspace_key TEXT,
  canonical_path TEXT,
  git_root TEXT,
  git_repo_url TEXT,
  missing_confirmed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK(
    (product = 'chat'
      AND device_id IS NULL
      AND workspace_key IS NULL
      AND canonical_path IS NULL)
    OR
    (product = 'code'
      AND device_id IS NOT NULL
      AND workspace_key IS NOT NULL
      AND canonical_path IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS code_projects_workspace_identity
  ON projects(owner_id, device_id, workspace_key)
  WHERE product = 'code';

ALTER TABLE sessions ADD COLUMN product TEXT NOT NULL DEFAULT 'code'
  CHECK(product IN ('chat', 'code'));
ALTER TABLE sessions ADD COLUMN project_id TEXT;
ALTER TABLE sessions ADD COLUMN runtime_environment_id TEXT;
ALTER TABLE sessions ADD COLUMN data_directory TEXT;
ALTER TABLE sessions ADD COLUMN project_prompt_revision INTEGER;

CREATE INDEX IF NOT EXISTS sessions_product_project
  ON sessions(product, project_id);

CREATE TRIGGER IF NOT EXISTS sessions_project_product_insert
BEFORE INSERT ON sessions
WHEN NEW.project_id IS NOT NULL
  AND COALESCE(
    (SELECT product FROM projects WHERE id = NEW.project_id),
    ''
  ) <> NEW.product
BEGIN
  SELECT RAISE(ABORT, 'session project product mismatch');
END;

CREATE TRIGGER IF NOT EXISTS sessions_project_product_update
BEFORE UPDATE OF project_id, product ON sessions
WHEN NEW.project_id IS NOT NULL
  AND COALESCE(
    (SELECT product FROM projects WHERE id = NEW.project_id),
    ''
  ) <> NEW.product
BEGIN
  SELECT RAISE(ABORT, 'session project product mismatch');
END;

CREATE TABLE IF NOT EXISTS environment_commands (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (
    'list_directory',
    'resolve_workspace',
    'cleanup_chat_session',
    'probe_workspace'
  )),
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'pending',
    'dispatched',
    'completed',
    'failed'
  )),
  result_json TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS environment_commands_pending
  ON environment_commands(environment_id, state, created_at_ms);

CREATE TABLE IF NOT EXISTS cleanup_tombstones (
  session_id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  data_directory TEXT NOT NULL,
  browser_scope_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
`

const VERSION_5_SCHEMA = `
CREATE TABLE IF NOT EXISTS session_event_deliveries (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES session_events(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,
  worker_epoch INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('received', 'processing', 'processed')),
  received_at_ms INTEGER,
  processing_at_ms INTEGER,
  processed_at_ms INTEGER,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, event_id)
);
CREATE INDEX IF NOT EXISTS session_event_deliveries_status
  ON session_event_deliveries(session_id, status, sequence_num);

DELETE FROM session_events WHERE type GLOB 'terminal_*';
`

// Interrupts used to share the durable outbound bus. They are side effects,
// so a reconnect must never replay one after the user has moved on.
const VERSION_6_SCHEMA = `
DELETE FROM session_events
WHERE type = 'interrupt' AND direction = 'outbound';
`

const VERSION_7_SCHEMA = `
ALTER TABLE sessions ADD COLUMN model_provider_id TEXT;
ALTER TABLE sessions ADD COLUMN model_profile_id TEXT;
ALTER TABLE sessions ADD COLUMN model_resolved_id TEXT;
ALTER TABLE sessions ADD COLUMN model_config_revision INTEGER;
ALTER TABLE sessions ADD COLUMN model_updated_at_ms INTEGER;
CREATE INDEX IF NOT EXISTS session_events_type_latest
  ON session_events(session_id, type, seq_num DESC);
`

const VERSION_8_SCHEMA = `
CREATE TABLE IF NOT EXISTS environment_commands (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (
    'list_directory',
    'resolve_workspace',
    'cleanup_chat_session',
    'probe_workspace'
  )),
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'pending',
    'dispatched',
    'completed',
    'failed'
  )),
  result_json TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
DROP INDEX IF EXISTS environment_commands_pending;
ALTER TABLE environment_commands RENAME TO environment_commands_v7;
CREATE TABLE environment_commands (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (
    'list_directory',
    'resolve_workspace',
    'cleanup_chat_session',
    'probe_workspace',
    'get_provider_catalog',
    'save_provider_profile',
    'archive_provider_profile',
    'save_model_profile',
    'archive_model_profile',
    'set_default_model',
    'validate_provider_model',
    'begin_provider_auth',
    'get_provider_auth_status',
    'submit_provider_auth_code',
    'cancel_provider_auth',
    'remove_provider_auth',
    'refresh_provider_auth',
    'begin_provider_secret'
  )),
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'pending',
    'dispatched',
    'completed',
    'failed'
  )),
  result_json TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
INSERT INTO environment_commands (
  id, environment_id, owner_id, kind, payload_json, state, result_json,
  error, attempt_count, created_at_ms, updated_at_ms
)
SELECT
  id, environment_id, owner_id, kind, payload_json, state, result_json,
  error, attempt_count, created_at_ms, updated_at_ms
FROM environment_commands_v7;
DROP TABLE environment_commands_v7;
CREATE INDEX environment_commands_pending
  ON environment_commands(environment_id, state, created_at_ms);
`

const VERSION_9_SCHEMA = `
CREATE TABLE IF NOT EXISTS session_internal_events (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  event_metadata_json TEXT,
  is_compaction INTEGER NOT NULL DEFAULT 0 CHECK(is_compaction IN (0, 1)),
  agent_id TEXT,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, event_id)
);
CREATE INDEX IF NOT EXISTS session_internal_events_order
  ON session_internal_events(session_id, created_at_ms, event_id);
CREATE INDEX IF NOT EXISTS session_internal_events_agent
  ON session_internal_events(session_id, agent_id, created_at_ms, event_id);
`

// Version 10 retroactively applies the durable-event retention caps (see
// DURABLE_EVENT_RETENTION_CAPS). Protocol request/response traffic — most
// notably ~100KB control_response payloads for every initialize — used to be
// persisted forever and grew to dominate existing databases. commitEvent now
// prunes these classes on write; this migration clears the backlog using the
// exact same newest-`keep`-per-session rule.
const VERSION_10_SCHEMA = DURABLE_EVENT_RETENTION_CAPS.map(
  cap => `
DELETE FROM session_events
WHERE type = '${cap.type}' AND direction = '${cap.direction}'
  AND seq_num <= (
    SELECT newest.seq_num FROM session_events AS newest
    WHERE newest.session_id = session_events.session_id
      AND newest.type = session_events.type
      AND newest.direction = session_events.direction
    ORDER BY newest.seq_num DESC
    LIMIT 1 OFFSET ${cap.keep}
  );
`,
).join('\n')

export function migrateSchema(database: Database): void {
  database.exec('PRAGMA foreign_keys = ON;')

  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at_ms INTEGER NOT NULL
      );
    `)

    const version1Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_1 })

    if (!version1Applied) {
      database.exec(VERSION_1_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_1, appliedAt: Date.now() })
    }

    const version2Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_2 })
    if (!version2Applied) {
      database.exec(VERSION_2_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_2, appliedAt: Date.now() })
    }

    const version3Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_3 })
    if (!version3Applied) {
      database.exec(VERSION_3_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_3, appliedAt: Date.now() })
    }

    const version4Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_4 })
    if (!version4Applied) {
      database.exec(VERSION_4_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_4, appliedAt: Date.now() })
    }

    const version5Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_5 })
    if (!version5Applied) {
      database.exec(VERSION_5_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_5, appliedAt: Date.now() })
    }

    const version6Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_6 })
    if (!version6Applied) {
      database.exec(VERSION_6_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_6, appliedAt: Date.now() })
    }

    const version7Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_7 })
    if (!version7Applied) {
      database.exec(VERSION_7_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_7, appliedAt: Date.now() })
    }

    const version8Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_8 })
    if (!version8Applied) {
      database.exec(VERSION_8_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_8, appliedAt: Date.now() })
    }

    const version9Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_9 })
    if (!version9Applied) {
      database.exec(VERSION_9_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_9, appliedAt: Date.now() })
    }

    const version10Applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_10 })
    if (!version10Applied) {
      database.exec(VERSION_10_SCHEMA)
      database
        .query<unknown, { version: number; appliedAt: number }>(
          `INSERT INTO schema_migrations (version, applied_at_ms)
           VALUES ($version, $appliedAt)`,
        )
        .run({ version: VERSION_10, appliedAt: Date.now() })
    }
  })

  migrate.immediate()
}
