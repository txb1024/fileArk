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

/// 整个被删除的项目（旧逻辑，磁盘文件夹原地保留，恢复时复用）
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

/// 项目内被删除的单个文件 / 文件夹（新增）。
/// 原文件已被移动到 trashed_files/{id}/{name}，恢复时再 move 回去。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrashedFile {
    pub id: String,
    pub name: String,
    /// 删除前所在的绝对路径（恢复时优先回到这里）
    pub original_path: String,
    /// 删除时移动到的回收站内部路径（绝对）
    pub trash_storage_path: String,
    pub is_directory: bool,
    pub size: i64,
    pub deleted_at: String,
    /// 可选：来自哪个项目（用于 UI 上显示「来源」）
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub category: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrashData {
    pub items: Vec<TrashItem>,
    /// 项目内被删除的文件 / 文件夹（新增字段，旧数据会缺，serde 默认填空）
    #[serde(default)]
    pub files: Vec<TrashedFile>,
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

// ── 搜索 ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileResult {
    pub name: String,
    pub path: String,
    pub project_name: String,
    pub category: String,
    pub size: i64,
    pub is_directory: bool,
}

// ── 便签 ────────────────────────────────────────────────────

/// 便签元数据。id 即相对路径（POSIX 分隔符），如 "工作/项目 A/周报.md"
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub id: String,
    pub name: String,
    pub parent: String,
    pub title: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub snippet: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 树节点：folder 或 note
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NoteTreeNode {
    #[serde(rename = "folder")]
    Folder {
        path: String,
        name: String,
        parent: String,
        children: Vec<NoteTreeNode>,
    },
    #[serde(rename = "note")]
    Note(NoteMeta),
}

/// 回收站项 — 含完整内容快照便于恢复
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrashedNote {
    pub trash_id: String,
    pub original_path: String,
    pub content: String,
    pub meta: NoteMeta,
    pub deleted_at: String,
}

/// 索引：path → meta 的缓存 + 回收站
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotesIndex {
    pub meta: std::collections::HashMap<String, NoteMeta>,
    pub trash: Vec<TrashedNote>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub parent: String,
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub parent: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteMetaInput {
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
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
