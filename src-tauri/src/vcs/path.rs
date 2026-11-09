use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection};
use serde_json::Value;

use super::model::PathSegment;

pub(super) fn plan_path(
    conn: &Connection,
    from: &str,
    to: &str,
) -> Result<Vec<PathSegment>, String> {
    let mut stmt = conn
        .prepare("SELECT id, parent_id FROM commits")
        .map_err(|e| e.to_string())?;
    let mut parents: HashMap<String, Option<String>> = HashMap::new();
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (id, parent) = row.map_err(|e| e.to_string())?;
        parents.insert(id, parent);
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

    // Walk the `from` side once and collect its ancestors. Then walk `to`
    // upwards until the paths meet. This is O(depth) and needs no stored
    // depth column.
    let mut ancestors: HashSet<String> = HashSet::new();
    let mut cursor = from.to_string();
    loop {
        ancestors.insert(cursor.clone());
        match parent_of(&cursor) {
            Some(parent) => cursor = parent,
            None => break,
        }
    }

    let mut cursor = to.to_string();
    let lca = loop {
        if ancestors.contains(&cursor) {
            break cursor;
        }
        cursor = parent_of(&cursor).ok_or_else(|| "commits are not connected".to_string())?;
    };

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
                source: source.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
                target: target.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
            });
        }
    }
    Ok(result)
}
