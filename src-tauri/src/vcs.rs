use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// All VCS commands operate on the single currently-open document. Keeping the
/// connection here (rather than in JS) is the first step towards the plan in
/// documents/plan-sqlite-vcs.md.
pub struct VcsState {
    open: Mutex<Option<OpenDocument>>,
}

impl Default for VcsState {
    fn default() -> Self {
        Self {
            open: Mutex::new(None),
        }
    }
}

struct OpenDocument {
    id: String,
    path: Option<PathBuf>,
    initial_commit: String,
    conn: Connection,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommitAttrs {
    #[serde(default)]
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_cluster: Option<String>,
    #[serde(default)]
    pub file_saved: bool,
    #[serde(default)]
    pub selection_set: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub attrs: CommitAttrs,
    pub seq: i64,
    pub depth: i64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewCommit {
    pub id: String,
    pub parent: String,
    pub attrs: CommitAttrs,
    #[serde(default)]
    pub source: Option<Value>,
    #[serde(default)]
    pub target: Option<Value>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAttrs {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub current_cluster: Option<String>,
    #[serde(default)]
    pub file_saved: Option<bool>,
    #[serde(default)]
    pub selection_set: Option<bool>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment {
    pub id: String,
    pub direction: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<Value>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenSnapshot {
    pub doc_id: String,
    pub path: Option<String>,
    pub initial_commit: String,
    pub current_commit: String,
    pub checkpoint_commit: String,
    pub source: Value,
    pub target: Value,
    pub chats: Value,
    pub summaries: Vec<CommitSummary>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", now_ms(), std::process::id(), n)
}

fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
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
            depth            INTEGER NOT NULL DEFAULT 0,
            child_count      INTEGER NOT NULL DEFAULT 0,
            first_child_id   TEXT,
            source_steps     TEXT,
            target_steps     TEXT
        );

        CREATE INDEX IF NOT EXISTS commit_parent_idx ON commits(parent_id);
        CREATE INDEX IF NOT EXISTS commit_depth_idx ON commits(depth);

        CREATE TABLE IF NOT EXISTS commit_parent (
            child_id  TEXT NOT NULL,
            parent_id TEXT NOT NULL,
            position  INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (child_id, parent_id)
        );
        CREATE INDEX IF NOT EXISTS commit_parent_parent_idx ON commit_parent(parent_id);
        "#,
    )
}

fn document_exists(conn: &Connection) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM document", [], |r| r.get(0))?;
    Ok(count > 0)
}

fn insert_root(conn: &Connection, id: &str, timestamp: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO commits (id, kind, parent_id, timestamp, depth) VALUES (?1, 'root', NULL, ?2, 0)",
        params![id, timestamp],
    )?;
    Ok(())
}

fn insert_document(
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

fn summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CommitSummary> {
    Ok(CommitSummary {
        seq: row.get("seq")?,
        id: row.get("id")?,
        kind: row.get("kind")?,
        parent: row.get("parent_id")?,
        attrs: CommitAttrs {
            timestamp: row.get("timestamp")?,
            label: row.get("label")?,
            current_cluster: row.get("current_cluster")?,
            file_saved: row.get::<_, i64>("file_saved")? != 0,
            selection_set: row.get::<_, i64>("selection_set")? != 0,
        },
        depth: row.get("depth")?,
    })
}

fn load_summaries(conn: &Connection) -> rusqlite::Result<Vec<CommitSummary>> {
    let mut stmt = conn.prepare(
        "SELECT seq, id, kind, parent_id, timestamp, label, current_cluster,
                file_saved, selection_set, depth
         FROM commits ORDER BY seq ASC",
    )?;
    let rows = stmt.query_map([], summary_from_row)?;
    rows.collect()
}

fn take_open<'a>(
    state: &'a VcsState,
    doc_id: &str,
) -> Result<std::sync::MutexGuard<'a, Option<OpenDocument>>, String> {
    let guard = state
        .open
        .lock()
        .map_err(|_| "VCS state poisoned".to_string())?;
    match guard.as_ref() {
        Some(doc) if doc.id == doc_id => Ok(guard),
        Some(_) => Err("a different document is open".into()),
        None => Err("no document is open".into()),
    }
}

