#![allow(clippy::missing_errors_doc)]

use std::sync::{Mutex, MutexGuard};

use serde_json::Value;
use tauri::State;

use super::document::VcsDocument;
use super::model::{ImportDocument, NewCommit, OpenSnapshot, PathSegment, UpdateAttrs, VcsCommit};

/// IPC-side state for the single currently-open document.
pub struct VcsState {
    open: Mutex<Option<VcsDocument>>,
}

impl Default for VcsState {
    fn default() -> Self {
        Self {
            open: Mutex::new(None),
        }
    }
}

fn take_open<'a>(
    state: &'a VcsState,
    doc_id: &str,
) -> Result<MutexGuard<'a, Option<VcsDocument>>, String> {
    let guard = state
        .open
        .lock()
        .map_err(|_| "VCS state poisoned".to_string())?;
    match guard.as_ref() {
        Some(doc) if doc.id() == doc_id => Ok(guard),
        Some(_) => Err("a different document is open".into()),
        None => Err("no document is open".into()),
    }
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_create(
    state: State<'_, VcsState>,
    path: Option<String>,
    source: Value,
    target: Value,
    chats: Value,
) -> Result<OpenSnapshot, String> {
    let doc = VcsDocument::create(path, &source, &target, &chats)?;
    let result = doc.snapshot()?;
    *state.open.lock().map_err(|_| "VCS state poisoned")? = Some(doc);
    Ok(result)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_open(state: State<'_, VcsState>, path: &str) -> Result<OpenSnapshot, String> {
    let doc = VcsDocument::open(path)?;
    let result = doc.snapshot()?;
    *state.open.lock().map_err(|_| "VCS state poisoned")? = Some(doc);
    Ok(result)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_import(
    state: State<'_, VcsState>,
    document: ImportDocument,
) -> Result<OpenSnapshot, String> {
    let doc = VcsDocument::import(&document)?;
    let result = doc.snapshot()?;
    *state.open.lock().map_err(|_| "VCS state poisoned")? = Some(doc);
    Ok(result)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_append(
    state: State<'_, VcsState>,
    doc_id: &str,
    commit: NewCommit,
) -> Result<VcsCommit, String> {
    let guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.append(commit)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_update_attrs(
    state: State<'_, VcsState>,
    doc_id: &str,
    id: &str,
    attrs: UpdateAttrs,
) -> Result<(), String> {
    let guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.update_attrs(id, attrs)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_set_current(state: State<'_, VcsState>, doc_id: &str, id: &str) -> Result<(), String> {
    let guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.set_current(id)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_save_checkpoint(
    state: State<'_, VcsState>,
    doc_id: &str,
    current_commit: &str,
    source: Value,
    target: Value,
    chats: Value,
) -> Result<(), String> {
    let guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.save_checkpoint(current_commit, &source, &target, &chats)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_plan_path(
    state: State<'_, VcsState>,
    doc_id: &str,
    from: &str,
    to: &str,
) -> Result<Vec<PathSegment>, String> {
    let guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.plan_path(from, to)
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_count(state: State<'_, VcsState>, doc_id: &str) -> Result<i64, String> {
    let guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_ref()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.count()
}

#[tauri::command(async)]
#[allow(clippy::needless_pass_by_value)]
pub fn vcs_save_as(
    state: State<'_, VcsState>,
    doc_id: &str,
    path: &str,
) -> Result<OpenSnapshot, String> {
    let mut guard = take_open(&state, doc_id)?;
    let doc = guard
        .as_mut()
        .ok_or_else(|| "no document is open".to_string())?;
    doc.save_as(path)
}
