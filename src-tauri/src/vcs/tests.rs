use rusqlite::{params, Connection};
use serde_json::Value;

use super::db::{ensure_schema, insert_document, insert_root, load_summaries};
use super::document::{append_commit_into, import_document_into};
use super::model::{CommitAttrs, ImportCommit, ImportDocument, NewCommit};
use super::path::plan_path;

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

    // Same statement used by import_document_into after inserting all rows.
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
