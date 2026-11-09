use serde::{Deserialize, Serialize};
use serde_json::Value;

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

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommit {
    pub id: String,
    pub parent: String,
    pub kind: String,
    pub attrs: CommitAttrs,
    #[serde(default)]
    pub source: Option<Value>,
    #[serde(default)]
    pub target: Option<Value>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportDocument {
    pub initial_commit: String,
    pub current_commit: String,
    pub source: Value,
    pub target: Value,
    pub chats: Value,
    pub commits: Vec<ImportCommit>,
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
