//! 共享数据模型，所有 Tauri Commands 的输入/输出结构

use serde::{Deserialize, Serialize};

// ── 项目 ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RecentFile {
    pub name: String,
    pub path: String,
    pub category: String,
    pub size: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(rename = "alias")]
    pub alias: String,
    pub tags: Vec<String>,
    pub path: String,
    pub pinned: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(rename = "lastOpenedAt")]
    pub last_opened_at: Option<String>,
    #[serde(rename = "recentFiles")]
    pub recent_files: Vec<RecentFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InboxItem {
    pub id: String,
    pub name: String,
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    pub size: i64,
    #[serde(rename = "modifiedAt")]
    pub modified_at: String,
    #[serde(rename = "recommendedProjectId")]
    pub recommended_project_id: Option<String>,
    #[serde(rename = "recommendedCategory")]
    pub recommended_category: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Activity {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Settings {
    #[serde(rename = "workspaceRoot")]
    pub workspace_root: String,
    pub categories: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AppData {
    pub projects: Vec<Project>,
    pub inbox: Vec<InboxItem>,
    pub activities: Vec<Activity>,
    pub settings: Settings,
}

// ── 分类文件 ────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CategoryFile {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: i64,
    #[serde(rename = "modifiedAt")]
    pub modified_at: String,
    pub children: Option<Vec<CategoryFile>>,
}

// ── 工作空间 ────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    #[serde(rename = "dataFile")]
    pub data_file: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WorkspaceRegistry {
    #[serde(rename = "activeWorkspaceId")]
    pub active_workspace_id: String,
    pub workspaces: Vec<WorkspaceMeta>,
}

// ── 回收站 ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrashItem {
    pub id: String,
    pub name: String,
    pub project_id: String,
    pub project_name: String,
    pub category: String,
    pub original_path: String,
    pub deleted_at: String,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct TrashData {
    pub items: Vec<TrashItem>,
}

// ── 预览 ────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PreviewInfo {
    pub name: String,
    pub ext: String,
    pub size: u64,
    pub is_text: bool,
    pub is_image: bool,
    #[serde(rename = "previewType")]
    pub preview_type: String,
}

// ── 输入 DTO ────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateProjectInput {
    pub name: String,
    pub alias: Option<String>,
    pub tags: Option<Vec<String>>,
    pub root: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OrganizeInput {
    #[serde(rename = "itemIds")]
    pub item_ids: Vec<String>,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub category: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AddFilesToCategoryInput {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub category: String,
    #[serde(rename = "filePaths")]
    pub file_paths: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateCategoryFolderInput {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub category: String,
    #[serde(rename = "folderName")]
    pub folder_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CopyFileInput {
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    #[serde(rename = "targetPath")]
    pub target_path: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MoveFileInput {
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    #[serde(rename = "targetPath")]
    pub target_path: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MigrateRootInput {
    pub old_root: String,
    pub new_root: String,
    pub migrate: bool,
}
