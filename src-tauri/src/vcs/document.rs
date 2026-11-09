use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::db::{
    document_exists, ensure_schema, insert_document, insert_root, load_summaries, new_id, now_ms,
};
use super::model::{CommitAttrs, CommitSummary, NewCommit, OpenSnapshot, PathSegment, UpdateAttrs};
use super::path::plan_path;

/// A single version-controlled document backed by SQLite.
///
/// This type deliberately has no Tauri dependency: it can be opened, queried
/// and written from tests, workers or a future CLI. The IPC layer lives in
/// `commands.rs`.
pub struct VcsDocument {
    id: String,
    path: Option<PathBuf>,
    initial_commit: String,
    conn: Connection,
}

impl VcsDocument {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn create(
        path: Option<String>,
        source: Value,
        target: Value,
        chats: Value,
    ) -> Result<Self, String> {
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

        Ok(Self {
            id,
            path: path.map(PathBuf::from),
            initial_commit: initial,
            conn,
        })
    }

    pub fn open(path: &str) -> Result<Self, String> {
        open_existing(path)
    }

    /// Import a version-1 `SerializedDocumentContext` JSON object into an
    /// in-memory SQLite document. This keeps `.orz` files readable while the
    /// runtime uses SQLite everywhere.
    pub fn import(document: &Value) -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        ensure_schema(&conn).map_err(|e| e.to_string())?;
        let (id, initial) = import_document_into(&conn, document)?;

        Ok(Self {
            id,
            path: None,
            initial_commit: initial,
            conn,
        })
    }

    pub fn snapshot(&self) -> Result<OpenSnapshot, String> {
        let row = self
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
            doc_id: self.id.clone(),
            path: self.path.as_ref().map(|p| p.to_string_lossy().to_string()),
            initial_commit: self.initial_commit.clone(),
            current_commit: row.3,
            checkpoint_commit: row.4,
            source: parse(&row.0),
            target: parse(&row.1),
            chats: parse(&row.2),
            summaries: load_summaries(&self.conn).map_err(|e| e.to_string())?,
        })
    }

    pub fn append(&self, commit: NewCommit) -> Result<CommitSummary, String> {
        append_commit_into(&self.conn, commit)
    }

    pub fn update_attrs(&self, id: &str, attrs: UpdateAttrs) -> Result<(), String> {
        let conn = &self.conn;
        let (label, current_cluster, file_saved, selection_set) = conn
            .query_row(
                "SELECT label, current_cluster, file_saved, selection_set
                 FROM commits WHERE id = ?1",
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
            "UPDATE commits SET label = ?1, current_cluster = ?2,
                                file_saved = ?3, selection_set = ?4
             WHERE id = ?5",
            params![
                attrs.label.or(label),
                attrs.current_cluster.or(current_cluster),
                i64::from(attrs.file_saved.unwrap_or(file_saved != 0)),
                i64::from(attrs.selection_set.unwrap_or(selection_set != 0)),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_current(&self, id: &str) -> Result<(), String> {
        let exists: i64 = self
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
        self.conn
            .execute(
                "UPDATE document SET current_commit = ?1, updated_at = ?2",
                params![id, now_ms()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn save_checkpoint(
        &self,
        current_commit: &str,
        source: &Value,
        target: &Value,
        chats: &Value,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE document SET
                     source_json = ?1, target_json = ?2, chats_json = ?3,
                     current_commit = ?4, checkpoint_commit = ?4, updated_at = ?5",
                params![
                    serde_json::to_string(source).unwrap_or_else(|_| "null".into()),
                    serde_json::to_string(target).unwrap_or_else(|_| "null".into()),
                    serde_json::to_string(chats).unwrap_or_else(|_| "[]".into()),
                    current_commit,
                    now_ms()
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn plan_path(&self, from: &str, to: &str) -> Result<Vec<PathSegment>, String> {
        plan_path(&self.conn, from, to)
    }

    pub fn count(&self) -> Result<i64, String> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM commits WHERE kind != 'root'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }

    pub fn save_as(&mut self, path: &str) -> Result<OpenSnapshot, String> {
        let target = PathBuf::from(path);
        if self.path.as_ref().is_some_and(|p| p == &target) {
            return self.snapshot();
        }
        if target.exists() {
            std::fs::remove_file(&target).map_err(|e| format!("failed to replace {path}: {e}"))?;
        }
        self.conn
            .execute("VACUUM INTO ?1", params![path])
            .map_err(|e| format!("failed to save {path}: {e}"))?;

        let mut next = open_existing(path)?;
        // Preserve the frontend-facing document id so callers do not need to
        // re-open anything.
        next.id.clone_from(&self.id);
        let result = next.snapshot()?;
        *self = next;
        Ok(result)
    }
}

fn open_existing(path: &str) -> Result<VcsDocument, String> {
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
    Ok(VcsDocument {
        id: new_id(),
        path: Some(PathBuf::from(path)),
        initial_commit: initial,
        conn,
    })
}

pub(super) fn import_document_into(
    conn: &Connection,
    document: &Value,
) -> Result<(String, String), String> {
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
            .map_or_else(|| initial.clone(), str::to_string);
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
                i64::from(attrs.file_saved),
                i64::from(attrs.selection_set),
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

pub(super) fn append_commit_into(
    conn: &Connection,
    commit: NewCommit,
) -> Result<CommitSummary, String> {
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
            i64::from(commit.attrs.file_saved),
            i64::from(commit.attrs.selection_set),
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
