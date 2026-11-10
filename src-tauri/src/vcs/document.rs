#![allow(clippy::missing_errors_doc)]

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::path::PathBuf;

use super::db::{
    document_exists, ensure_schema, insert_document, insert_root, load_summaries, new_id, now_ms,
};
use super::model::{ImportDocument, NewCommit, OpenSnapshot, PathSegment, UpdateAttrs, VcsCommit};
use super::path::plan_path;

/// A single version-controlled document backed by SQLite.
pub struct VcsDocument {
    id: String,
    path: Option<PathBuf>,
    initial_commit: i64,
    conn: Connection,
}

impl VcsDocument {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn create(
        path: Option<String>,
        source: &Value,
        target: &Value,
        chats: &Value,
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
        let timestamp = now_ms();
        let initial = insert_root(&conn, timestamp).map_err(|e| e.to_string())?;
        insert_document(&conn, &id, initial, source, target, chats, timestamp)
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

    /// Import normalized legacy history into an in-memory SQLite document.
    pub fn import(document: &ImportDocument) -> Result<Self, String> {
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
                        r.get::<_, i64>(3)?,
                        r.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "document row is missing".to_string())?;

        let next_seq: i64 = self
            .conn
            .query_row("SELECT COALESCE(MAX(seq), 0) + 1 FROM commits", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        let parse = |s: &str| serde_json::from_str::<Value>(s).unwrap_or(Value::Null);
        Ok(OpenSnapshot {
            doc_id: self.id.clone(),
            path: self.path.as_ref().map(|p| p.to_string_lossy().to_string()),
            initial_commit: self.initial_commit.to_string(),
            current_commit: row.3.to_string(),
            checkpoint_commit: row.4.to_string(),
            next_seq,
            source: parse(&row.0),
            target: parse(&row.1),
            chats: parse(&row.2),
            summaries: load_summaries(&self.conn).map_err(|e| e.to_string())?,
        })
    }

    pub fn append(&self, commit: NewCommit) -> Result<VcsCommit, String> {
        append_commit_into(&self.conn, commit)
    }

    pub fn update_attrs(&self, id: &str, attrs: UpdateAttrs) -> Result<(), String> {
        let seq = parse_seq(id)?;
        let conn = &self.conn;
        let (label, current_cluster, file_saved, selection_set) = conn
            .query_row(
                "SELECT label, current_cluster, file_saved, selection_set
                 FROM commits WHERE seq = ?1",
                params![seq],
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
             WHERE seq = ?5",
            params![
                attrs.label.or(label),
                attrs.current_cluster.or(current_cluster),
                i64::from(attrs.file_saved.unwrap_or(file_saved != 0)),
                i64::from(attrs.selection_set.unwrap_or(selection_set != 0)),
                seq
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_current(&self, id: &str) -> Result<(), String> {
        let seq = parse_seq(id)?;
        let exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM commits WHERE seq = ?1",
                params![seq],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err(format!("commit {id} does not exist"));
        }
        self.conn
            .execute(
                "UPDATE document SET current_commit = ?1, updated_at = ?2",
                params![seq, now_ms()],
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
        let seq = parse_seq(current_commit)?;
        self.conn
            .execute(
                "UPDATE document SET
                     source_json = ?1, target_json = ?2, chats_json = ?3,
                     current_commit = ?4, checkpoint_commit = ?4, updated_at = ?5",
                params![
                    serde_json::to_string(source).unwrap_or_else(|_| "null".into()),
                    serde_json::to_string(target).unwrap_or_else(|_| "null".into()),
                    serde_json::to_string(chats).unwrap_or_else(|_| "[]".into()),
                    seq,
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
    let initial: i64 = conn
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
    document: &ImportDocument,
) -> Result<(String, i64), String> {
    let initial = document.initial_commit.as_str();
    let timestamp = now_ms();
    let root = insert_root(conn, timestamp).map_err(|e| e.to_string())?;

    let mut seqs: HashMap<&str, i64> = HashMap::new();
    seqs.insert(initial, root);
    let mut next = root + 1;
    for commit in &document.commits {
        if commit.id == initial {
            continue;
        }
        seqs.insert(commit.id.as_str(), next);
        next += 1;
    }

    // The frontend has already deduplicated ids and repaired unknown parents.
    // Validate the payload so a malformed import fails loudly instead of
    // silently producing a disconnected graph.
    for commit in &document.commits {
        if commit.id == initial {
            continue;
        }
        if commit.kind != "delta" && commit.kind != "merge" {
            return Err(format!(
                "commit {} has invalid kind {}",
                commit.id, commit.kind
            ));
        }
        let seq = seqs[commit.id.as_str()];
        let parent = seqs
            .get(commit.parent.as_str())
            .copied()
            .ok_or_else(|| format!("commit {} has unknown parent {}", commit.id, commit.parent))?;
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
                (seq, kind, parent_id, timestamp, label, current_cluster,
                 file_saved, selection_set, source_steps, target_steps)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                seq,
                commit.kind,
                parent,
                commit.attrs.timestamp,
                commit.attrs.label,
                commit.attrs.current_cluster,
                i64::from(commit.attrs.file_saved),
                i64::from(commit.attrs.selection_set),
                source_steps,
                target_steps
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let current = seqs
        .get(document.current_commit.as_str())
        .copied()
        .or_else(|| seqs.values().max().copied())
        .unwrap_or(root);

    let doc_id = new_id();
    conn.execute(
        "INSERT INTO document
            (id, initial_commit, current_commit, checkpoint_commit,
             source_json, target_json, chats_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            doc_id,
            root,
            current,
            serde_json::to_string(&document.source).unwrap_or_else(|_| "null".into()),
            serde_json::to_string(&document.target).unwrap_or_else(|_| "null".into()),
            serde_json::to_string(&document.chats).unwrap_or_else(|_| "[]".into()),
            timestamp
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok((doc_id, root))
}

pub(super) fn append_commit_into(
    conn: &Connection,
    commit: NewCommit,
) -> Result<VcsCommit, String> {
    let seq = parse_seq(&commit.id)?;
    let parent = parse_seq(&commit.parent)?;
    let parent_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM commits WHERE seq = ?1)",
            params![parent],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !parent_exists {
        return Err(format!("parent commit {} does not exist", commit.parent));
    }

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
            (seq, kind, parent_id, timestamp, label, current_cluster,
             file_saved, selection_set, source_steps, target_steps)
         VALUES (?1, 'delta', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            seq,
            parent,
            commit.attrs.timestamp,
            commit.attrs.label,
            commit.attrs.current_cluster,
            i64::from(commit.attrs.file_saved),
            i64::from(commit.attrs.selection_set),
            source_steps,
            target_steps
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE document SET current_commit = ?1, updated_at = ?2",
        params![seq, now_ms()],
    )
    .map_err(|e| e.to_string())?;

    Ok(VcsCommit::Delta {
        id: seq.to_string(),
        parent: parent.to_string(),
        attrs: commit.attrs,
        seq,
    })
}

fn parse_seq(id: &str) -> Result<i64, String> {
    id.parse().map_err(|_| format!("invalid commit id {id}"))
}
