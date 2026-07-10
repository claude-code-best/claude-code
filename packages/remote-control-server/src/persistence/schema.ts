import type { Database } from 'bun:sqlite'

const VERSION_1 = 1

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

export function migrateSchema(database: Database): void {
  database.exec('PRAGMA foreign_keys = ON;')

  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at_ms INTEGER NOT NULL
      );
    `)

    const applied = database
      .query<{ version: number }, { version: number }>(
        'SELECT version FROM schema_migrations WHERE version = $version',
      )
      .get({ version: VERSION_1 })

    if (applied) return

    database.exec(VERSION_1_SCHEMA)
    database
      .query<unknown, { version: number; appliedAt: number }>(
        `INSERT INTO schema_migrations (version, applied_at_ms)
         VALUES ($version, $appliedAt)`,
      )
      .run({ version: VERSION_1, appliedAt: Date.now() })
  })

  migrate.immediate()
}
