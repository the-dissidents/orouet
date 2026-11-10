use rusqlite::{params, Connection};
use serde_json::Value;

use super::db::{ensure_schema, insert_document, insert_root, load_summaries};
use super::document::{append_commit_into, import_document_into};
use super::model::{CommitAttrs, ImportCommit, ImportDocument, NewCommit, VcsCommit};
use super::path::plan_path;

fn add_delta(conn: &Connection, id: &str, parent: &str) {
    conn.execute(
        "INSERT INTO commits (id, kind, parent_id, timestamp)
             VALUES (?1, 'delta', ?2, 0)",
        params![id, parent],
    )
    .unwrap();
}

#[test]
fn schema_and_paths() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_schema(&conn).unwrap();
    insert_root(&conn, "initial", 0).unwrap();
    add_delta(&conn, "c1", "initial");
    add_delta(&conn, "c2", "c1");
    add_delta(&conn, "b1", "initial");

    let summaries = load_summaries(&conn).unwrap();
    assert_eq!(summaries.len(), 4);
    assert!(matches!(summaries[0], VcsCommit::Root { .. }));

    let back = plan_path(&conn, "c2", "c1").unwrap();
    assert_eq!(
        back.iter()
            .map(|s| (s.id.as_str(), s.direction.as_str()))
            .collect::<Vec<_>>(),
        vec![("c2", "backward")]
    );

    let forward = plan_path(&conn, "c1", "c2").unwrap();
    assert_eq!(
        forward
            .iter()
            .map(|s| (s.id.as_str(), s.direction.as_str()))
            .collect::<Vec<_>>(),
        vec![("c2", "forward")]
    );

    let branch = plan_path(&conn, "c2", "b1").unwrap();
    assert_eq!(
        branch
            .iter()
            .map(|s| (s.id.as_str(), s.direction.as_str()))
            .collect::<Vec<_>>(),
        vec![("c2", "backward"), ("c1", "backward"), ("b1", "forward")]
    );

    assert!(plan_path(&conn, "c2", "c2").unwrap().is_empty());
    assert!(plan_path(&conn, "missing", "c1").is_err());
}

#[test]
fn import_bulk_inserts_and_indexes() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_schema(&conn).unwrap();
    let commit = |id: &str, parent: &str, timestamp: i64| ImportCommit {
        id: id.into(),
        parent: parent.into(),
        kind: "delta".into(),
        attrs: CommitAttrs {
            timestamp,
            ..Default::default()
        },
        source: Some(serde_json::json!({ "steps": [], "invertedSteps": [] })),
        target: None,
    };
    let document = ImportDocument {
        initial_commit: "initial".into(),
        current_commit: "c2".into(),
        source: Value::Null,
        target: Value::Null,
        chats: Value::Array(vec![]),
        commits: vec![
            commit("c1", "initial", 1),
            commit("c2", "c1", 2),
            commit("b1", "initial", 3),
        ],
    };

    let (doc_id, initial) = import_document_into(&conn, &document).unwrap();
    assert!(!doc_id.is_empty());
    assert_eq!(initial, "initial");

    let current: String = conn
        .query_row("SELECT current_commit FROM document", [], |r| r.get(0))
        .unwrap();
    assert_eq!(current, "c2");

    let summaries = load_summaries(&conn).unwrap();
    assert_eq!(summaries.len(), 4);

    let path = plan_path(&conn, "c2", "b1").unwrap();
    assert_eq!(
        path.iter()
            .map(|s| (s.id.as_str(), s.direction.as_str()))
            .collect::<Vec<_>>(),
        vec![("c2", "backward"), ("c1", "backward"), ("b1", "forward")]
    );
}

#[test]
fn import_rejects_unknown_parent() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_schema(&conn).unwrap();
    let document = ImportDocument {
        initial_commit: "initial".into(),
        current_commit: "initial".into(),
        source: Value::Null,
        target: Value::Null,
        chats: Value::Array(vec![]),
        commits: vec![ImportCommit {
            id: "orphan".into(),
            parent: "missing".into(),
            kind: "delta".into(),
            attrs: CommitAttrs::default(),
            source: None,
            target: None,
        }],
    };

    assert!(import_document_into(&conn, &document).is_err());
}

#[test]
fn append_updates_current() {
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
    assert!(matches!(summary, VcsCommit::Delta { id, .. } if id == "c1"));

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
    assert!(matches!(summary, VcsCommit::Delta { id, .. } if id == "c2"));

    let current: String = conn
        .query_row("SELECT current_commit FROM document", [], |r| r.get(0))
        .unwrap();
    assert_eq!(current, "c2");
}

#[test]
fn commit_serializes_as_tagged_union() {
    let commit = VcsCommit::Delta {
        id: "c1".into(),
        parent: "initial".into(),
        attrs: CommitAttrs {
            timestamp: 1,
            ..Default::default()
        },
        seq: 2,
    };
    let value = serde_json::to_value(commit).unwrap();

    assert_eq!(value["type"], "delta");
    assert_eq!(value["id"], "c1");
    assert_eq!(value["parent"], "initial");
    assert_eq!(value["seq"], 2);
}