fn snapshot(doc: &OpenDocument) -> Result<OpenSnapshot, String> {
    let row = doc
        .conn
        .query_row(
            "SELECT source_json, target_json, chats_json, current_commit, checkpoint_commit
             FROM document LIMIT 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "document row is missing".to_string())?;

    let parse = |s: &str| serde_json::from_str::<Value>(s).unwrap_or(Value::Null);
    Ok(OpenSnapshot {
        doc_id: doc.id.clone(),
        path: doc.path.as_ref().map(|p| p.to_string_lossy().to_string()),
        initial_commit: doc.initial_commit.clone(),
        current_commit: row.3,
        checkpoint_commit: row.4,
        source: parse(&row.0),
        target: parse(&row.1),
        chats: parse(&row.2),
        summaries: load_summaries(&doc.conn).map_err(|e| e.to_string())?,
    })
}

fn open_existing(path: &str) -> Result<OpenDocument, String> {
    if !std::path::Path::new(path).exists() {
        return Err(format!("{path} does not exist"));
    }
    let conn = Connection::open(path).map_err(|e| format!("failed to open {path}: {e}"))?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;
    if !document_exists(&conn).map_err(|e| e.to_string())? {
        return Err("not an orouet document".into());
    }
    let initial: String = conn
        .query_row("SELECT initial_commit FROM document LIMIT 1", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let id = new_id();
    Ok(OpenDocument {
        id,
        path: Some(PathBuf::from(path)),
        initial_commit: initial,
        conn,
    })
}

#[tauri::command(async)]
pub fn vcs_create(
    state: tauri::State<'_, VcsState>,
    path: Option<String>,
    source: Value,
    target: Value,
    chats: Value,
) -> Result<OpenSnapshot, String> {
    let conn = match &path {
        Some(path) => {
            if std::path::Path::new(path).exists() {
                let existing = Connection::open(path).map_err(|e| e.to_string())?;
                ensure_schema(&existing).map_err(|e| e.to_string())?;
                if document_exists(&existing).map_err(|e| e.to_string())? {
                    return Err(format!("{path} already contains a document"));
                }
            }
            Connection::open(path).map_err(|e| format!("failed to create {path}: {e}"))?
        }
        None => Connection::open_in_memory().map_err(|e| e.to_string())?,
    };
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let id = new_id();
    let initial = new_id();
    let timestamp = now_ms();
    insert_root(&conn, &initial, timestamp).map_err(|e| e.to_string())?;
    insert_document(&conn, &id, &initial, &source, &target, &chats, timestamp)
        .map_err(|e| e.to_string())?;

    let doc = OpenDocument {
        id,
        path: path.map(PathBuf::from),
        initial_commit: initial,
        conn,
    };
    let result = snapshot(&doc)?;
    *state.open.lock().map_err(|_| "VCS state poisoned")? = Some(doc);
    Ok(result)
}

#[tauri::command(async)]
pub fn vcs_open(state: tauri::State<'_, VcsState>, path: String) -> Result<OpenSnapshot, String> {
    let doc = open_existing(&path)?;
    let result = snapshot(&doc)?;
    *state.open.lock().map_err(|_| "VCS state poisoned")? = Some(doc);
    Ok(result)
}

/// Import a version-1 `SerializedDocumentContext` JSON object into an in-memory
/// SQLite document. This keeps `.orz` files readable while the runtime uses
/// SQLite everywhere.
fn import_document_into(conn: &Connection, document: &Value) -> Result<(String, String), String> {
    let source = document.get("source").cloned().unwrap_or(Value::Null);
    let target = document.get("target").cloned().unwrap_or(Value::Null);
    let chats = document
        .get("chats")
        .cloned()
        .unwrap_or_else(|| Value::Array(vec![]));
    let vc = document.get("vc").cloned().unwrap_or(Value::Null);
    let initial = vc
        .get("initialCommit")
        .and_then(Value::as_str)
        .ok_or_else(|| "legacy archive has no initial commit".to_string())?
        .to_string();
    let commits = vc
        .get("commits")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let timestamp = now_ms();
    insert_root(conn, &initial, timestamp).map_err(|e| e.to_string())?;

    let known: std::collections::HashSet<String> = commits
        .iter()
        .filter_map(|c| c.get("id").and_then(Value::as_str).map(str::to_string))
        .chain(std::iter::once(initial.clone()))
        .collect();

    for commit in &commits {
        let id = commit
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "legacy commit has no id".to_string())?;
        if id == initial {
            continue;
        }
        let kind = commit
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("delta");
        let mut parent = commit
            .get("parent")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| initial.clone());
        if !known.contains(&parent) {
            parent = initial.clone();
        }
        let attrs: CommitAttrs = commit
            .get("attrs")
            .cloned()
            .map(serde_json::from_value)
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        let source_steps = commit
            .get("source")
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| e.to_string())?;
        let target_steps = commit
            .get("target")
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO commits
                (id, kind, parent_id, timestamp, label, current_cluster,
                 file_saved, selection_set, depth, source_steps, target_steps)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)",
            params![
                id,
                kind,
                parent,
                attrs.timestamp,
                attrs.label,
                attrs.current_cluster,
                attrs.file_saved as i64,
                attrs.selection_set as i64,
                source_steps,
                target_steps
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO commit_parent (child_id, parent_id, position) VALUES (?1, ?2, 0)",
            params![id, parent],
        )
        .map_err(|e| e.to_string())?;
    }

    // Recompute depth and child counters after all rows exist.
    conn.execute(
        "WITH RECURSIVE d(id, depth) AS (
             SELECT id, 0 FROM commits WHERE id = ?1
             UNION ALL
             SELECT c.id, d.depth + 1 FROM commits c JOIN d ON c.parent_id = d.id
         )
         UPDATE commits SET depth = COALESCE((SELECT depth FROM d WHERE d.id = commits.id), 0)",
        params![initial],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE commits SET
             child_count = (SELECT COUNT(*) FROM commits c WHERE c.parent_id = commits.id),
             first_child_id = (SELECT c.id FROM commits c WHERE c.parent_id = commits.id ORDER BY c.seq LIMIT 1)",
        [],
    )
    .map_err(|e| e.to_string())?;

    let requested_current = document
        .get("currentCommit")
        .and_then(Value::as_str)
        .unwrap_or(&initial)
        .to_string();
    let current: String = conn
        .query_row(
            "SELECT id FROM commits WHERE id = ?1",
            params![requested_current],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| {
            conn.query_row(
                "SELECT id FROM commits ORDER BY seq DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(initial.clone())
        });

    let doc_id = new_id();
    conn.execute(
        "INSERT INTO document
            (id, initial_commit, current_commit, checkpoint_commit,
             source_json, target_json, chats_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            doc_id,
            initial,
            current,
            serde_json::to_string(&source).unwrap_or_else(|_| "null".into()),
            serde_json::to_string(&target).unwrap_or_else(|_| "null".into()),
            serde_json::to_string(&chats).unwrap_or_else(|_| "[]".into()),
            timestamp
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok((doc_id, initial))
}

/// Import a version-1 `SerializedDocumentContext` JSON object into an in-memory
/// SQLite document. This keeps `.orz` files readable while the runtime uses
/// SQLite everywhere.
#[tauri::command(async)]
pub fn vcs_import(
    state: tauri::State<'_, VcsState>,
    document: Value,
) -> Result<OpenSnapshot, String> {
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;
    let (doc_id, initial) = import_document_into(&conn, &document)?;

    let doc = OpenDocument {
        id: doc_id,
        path: None,
        initial_commit: initial,
        conn,
    };
    let result = snapshot(&doc)?;
    *state.open.lock().map_err(|_| "VCS state poisoned")? = Some(doc);
    Ok(result)
}

fn append_commit_into(conn: &Connection, commit: NewCommit) -> Result<CommitSummary, String> {
    let parent_depth: i64 = conn
        .query_row(
            "SELECT depth FROM commits WHERE id = ?1",
            params![commit.parent],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("parent commit {} does not exist", commit.parent))?;
    let depth = parent_depth + 1;

    let source_steps = commit
        .source
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| e.to_string())?;
    let target_steps = commit
        .target
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO commits
            (id, kind, parent_id, timestamp, label, current_cluster,
             file_saved, selection_set, depth, source_steps, target_steps)
         VALUES (?1, 'delta', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            commit.id,
            commit.parent,
            commit.attrs.timestamp,
            commit.attrs.label,
            commit.attrs.current_cluster,
            commit.attrs.file_saved as i64,
            commit.attrs.selection_set as i64,
            depth,
            source_steps,
            target_steps
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO commit_parent (child_id, parent_id, position) VALUES (?1, ?2, 0)",
        params![commit.id, commit.parent],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE commits SET child_count = child_count + 1,
                           first_child_id = COALESCE(first_child_id, ?1)
         WHERE id = ?2",
        params![commit.id, commit.parent],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE document SET current_commit = ?1, updated_at = ?2",
        params![commit.id, now_ms()],
    )
    .map_err(|e| e.to_string())?;

    let seq: i64 = conn
        .query_row(
            "SELECT seq FROM commits WHERE id = ?1",
            params![commit.id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(CommitSummary {
        id: commit.id,
        parent: Some(commit.parent),
        kind: "delta".into(),
        attrs: commit.attrs,
        seq,
        depth,
    })
}

#[tauri::command(async)]
pub fn vcs_append(
    state: tauri::State<'_, VcsState>,
    doc_id: String,
    commit: NewCommit,
) -> Result<CommitSummary, String> {
    let mut guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_mut()
        .ok_or_else(|| "no document is open".to_string())?;
    append_commit_into(&doc.conn, commit)
}

#[tauri::command(async)]
pub fn vcs_update_attrs(
    state: tauri::State<'_, VcsState>,
    doc_id: String,
    id: String,
    attrs: UpdateAttrs,
) -> Result<(), String> {
    let mut guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_mut()
        .ok_or_else(|| "no document is open".to_string())?;
    let conn = &doc.conn;

    let (label, current_cluster, file_saved, selection_set) = conn
        .query_row(
            "SELECT label, current_cluster, file_saved, selection_set FROM commits WHERE id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("commit {id} does not exist"))?;

    conn.execute(
        "UPDATE commits SET label = ?1, current_cluster = ?2, file_saved = ?3, selection_set = ?4
         WHERE id = ?5",
        params![
            attrs.label.or(label),
            attrs.current_cluster.or(current_cluster),
            attrs.file_saved.unwrap_or(file_saved != 0) as i64,
            attrs.selection_set.unwrap_or(selection_set != 0) as i64,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn vcs_set_current(
    state: tauri::State<'_, VcsState>,
    doc_id: String,
    id: String,
) -> Result<(), String> {
    let mut guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_mut()
        .ok_or_else(|| "no document is open".to_string())?;
    let exists: i64 = doc
        .conn
        .query_row(
            "SELECT COUNT(*) FROM commits WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err(format!("commit {id} does not exist"));
    }
    doc.conn
        .execute(
            "UPDATE document SET current_commit = ?1, updated_at = ?2",
            params![id, now_ms()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn vcs_save_checkpoint(
    state: tauri::State<'_, VcsState>,
    doc_id: String,
    current_commit: String,
    source: Value,
    target: Value,
    chats: Value,
) -> Result<(), String> {
    let mut guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_mut()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.conn
        .execute(
            "UPDATE document SET
                 source_json = ?1, target_json = ?2, chats_json = ?3,
                 current_commit = ?4, checkpoint_commit = ?4, updated_at = ?5",
            params![
                serde_json::to_string(&source).unwrap_or_else(|_| "null".into()),
                serde_json::to_string(&target).unwrap_or_else(|_| "null".into()),
                serde_json::to_string(&chats).unwrap_or_else(|_| "[]".into()),
                current_commit,
                now_ms()
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn plan_path_conn(conn: &Connection, from: &str, to: &str) -> Result<Vec<PathSegment>, String> {
    let mut stmt = conn
        .prepare("SELECT id, parent_id, depth FROM commits")
        .map_err(|e| e.to_string())?;
    let mut parents: HashMap<String, Option<String>> = HashMap::new();
    let mut depths: HashMap<String, i64> = HashMap::new();
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (id, parent, depth) = row.map_err(|e| e.to_string())?;
        parents.insert(id.clone(), parent);
        depths.insert(id, depth);
    }
    drop(stmt);

    if from == to {
        return Ok(Vec::new());
    }
    if !parents.contains_key(from) {
        return Err(format!("commit {from} does not exist"));
    }
    if !parents.contains_key(to) {
        return Err(format!("commit {to} does not exist"));
    }

    let parent_of = |id: &str| -> Option<String> { parents.get(id).and_then(|p| p.clone()) };

    let mut a = from.to_string();
    let mut b = to.to_string();
    let mut da = *depths.get(&a).unwrap_or(&0);
    let mut db = *depths.get(&b).unwrap_or(&0);
    while da > db {
        a = parent_of(&a).ok_or_else(|| "broken parent chain".to_string())?;
        da -= 1;
    }
    while db > da {
        b = parent_of(&b).ok_or_else(|| "broken parent chain".to_string())?;
        db -= 1;
    }
    while a != b {
        a = parent_of(&a).ok_or_else(|| "broken parent chain".to_string())?;
        b = parent_of(&b).ok_or_else(|| "broken parent chain".to_string())?;
    }
    let lca = a;

    let mut backward: Vec<String> = Vec::new();
    let mut cursor = from.to_string();
    while cursor != lca {
        backward.push(cursor.clone());
        cursor = parent_of(&cursor).ok_or_else(|| "broken parent chain".to_string())?;
    }

    let mut forward_rev: Vec<String> = Vec::new();
    let mut cursor = to.to_string();
    while cursor != lca {
        forward_rev.push(cursor.clone());
        cursor = parent_of(&cursor).ok_or_else(|| "broken parent chain".to_string())?;
    }
    forward_rev.reverse();

    let mut result = Vec::with_capacity(backward.len() + forward_rev.len());
    for (direction, ids) in [("backward", backward), ("forward", forward_rev)] {
        for id in ids {
            let (source, target): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT source_steps, target_steps FROM commits WHERE id = ?1",
                    params![id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|e| e.to_string())?;
            result.push(PathSegment {
                id,
                direction: direction.into(),
                source: source.and_then(|s| serde_json::from_str(&s).ok()),
                target: target.and_then(|s| serde_json::from_str(&s).ok()),
            });
        }
    }
    Ok(result)
}

#[tauri::command(async)]
pub fn vcs_plan_path(
    state: tauri::State<'_, VcsState>,
    doc_id: String,
    from: String,
    to: String,
) -> Result<Vec<PathSegment>, String> {
    let guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    plan_path_conn(&doc.conn, &from, &to)
}

#[tauri::command(async)]
pub fn vcs_count(state: tauri::State<'_, VcsState>, doc_id: String) -> Result<i64, String> {
    let guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    let count: i64 = doc
        .conn
        .query_row(
            "SELECT COUNT(*) FROM commits WHERE kind != 'root'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command(async)]
pub fn vcs_save_as(
    state: tauri::State<'_, VcsState>,
    doc_id: String,
    path: String,
) -> Result<OpenSnapshot, String> {
    let mut guard = take_open(&state, &doc_id)?;
    let doc = guard
        .as_mut()
        .ok_or_else(|| "no document is open".to_string())?;

    let target = PathBuf::from(&path);
    if doc.path.as_ref().map(|p| p == &target).unwrap_or(false) {
        return snapshot(doc);
    }
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| format!("failed to replace {path}: {e}"))?;
    }
    doc.conn
        .execute("VACUUM INTO ?1", params![path])
        .map_err(|e| format!("failed to save {path}: {e}"))?;

    let mut next = open_existing(&path)?;
    // Preserve the frontend-facing document id so callers do not need to
    // re-open anything.
    next.id = doc.id.clone();
    let result = snapshot(&next)?;
    *guard = Some(next);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn add_delta(conn: &Connection, id: &str, parent: &str, depth: i64) {
        conn.execute(
            "INSERT INTO commits (id, kind, parent_id, timestamp, depth)
             VALUES (?1, 'delta', ?2, ?3, ?4)",
            params![id, parent, depth, depth],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO commit_parent (child_id, parent_id, position) VALUES (?1, ?2, 0)",
            params![id, parent],
        )
        .unwrap();
    }

    #[test]
    fn schema_and_paths() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_root(&conn, "initial", 0).unwrap();
        add_delta(&conn, "c1", "initial", 1);
        add_delta(&conn, "c2", "c1", 2);
        add_delta(&conn, "b1", "initial", 1);

        let summaries = load_summaries(&conn).unwrap();
        assert_eq!(summaries.len(), 4);
        assert_eq!(summaries[0].kind, "root");

        let back = plan_path_conn(&conn, "c2", "c1").unwrap();
        assert_eq!(
            back.iter()
                .map(|s| (s.id.as_str(), s.direction.as_str()))
                .collect::<Vec<_>>(),
            vec![("c2", "backward")]
        );

        let forward = plan_path_conn(&conn, "c1", "c2").unwrap();
        assert_eq!(
            forward
                .iter()
                .map(|s| (s.id.as_str(), s.direction.as_str()))
                .collect::<Vec<_>>(),
            vec![("c2", "forward")]
        );

        let branch = plan_path_conn(&conn, "c2", "b1").unwrap();
        assert_eq!(
            branch
                .iter()
                .map(|s| (s.id.as_str(), s.direction.as_str()))
                .collect::<Vec<_>>(),
            vec![("c2", "backward"), ("c1", "backward"), ("b1", "forward")]
        );

        assert!(plan_path_conn(&conn, "c2", "c2").unwrap().is_empty());
        assert!(plan_path_conn(&conn, "missing", "c1").is_err());
    }

    #[test]
    fn legacy_import_repairs_and_indexes() {
        use serde_json::json;

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        let document = json!({
            "version": 1,
            "source": null,
            "target": null,
            "currentCommit": "c2",
            "chats": [],
            "vc": {
                "version": 1,
                "initialCommit": "initial",
                "commits": [
                    { "type": "delta", "id": "c1", "parent": "initial",
                      "attrs": { "timestamp": 1 },
                      "source": { "steps": [], "invertedSteps": [] } },
                    { "type": "delta", "id": "c2", "parent": "c1",
                      "attrs": { "timestamp": 2 },
                      "source": { "steps": [], "invertedSteps": [] } },
                    // Unknown parent must be repaired to the initial commit.
                    { "type": "delta", "id": "orphan", "parent": "missing",
                      "attrs": { "timestamp": 3 } }
                ]
            }
        });

        let (doc_id, initial) = import_document_into(&conn, &document).unwrap();
        assert!(!doc_id.is_empty());
        assert_eq!(initial, "initial");

        let current: String = conn
            .query_row("SELECT current_commit FROM document", [], |r| r.get(0))
            .unwrap();
        assert_eq!(current, "c2");

        let summaries = load_summaries(&conn).unwrap();
        assert_eq!(summaries.len(), 4);
        assert_eq!(
            summaries.iter().map(|s| s.depth).collect::<Vec<_>>(),
            vec![0, 1, 2, 1]
        );

        let (child_count, first_child): (i64, String) = conn
            .query_row(
                "SELECT child_count, first_child_id FROM commits WHERE id = 'initial'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(child_count, 2);
        assert_eq!(first_child, "c1");

        let path = plan_path_conn(&conn, "c2", "orphan").unwrap();
        assert_eq!(
            path.iter()
                .map(|s| (s.id.as_str(), s.direction.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("c2", "backward"),
                ("c1", "backward"),
                ("orphan", "forward")
            ]
        );
    }

    #[test]
    fn append_updates_counters_and_current() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_root(&conn, "initial", 0).unwrap();
        insert_document(
            &conn,
            "doc",
            "initial",
            &Value::Null,
            &Value::Null,
            &Value::Array(vec![]),
            0,
        )
        .unwrap();

        let first = NewCommit {
            id: "c1".into(),
            parent: "initial".into(),
            attrs: CommitAttrs {
                timestamp: 1,
                ..Default::default()
            },
            source: Some(serde_json::json!({ "steps": [], "invertedSteps": [] })),
            target: None,
        };
        let summary = append_commit_into(&conn, first).unwrap();
        assert_eq!(summary.id, "c1");
        assert_eq!(summary.depth, 1);

        let second = NewCommit {
            id: "c2".into(),
            parent: "c1".into(),
            attrs: CommitAttrs {
                timestamp: 2,
                ..Default::default()
            },
            source: None,
            target: Some(serde_json::json!({ "steps": [], "invertedSteps": [] })),
        };
        let summary = append_commit_into(&conn, second).unwrap();
        assert_eq!(summary.depth, 2);

        let (children, first_child): (i64, String) = conn
            .query_row(
                "SELECT child_count, first_child_id FROM commits WHERE id = 'initial'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((children, first_child.as_str()), (1, "c1"));

        let current: String = conn
            .query_row("SELECT current_commit FROM document", [], |r| r.get(0))
            .unwrap();
        assert_eq!(current, "c2");
    }

    #[test]
    fn recursive_depth_update() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        insert_root(&conn, "initial", 0).unwrap();
        add_delta(&conn, "c1", "initial", 1);
        add_delta(&conn, "c2", "c1", 2);
        add_delta(&conn, "c3", "c2", 3);

        // Same statement used by vcs_import after inserting all rows.
        conn.execute(
            "WITH RECURSIVE d(id, depth) AS (
                 SELECT id, 0 FROM commits WHERE id = ?1
                 UNION ALL
                 SELECT c.id, d.depth + 1 FROM commits c JOIN d ON c.parent_id = d.id
             )
             UPDATE commits SET depth = COALESCE((SELECT depth FROM d WHERE d.id = commits.id), 0)",
            params!["initial"],
        )
        .unwrap();

        let depths: Vec<(String, i64)> = {
            let mut stmt = conn
                .prepare("SELECT id, depth FROM commits ORDER BY seq")
                .unwrap();
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
            rows.map(|r| r.unwrap()).collect()
        };
        assert_eq!(
            depths,
            vec![
                ("initial".into(), 0),
                ("c1".into(), 1),
                ("c2".into(), 2),
                ("c3".into(), 3),
            ]
        );
    }
}
