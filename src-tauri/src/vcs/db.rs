use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde_json::Value;

use super::model::{CommitAttrs, VcsCommit};

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

pub(super) fn new_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", now_ms(), std::process::id(), n)
}

pub(super) fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS document (
            id                TEXT PRIMARY KEY,
            initial_commit    TEXT NOT NULL,
            current_commit    TEXT NOT NULL,
            checkpoint_commit TEXT NOT NULL,
            source_json       TEXT NOT NULL,
            target_json       TEXT NOT NULL,
            chats_json        TEXT NOT NULL DEFAULT '[]',
            created_at        INTEGER NOT NULL,
            updated_at        INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS commits (
            seq              INTEGER PRIMARY KEY AUTOINCREMENT,
            id               TEXT NOT NULL UNIQUE,
            kind             TEXT NOT NULL,
            parent_id        TEXT,
            timestamp        INTEGER NOT NULL,
            label            TEXT,
            current_cluster  TEXT,
            file_saved       INTEGER NOT NULL DEFAULT 0,
            selection_set    INTEGER NOT NULL DEFAULT 0,
            source_steps     TEXT,
            target_steps     TEXT
        );

        CREATE INDEX IF NOT EXISTS commits_parent_idx ON commits(parent_id);
        ",
    )
}

pub(super) fn document_exists(conn: &Connection) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM document", [], |r| r.get(0))?;
    Ok(count > 0)
}

pub(super) fn insert_root(conn: &Connection, id: &str, timestamp: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO commits (id, kind, parent_id, timestamp) VALUES (?1, 'root', NULL, ?2)",
        params![id, timestamp],
    )?;
    Ok(())
}

pub(super) fn insert_document(
    conn: &Connection,
    id: &str,
    initial: &str,
    source: &Value,
    target: &Value,
    chats: &Value,
    timestamp: i64,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO document
            (id, initial_commit, current_commit, checkpoint_commit,
             source_json, target_json, chats_json, created_at, updated_at)
         VALUES (?1, ?2, ?2, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            id,
            initial,
            serde_json::to_string(source).unwrap_or_else(|_| "null".into()),
            serde_json::to_string(target).unwrap_or_else(|_| "null".into()),
            serde_json::to_string(chats).unwrap_or_else(|_| "[]".into()),
            timestamp
        ],
    )?;
    Ok(())
}

fn commit_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<VcsCommit> {
    let id: String = row.get("id")?;
    let kind: String = row.get("kind")?;
    let seq: i64 = row.get("seq")?;
    let attrs = CommitAttrs {
        timestamp: row.get("timestamp")?,
        label: row.get("label")?,
        current_cluster: row.get("current_cluster")?,
        file_saved: row.get::<_, i64>("file_saved")? != 0,
        selection_set: row.get::<_, i64>("selection_set")? != 0,
    };
    match kind.as_str() {
        "root" => Ok(VcsCommit::Root { id, attrs, seq }),
        "delta" => Ok(VcsCommit::Delta {
            id,
            parent: row.get("parent_id")?,
            attrs,
            seq,
        }),
        "merge" => Ok(VcsCommit::Merge { id, attrs, seq }),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

pub(super) fn load_summaries(conn: &Connection) -> rusqlite::Result<Vec<VcsCommit>> {
    let mut stmt = conn.prepare(
        "SELECT seq, id, kind, parent_id, timestamp, label, current_cluster,
                file_saved, selection_set
         FROM commits ORDER BY seq ASC",
    )?;
    let rows = stmt.query_map([], commit_from_row)?;
    rows.collect()
}
