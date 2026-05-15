//! 数据持久化层

use crate::models::{AppData, NoteMeta, NoteTreeNode, NotesIndex, Project, TrashData, TrashedNote, WorkspaceMeta, WorkspaceRegistry};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

// ── 默认分类 ────────────────────────────────────────────────

pub fn default_categories() -> Vec<String> {
    vec![
        "01_需求".to_string(),
        "02_技術方案".to_string(),
        "03_功能設計".to_string(),
        "04_表格設計".to_string(),
        "05_接口文檔".to_string(),
        "06_會議記錄".to_string(),
        "07_測試資料".to_string(),
        "08_截圖素材".to_string(),
        "09_交付物".to_string(),
        "99_臨時資料".to_string(),
    ]
}

pub fn create_default_data() -> AppData {
    AppData {
        projects: vec![],
        inbox: vec![],
        activities: vec![],
        settings: crate::models::Settings {
            workspace_root: default_root().to_string_lossy().to_string(),
            categories: default_categories(),
        },
    }
}

fn default_root() -> std::path::PathBuf {
    home_dir().join("Documents").join("個人項目資料庫")
}

fn home_dir() -> std::path::PathBuf {
    std::env::var("USERPROFILE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("C:/Users"))
}

// ── Registry ───────────────────────────────────────────────

fn ensure_registry(app: &AppHandle) -> Result<(), String> {
    let registry_path = app_data_dir(app).join("registry.json");
    if registry_path.exists() {
        return Ok(());
    }

    let app_data_dir_path = app_data_dir(app);
    let old_data_path = app_data_dir_path.join("data.json");
    let id = Uuid::new_v4().to_string();
    let data_file = format!("workspace-{}.json", id);
    let data_path = app_data_dir_path.join(&data_file);

    if old_data_path.exists() {
        fs::rename(&old_data_path, &data_path).map_err(|e| e.to_string())?;
    } else {
        fs::create_dir_all(&app_data_dir_path).map_err(|e| e.to_string())?;
        let default_data = create_default_data();
        let json = serde_json::to_string_pretty(&default_data).map_err(|e| e.to_string())?;
        fs::write(&data_path, json).map_err(|e| e.to_string())?;
    }

    let registry = WorkspaceRegistry {
        active_workspace_id: id.clone(),
        workspaces: vec![WorkspaceMeta {
            id,
            name: "個人項目資料庫".to_string(),
            data_file,
            created_at: crate::utils::now_rfc3339(),
        }],
    };

    let json = serde_json::to_string_pretty(&registry).map_err(|e| e.to_string())?;
    fs::write(&registry_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_registry(app: &AppHandle) -> Result<WorkspaceRegistry, String> {
    ensure_registry(app)?;
    let registry_path = app_data_dir(app).join("registry.json");
    let raw = fs::read_to_string(&registry_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn write_registry(app: &AppHandle, registry: &WorkspaceRegistry) -> Result<(), String> {
    let registry_path = app_data_dir(app).join("registry.json");
    let json = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    fs::write(&registry_path, json).map_err(|e| e.to_string())
}

fn app_data_dir(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap()
}

fn workspace_data_path(app: &AppHandle, data_file: &str) -> std::path::PathBuf {
    app_data_dir(app).join(data_file)
}

fn trash_data_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_dir(app).join("trash.json")
}

// ── AppData ─────────────────────────────────────────────────

pub fn read_data(app: &AppHandle) -> Result<AppData, String> {
    let registry = read_registry(app)?;
    let active = registry
        .workspaces
        .iter()
        .find(|w| w.id == registry.active_workspace_id)
        .ok_or("找不到活跃工作空间")?;

    let data_path = workspace_data_path(app, &active.data_file);

    if !data_path.exists() {
        let default_data = create_default_data();
        let json = serde_json::to_string_pretty(&default_data).map_err(|e| e.to_string())?;
        fs::write(&data_path, json).map_err(|e| e.to_string())?;
        return Ok(default_data);
    }

    let raw = fs::read_to_string(&data_path).map_err(|e| e.to_string())?;
    match serde_json::from_str::<AppData>(&raw) {
        Ok(data) => Ok(data),
        Err(_) => {
            let backup_path = data_path.with_extension("json.corrupt");
            let _ = fs::rename(&data_path, &backup_path);
            let fallback = create_default_data();
            let json = serde_json::to_string_pretty(&fallback).map_err(|e| e.to_string())?;
            fs::write(&data_path, json).map_err(|e| e.to_string())?;
            Ok(fallback)
        }
    }
}

pub fn write_data(app: &AppHandle, data: &AppData) -> Result<(), String> {
    let registry = read_registry(app)?;
    let active = registry
        .workspaces
        .iter()
        .find(|w| w.id == registry.active_workspace_id)
        .ok_or("找不到活跃工作空间")?;
    let data_path = workspace_data_path(app, &active.data_file);
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&data_path, json).map_err(|e| e.to_string())
}

// ── Trash ───────────────────────────────────────────────────

pub fn read_trash(app: &AppHandle) -> Result<TrashData, String> {
    let path = trash_data_path(app);
    if !path.exists() {
        return Ok(TrashData::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn write_trash(app: &AppHandle, trash: &TrashData) -> Result<(), String> {
    let path = trash_data_path(app);
    let json = serde_json::to_string_pretty(trash).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ── Notes ─────────────────────────────────────────────────

pub fn notes_dir(app: &AppHandle) -> std::path::PathBuf {
    let dir = app_data_dir(app).join("notes");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn notes_assets_dir(app: &AppHandle) -> std::path::PathBuf {
    let dir = notes_dir(app).join("assets");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn save_note_asset_file(app: &AppHandle, data: &[u8], ext: &str) -> Result<std::path::PathBuf, String> {
    let dir = notes_assets_dir(app);
    let safe_ext = ext.trim_start_matches('.').to_lowercase();
    let safe_ext: String = safe_ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let safe_ext = if safe_ext.is_empty() { "bin".to_string() } else { safe_ext };
    let id = Uuid::new_v4().to_string();
    let filename = format!("{}.{}", id, safe_ext);
    let path = dir.join(&filename);
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path)
}

fn notes_index_path(app: &AppHandle) -> std::path::PathBuf {
    notes_dir(app).join("index.json")
}

pub fn read_notes_index(app: &AppHandle) -> Result<NotesIndex, String> {
    let path = notes_index_path(app);
    if !path.exists() {
        return Ok(NotesIndex::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn write_notes_index(app: &AppHandle, index: &NotesIndex) -> Result<(), String> {
    let path = notes_index_path(app);
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ── 路径工具 ──────────────────────────────────────────────

/// 把 std::path 路径转成 POSIX 风格相对路径（前端统一处理）
#[allow(dead_code)]
pub fn posix(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

/// 从相对 id 还原绝对路径
pub fn abs_from_id(app: &AppHandle, id: &str) -> std::path::PathBuf {
    notes_dir(app).join(id.replace('/', std::path::MAIN_SEPARATOR_STR))
}

/// 拼接 parent 与名字成相对路径，parent 为空时直接返回 name
pub fn join_rel(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{}/{}", parent.trim_end_matches('/'), name)
    }
}

/// 清理文件夹/文件名中的非法字符，限制长度
pub fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').to_string();
    let truncated: String = trimmed.chars().take(80).collect();
    if truncated.is_empty() { "未命名".to_string() } else { truncated }
}

/// 在 dir 下找一个不冲突的文件/文件夹名；冲突时追加 (1)(2)...
pub fn unique_name(dir: &Path, base: &str, ext: Option<&str>) -> String {
    let make = |n: usize| -> String {
        let stem = if n == 0 { base.to_string() } else { format!("{} ({})", base, n) };
        match ext {
            Some(e) => format!("{}.{}", stem, e),
            None => stem,
        }
    };
    for n in 0..1000 {
        let candidate = make(n);
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }
    make(0)
}

/// 递归扫描目录，构建 NoteTreeNode 树。跳过 assets/、隐藏文件、index.json。
/// parent 是当前目录相对 notes_root 的 POSIX 路径（根目录传 ""）
pub fn scan_tree(app: &AppHandle, dir: &Path, parent: &str, index: &NotesIndex) -> Vec<NoteTreeNode> {
    let mut folders: Vec<NoteTreeNode> = vec![];
    let mut notes: Vec<NoteTreeNode> = vec![];

    let entries = match fs::read_dir(dir) {
        Ok(it) => it,
        Err(_) => return vec![],
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "assets" || name == "index.json" {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            let rel = join_rel(parent, &name);
            let children = scan_tree(app, &path, &rel, index);
            folders.push(NoteTreeNode::Folder {
                path: rel.clone(),
                name,
                parent: parent.to_string(),
                children,
            });
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let rel = join_rel(parent, &name);
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&name)
                .to_string();
            let meta = index.meta.get(&rel).cloned().unwrap_or_else(|| {
                let now = crate::utils::now_rfc3339();
                NoteMeta {
                    id: rel.clone(),
                    name: stem.clone(),
                    parent: parent.to_string(),
                    title: stem.clone(),
                    tags: vec![],
                    pinned: false,
                    snippet: String::new(),
                    created_at: now.clone(),
                    updated_at: now,
                }
            });
            notes.push(NoteTreeNode::Note(meta));
        }
    }

    // folder 优先，置顶笔记其次，按名称排序
    folders.sort_by(|a, b| match (a, b) {
        (NoteTreeNode::Folder { name: an, .. }, NoteTreeNode::Folder { name: bn, .. }) => {
            an.to_lowercase().cmp(&bn.to_lowercase())
        }
        _ => std::cmp::Ordering::Equal,
    });
    notes.sort_by(|a, b| match (a, b) {
        (NoteTreeNode::Note(am), NoteTreeNode::Note(bm)) => match (am.pinned, bm.pinned) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => bm.updated_at.cmp(&am.updated_at),
        },
        _ => std::cmp::Ordering::Equal,
    });

    folders.into_iter().chain(notes).collect()
}

/// 启动时一次性清理：旧扁平 {uuid}.md 全删（用户已同意推倒）
pub fn migrate_old_notes_if_needed(app: &AppHandle) -> Result<(), String> {
    let root = notes_dir(app);
    let entries = match fs::read_dir(&root) {
        Ok(it) => it,
        Err(_) => return Ok(()),
    };
    let mut migrated = false;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".md") {
            continue;
        }
        let stem = name.trim_end_matches(".md");
        // 旧扁平存储：根目录下的 UUID 命名 .md 文件
        if Uuid::parse_str(stem).is_ok() {
            let _ = fs::remove_file(entry.path());
            migrated = true;
        }
    }
    if migrated {
        // 清掉旧索引格式
        let idx = notes_index_path(app);
        let _ = fs::remove_file(idx);
    }
    Ok(())
}

// ── 索引 I/O ──────────────────────────────────────────────

pub fn read_note_content(app: &AppHandle, id: &str) -> Result<String, String> {
    let path = abs_from_id(app, id);
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn write_note_content(app: &AppHandle, id: &str, content: &str) -> Result<(), String> {
    let path = abs_from_id(app, id);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

// ── 增删改 ────────────────────────────────────────────────

pub fn create_note_entry(app: &AppHandle, parent: &str, name: Option<&str>) -> Result<NoteMeta, String> {
    let parent = parent.trim_matches('/').to_string();
    let parent_abs = if parent.is_empty() { notes_dir(app) } else { abs_from_id(app, &parent) };
    if !parent_abs.exists() {
        fs::create_dir_all(&parent_abs).map_err(|e| e.to_string())?;
    }
    let base = name.map(sanitize_name).unwrap_or_else(|| "未命名便签".to_string());
    let filename = unique_name(&parent_abs, &base, Some("md"));
    let stem = filename.trim_end_matches(".md").to_string();
    let id = join_rel(&parent, &filename);
    let now = crate::utils::now_rfc3339();
    let default_content = format!("# {}\n\n", stem);
    write_note_content(app, &id, &default_content)?;

    let meta = NoteMeta {
        id: id.clone(),
        name: stem.clone(),
        parent,
        title: stem,
        tags: vec![],
        pinned: false,
        snippet: String::new(),
        created_at: now.clone(),
        updated_at: now,
    };
    let mut index = read_notes_index(app)?;
    index.meta.insert(id, meta.clone());
    write_notes_index(app, &index)?;
    Ok(meta)
}

pub fn create_folder_entry(app: &AppHandle, parent: &str, name: &str) -> Result<NoteTreeNode, String> {
    let parent = parent.trim_matches('/').to_string();
    let parent_abs = if parent.is_empty() { notes_dir(app) } else { abs_from_id(app, &parent) };
    if !parent_abs.exists() {
        fs::create_dir_all(&parent_abs).map_err(|e| e.to_string())?;
    }
    let base = sanitize_name(name);
    let folder_name = unique_name(&parent_abs, &base, None);
    let new_abs = parent_abs.join(&folder_name);
    fs::create_dir(&new_abs).map_err(|e| e.to_string())?;
    let path = join_rel(&parent, &folder_name);
    Ok(NoteTreeNode::Folder { path, name: folder_name, parent, children: vec![] })
}

pub fn save_note_entry(app: &AppHandle, id: &str, content: &str) -> Result<NoteMeta, String> {
    write_note_content(app, id, content)?;
    let mut index = read_notes_index(app)?;
    let now = crate::utils::now_rfc3339();
    let snippet = generate_snippet(content, 120);
    let title = extract_title_from_content(content);
    let path_obj = std::path::Path::new(id);
    let stem = path_obj.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
    let parent = path_obj
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();

    let mut meta = index.meta.remove(id).unwrap_or(NoteMeta {
        id: id.to_string(),
        name: stem.clone(),
        parent: parent.clone(),
        title: title.clone().unwrap_or_else(|| stem.clone()),
        tags: vec![],
        pinned: false,
        snippet: snippet.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
    });
    meta.title = title.unwrap_or_else(|| stem.clone());
    meta.snippet = snippet;
    meta.name = stem;
    meta.parent = parent;
    meta.updated_at = now;
    index.meta.insert(id.to_string(), meta.clone());
    write_notes_index(app, &index)?;
    Ok(meta)
}

pub fn update_note_meta_entry(app: &AppHandle, id: &str, tags: Option<Vec<String>>, pinned: Option<bool>) -> Result<(), String> {
    let mut index = read_notes_index(app)?;
    let meta = index.meta.get_mut(id).ok_or_else(|| "Note not found".to_string())?;
    if let Some(t) = tags { meta.tags = t; }
    if let Some(p) = pinned { meta.pinned = p; }
    meta.updated_at = crate::utils::now_rfc3339();
    write_notes_index(app, &index)
}

pub fn rename_note_entry(app: &AppHandle, id: &str, new_name: &str) -> Result<NoteMeta, String> {
    let old_abs = abs_from_id(app, id);
    if !old_abs.exists() { return Err("Note not found".to_string()); }
    let parent_abs = old_abs.parent().ok_or_else(|| "Invalid path".to_string())?;
    let parent_rel: String = std::path::Path::new(id)
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let base = sanitize_name(new_name);
    let new_filename = unique_name(parent_abs, &base, Some("md"));
    let new_abs = parent_abs.join(&new_filename);
    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())?;
    let new_id = join_rel(&parent_rel, &new_filename);
    let new_stem = new_filename.trim_end_matches(".md").to_string();

    let mut index = read_notes_index(app)?;
    let mut meta = index.meta.remove(id).unwrap_or(NoteMeta {
        id: new_id.clone(),
        name: new_stem.clone(),
        parent: parent_rel.clone(),
        title: new_stem.clone(),
        tags: vec![],
        pinned: false,
        snippet: String::new(),
        created_at: crate::utils::now_rfc3339(),
        updated_at: crate::utils::now_rfc3339(),
    });
    meta.id = new_id.clone();
    meta.name = new_stem;
    meta.parent = parent_rel;
    meta.updated_at = crate::utils::now_rfc3339();
    index.meta.insert(new_id, meta.clone());
    write_notes_index(app, &index)?;
    Ok(meta)
}

pub fn rename_folder_entry(app: &AppHandle, path: &str, new_name: &str) -> Result<String, String> {
    let old_abs = abs_from_id(app, path);
    if !old_abs.exists() || !old_abs.is_dir() { return Err("Folder not found".to_string()); }
    let parent_abs = old_abs.parent().ok_or_else(|| "Invalid path".to_string())?;
    let parent_rel: String = std::path::Path::new(path)
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let base = sanitize_name(new_name);
    let new_folder = unique_name(parent_abs, &base, None);
    let new_abs = parent_abs.join(&new_folder);
    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())?;
    let new_path = join_rel(&parent_rel, &new_folder);
    update_index_paths_after_move(app, path, &new_path)?;
    Ok(new_path)
}

pub fn move_note_entry(app: &AppHandle, id: &str, new_parent: &str) -> Result<NoteMeta, String> {
    let old_abs = abs_from_id(app, id);
    if !old_abs.exists() { return Err("Note not found".to_string()); }
    let new_parent = new_parent.trim_matches('/').to_string();
    let new_parent_abs = if new_parent.is_empty() { notes_dir(app) } else { abs_from_id(app, &new_parent) };
    if !new_parent_abs.exists() {
        fs::create_dir_all(&new_parent_abs).map_err(|e| e.to_string())?;
    }
    let filename = old_abs
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("note.md")
        .to_string();
    let stem = filename.trim_end_matches(".md").to_string();
    let final_filename = unique_name(&new_parent_abs, &stem, Some("md"));
    let new_abs = new_parent_abs.join(&final_filename);
    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())?;
    let new_id = join_rel(&new_parent, &final_filename);

    let mut index = read_notes_index(app)?;
    let mut meta = index.meta.remove(id).unwrap_or(NoteMeta {
        id: new_id.clone(),
        name: stem.clone(),
        parent: new_parent.clone(),
        title: stem.clone(),
        tags: vec![],
        pinned: false,
        snippet: String::new(),
        created_at: crate::utils::now_rfc3339(),
        updated_at: crate::utils::now_rfc3339(),
    });
    meta.id = new_id.clone();
    meta.parent = new_parent;
    meta.name = final_filename.trim_end_matches(".md").to_string();
    meta.updated_at = crate::utils::now_rfc3339();
    index.meta.insert(new_id, meta.clone());
    write_notes_index(app, &index)?;
    Ok(meta)
}

pub fn move_folder_entry(app: &AppHandle, path: &str, new_parent: &str) -> Result<String, String> {
    let old_abs = abs_from_id(app, path);
    if !old_abs.exists() || !old_abs.is_dir() { return Err("Folder not found".to_string()); }
    let new_parent = new_parent.trim_matches('/').to_string();
    let new_parent_abs = if new_parent.is_empty() { notes_dir(app) } else { abs_from_id(app, &new_parent) };
    if !new_parent_abs.exists() {
        fs::create_dir_all(&new_parent_abs).map_err(|e| e.to_string())?;
    }
    let folder_name = old_abs.file_name().and_then(|f| f.to_str()).unwrap_or("folder").to_string();
    let final_folder = unique_name(&new_parent_abs, &folder_name, None);
    let new_abs = new_parent_abs.join(&final_folder);
    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())?;
    let new_path = join_rel(&new_parent, &final_folder);
    update_index_paths_after_move(app, path, &new_path)?;
    Ok(new_path)
}

/// 文件夹被改名/移动后，更新 index 中所有以 old_prefix/ 开头的笔记 id 为 new_prefix/...
fn update_index_paths_after_move(app: &AppHandle, old_prefix: &str, new_prefix: &str) -> Result<(), String> {
    let mut index = read_notes_index(app)?;
    let prefix_with_slash = format!("{}/", old_prefix.trim_end_matches('/'));
    let new_prefix_clean = new_prefix.trim_end_matches('/');
    let to_migrate: Vec<String> = index.meta.keys()
        .filter(|k| k.starts_with(&prefix_with_slash) || *k == old_prefix)
        .cloned()
        .collect();
    for old_id in to_migrate {
        if let Some(mut meta) = index.meta.remove(&old_id) {
            let new_id = if old_id == old_prefix {
                new_prefix_clean.to_string()
            } else {
                format!("{}/{}", new_prefix_clean, &old_id[prefix_with_slash.len()..])
            };
            let new_parent = std::path::Path::new(&new_id)
                .parent()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            meta.id = new_id.clone();
            meta.parent = new_parent;
            index.meta.insert(new_id, meta);
        }
    }
    write_notes_index(app, &index)?;
    Ok(())
}

/// 删除便签 → 进回收站
pub fn delete_note_entry(app: &AppHandle, id: &str) -> Result<(), String> {
    let abs = abs_from_id(app, id);
    if !abs.exists() { return Err("Note not found".to_string()); }
    let content = fs::read_to_string(&abs).unwrap_or_default();
    let mut index = read_notes_index(app)?;
    let meta = index.meta.remove(id).unwrap_or(NoteMeta {
        id: id.to_string(),
        name: abs.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string(),
        parent: std::path::Path::new(id).parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default(),
        title: String::new(),
        tags: vec![],
        pinned: false,
        snippet: String::new(),
        created_at: crate::utils::now_rfc3339(),
        updated_at: crate::utils::now_rfc3339(),
    });
    index.trash.insert(0, TrashedNote {
        trash_id: Uuid::new_v4().to_string(),
        original_path: id.to_string(),
        content,
        meta,
        deleted_at: crate::utils::now_rfc3339(),
    });
    fs::remove_file(&abs).map_err(|e| e.to_string())?;
    write_notes_index(app, &index)?;
    Ok(())
}

/// 删除文件夹 → 递归把所有便签进回收站，再 rm -rf 文件夹
pub fn delete_folder_entry(app: &AppHandle, path: &str) -> Result<(), String> {
    let abs = abs_from_id(app, path);
    if !abs.exists() || !abs.is_dir() { return Err("Folder not found".to_string()); }
    let mut index = read_notes_index(app)?;
    let prefix_with_slash = format!("{}/", path.trim_end_matches('/'));
    let to_trash: Vec<String> = index.meta.keys()
        .filter(|k| k.starts_with(&prefix_with_slash))
        .cloned()
        .collect();
    for note_id in to_trash {
        if let Some(meta) = index.meta.remove(&note_id) {
            let note_abs = abs_from_id(app, &note_id);
            let content = fs::read_to_string(&note_abs).unwrap_or_default();
            index.trash.insert(0, TrashedNote {
                trash_id: Uuid::new_v4().to_string(),
                original_path: note_id,
                content,
                meta,
                deleted_at: crate::utils::now_rfc3339(),
            });
        }
    }
    fs::remove_dir_all(&abs).map_err(|e| e.to_string())?;
    write_notes_index(app, &index)?;
    Ok(())
}

pub fn restore_note_entry(app: &AppHandle, trash_id: &str) -> Result<NoteMeta, String> {
    let mut index = read_notes_index(app)?;
    let pos = index.trash.iter().position(|t| t.trash_id == trash_id)
        .ok_or_else(|| "Trashed note not found".to_string())?;
    let trashed = index.trash.remove(pos);
    let original = trashed.original_path.clone();
    let parent_abs = abs_from_id(app, &original).parent().map(|p| p.to_path_buf()).unwrap_or_else(|| notes_dir(app));
    if !parent_abs.exists() {
        fs::create_dir_all(&parent_abs).map_err(|e| e.to_string())?;
    }
    let stem = std::path::Path::new(&original)
        .file_stem().and_then(|s| s.to_str()).unwrap_or("note").to_string();
    let parent_rel = std::path::Path::new(&original)
        .parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
    let final_filename = unique_name(&parent_abs, &stem, Some("md"));
    let new_id = join_rel(&parent_rel, &final_filename);
    write_note_content(app, &new_id, &trashed.content)?;

    let mut meta = trashed.meta.clone();
    meta.id = new_id.clone();
    meta.name = final_filename.trim_end_matches(".md").to_string();
    meta.parent = parent_rel;
    meta.updated_at = crate::utils::now_rfc3339();
    index.meta.insert(new_id, meta.clone());
    write_notes_index(app, &index)?;
    Ok(meta)
}

pub fn permanently_delete_note_store(app: &AppHandle, trash_id: &str) -> Result<(), String> {
    let mut index = read_notes_index(app)?;
    index.trash.retain(|t| t.trash_id != trash_id);
    write_notes_index(app, &index)
}

pub fn empty_notes_trash_store(app: &AppHandle) -> Result<(), String> {
    let mut index = read_notes_index(app)?;
    index.trash.clear();
    write_notes_index(app, &index)
}

/// 在 Markdown 内容的第一行提取 h1 标题（只匹配单个 # 开头）
pub fn extract_title_from_content(content: &str) -> Option<String> {
    content
        .lines()
        .find(|line| {
            let trimmed = line.trim();
            trimmed.starts_with("# ") || trimmed == "#"
        })
        .map(|line| line.trim().trim_start_matches('#').trim().to_string())
        .filter(|t| !t.is_empty())
}

/// 从 Markdown 内容生成摘要（去掉标题行，取前 120 字）
pub fn generate_snippet(content: &str, max_len: usize) -> String {
    let body: String = content
        .lines()
        .filter(|line| !line.trim().starts_with('#'))
        .collect::<Vec<&str>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");
    if body.len() <= max_len {
        body
    } else {
        let end = body
            .char_indices()
            .nth(max_len)
            .map(|(i, _)| i)
            .unwrap_or(body.len());
        format!("{}…", &body[..end])
    }
}

// ── 推断 ────────────────────────────────────────────────────

/// 根据文件名推断分类（带评分 + 扩展名规则）
pub fn infer_category(file_name: &str, categories: &[String]) -> String {
    let lower = file_name.to_lowercase();
    let ext = std::path::Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    // ── 扩展名强规则（优先级最高）─────────────────────────
    // 图片 / 截图
    if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "bmp" | "svg" | "webp" | "ico" | "tiff") {
        if categories.contains(&"08_截圖素材".to_string()) {
            return "08_截圖素材".to_string();
        }
    }
    // SQL 数据库
    if matches!(ext.as_str(), "sql" | "sqlite" | "db" | "mdb") {
        if categories.contains(&"04_表格設計".to_string()) {
            return "04_表格設計".to_string();
        }
    }
    // API 数据格式
    if matches!(ext.as_str(), "json" | "yaml" | "yml" | "xml" | "proto" | "graphql") {
        if categories.contains(&"05_接口文檔".to_string()) {
            return "05_接口文檔".to_string();
        }
    }
    // Excel
    if matches!(ext.as_str(), "xlsx" | "xls" | "csv" | "tsv") && !lower.contains("需求") && !lower.contains("prd") {
        if categories.contains(&"04_表格設計".to_string()) {
            return "04_表格設計".to_string();
        }
    }
    // Word
    if matches!(ext.as_str(), "docx" | "doc") {
        if lower.contains("需求") || lower.contains("prd") {
            if categories.contains(&"01_需求".to_string()) {
                return "01_需求".to_string();
            }
        }
        if lower.contains("方案") || lower.contains("設計") || lower.contains("spec") {
            if categories.contains(&"02_技術方案".to_string()) {
                return "02_技術方案".to_string();
            }
        }
    }
    // 视频
    if matches!(ext.as_str(), "mp4" | "webm" | "mkv" | "avi" | "mov" | "wmv") {
        if categories.contains(&"08_截圖素材".to_string()) {
            return "08_截圖素材".to_string();
        }
    }
    // 音频
    if matches!(ext.as_str(), "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" | "wma") {
        if categories.contains(&"08_截圖素材".to_string()) {
            return "08_截圖素材".to_string();
        }
    }
    // Markdown — 需要看文件名来决定
    if matches!(ext.as_str(), "md" | "markdown") {
        let md_cat = infer_markdown_category(&lower, categories);
        if let Some(cat) = md_cat {
            return cat;
        }
    }

    // ── 关键词规则（带评分）───────────────────────────────
    let rules: &[(&[&str], &str, i32)] = &[
        (&["需求", "prd", "requirement", "specification", "spec", "用户故事", "user story", "功能清單"], "01_需求", 2),
        (&["方案", "架構", "architecture", "技术方案", "技術方案", "设计文档", "design doc", "概要设计", "详细设计", "arch"], "02_技術方案", 2),
        (&["功能", "原型", "流程", "prototype", "flow", "wireframe", "mockup", "ui", "ux", "交互", "页面"], "03_功能設計", 2),
        (&["表", "字段", "資料庫", "database", "er图", "er圖", "schema", "ddl", "dml", "数据字典", "數據字典"], "04_表格設計", 2),
        (&["接口", "api", "endpoint", "swagger", "openapi", "postman", "rest", "graphql", "接口文档", "api文档"], "05_接口文檔", 2),
        (&["會議", "纪要", "纪要", "meeting", "minutes", "notes", "记录", "記錄", "讨论", "standup"], "06_會議記錄", 2),
        (&["測試", "test", "用例", "test case", "qa", "quality", "bug", "缺陷", "report", "测试报告"], "07_測試資料", 2),
        (&["截圖", "screenshot", "截图", "capture", "snip", "photo", "照片", "扫描", "scan"], "08_截圖素材", 2),
        (&["交付", "delivery", "release", "确认", "確認", "正式", "final", "签字", "签收", "验收"], "09_交付物", 2),
    ];

    struct Match<'a> {
        category: &'a str,
        score: i32,
    }

    let mut best: Option<Match> = None;

    for (keys, category, base_score) in rules {
        if !categories.contains(&category.to_string()) {
            continue;
        }
        let mut score = 0i32;
        for key in *keys {
            if lower.contains(&key.to_lowercase()) {
                score += base_score;
            }
        }
        if score > 0 {
            let is_better = match &best {
                None => true,
                Some(b) => score > b.score,
            };
            if is_better {
                best = Some(Match { category, score });
            }
        }
    }

    if let Some(m) = best {
        return m.category.to_string();
    }

    // ── 回退：扩展名再次匹配 ──────────────────────────────
    if !ext.is_empty() {
        if matches!(ext.as_str(), "pdf") {
            if categories.contains(&"09_交付物".to_string()) {
                return "09_交付物".to_string();
            }
        }
    }

    // 默认
    if categories.contains(&"99_臨時資料".to_string()) {
        "99_臨時資料".to_string()
    } else {
        categories.first().cloned().unwrap_or_default()
    }
}

/// 根据 Markdown 文件名推断所属分类
fn infer_markdown_category(lower_name: &str, categories: &[String]) -> Option<String> {
    let map: &[(&[&str], &str)] = &[
        (&["需求", "prd", "spec"], "01_需求"),
        (&["方案", "架构", "arch", "design", "设计"], "02_技術方案"),
        (&["功能", "flow", "流程"], "03_功能設計"),
        (&["接口", "api", "endpoint"], "05_接口文檔"),
        (&["会议", "meeting", "notes", "记录"], "06_會議記錄"),
        (&["测试", "test", "qa"], "07_測試資料"),
        (&["readme", "changelog", "todo"], "09_交付物"),
    ];
    for (keys, cat) in map {
        if keys.iter().any(|k| lower_name.contains(k)) {
            if categories.contains(&cat.to_string()) {
                return Some(cat.to_string());
            }
        }
    }
    None
}

/// 根据文件名推断最匹配的项目（带评分）
///
/// source_path 可选，用于从目录名中提取额外线索
pub fn infer_project<'a>(
    file_name: &str,
    source_path: Option<&str>,
    projects: &'a [Project],
) -> Option<&'a Project> {
    if projects.is_empty() {
        return None;
    }

    let lower_name = file_name.to_lowercase();
    let file_name_without_ext = strip_extension(&lower_name);

    // 从路径中提取父目录名作为线索
    let dir_hint = source_path
        .and_then(|p| std::path::Path::new(p).parent())
        .and_then(|d| d.file_name())
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    struct Candidate<'a> {
        project: &'a Project,
        score: i32,
    }

    let mut candidates: Vec<Candidate> = Vec::new();

    for project in projects {
        let mut score = 0i32;
        let pname = project.name.to_lowercase();
        let alias = project.alias.to_lowercase();

        // 1. 项目名精确匹配（最高权重）
        if lower_name.contains(&pname) || pname.contains(&lower_name) {
            score += 15;
        }
        if !file_name_without_ext.is_empty()
            && (file_name_without_ext.contains(&pname) || pname.contains(&file_name_without_ext))
        {
            score += 5;
        }

        // 2. 别称匹配
        if !alias.is_empty() {
            if lower_name.contains(&alias) || alias.contains(&lower_name) {
                score += 12;
            }
        }

        // 3. 项目名的词片段匹配
        let name_words = split_cjk_words(&pname);
        for word in &name_words {
            if word.len() < 2 {
                continue;
            }
            if lower_name.contains(word.as_str()) {
                score += 3;
            }
            if file_name_without_ext.contains(word.as_str()) {
                score += 1;
            }
        }

        // 4. 标签匹配
        for tag in &project.tags {
            let t = tag.to_lowercase();
            if !t.is_empty() && t.len() >= 2 && lower_name.contains(&t) {
                score += 2;
            }
        }

        // 5. 路径目录名线索
        if !dir_hint.is_empty() {
            if dir_hint.contains(&pname) || pname.contains(&dir_hint) {
                score += 4;
            }
            for word in &name_words {
                if word.len() >= 2 && dir_hint.contains(word.as_str()) {
                    score += 1;
                }
            }
        }

        if score > 0 {
            candidates.push(Candidate { project, score });
        }
    }

    candidates.sort_by_key(|c| -c.score);

    // 至少需要 4 分才认为有意义的匹配
    candidates
        .first()
        .filter(|c| c.score >= 4)
        .map(|c| c.project)
}

/// 去掉文件扩展名
fn strip_extension(name: &str) -> String {
    std::path::Path::new(name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| name.to_string())
}

/// 将字符串拆分为有意义的片段（中文字符单拆，英文按空格/分隔符拆）
fn split_cjk_words(s: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();

    for ch in s.chars() {
        if ch.is_whitespace() || ch == '_' || ch == '-' || ch == '.' || ch == '/' || ch == '\\' {
            if !current.is_empty() {
                result.push(current.clone());
                current.clear();
            }
        } else if is_cjk(ch) {
            if !current.is_empty() {
                result.push(current.clone());
                current.clear();
            }
            result.push(ch.to_string());
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

fn is_cjk(ch: char) -> bool {
    matches!(ch,
        '\u{4E00}'..='\u{9FFF}'   // CJK 统一表意文字
        | '\u{3400}'..='\u{4DBF}' // CJK 扩展 A
        | '\u{20000}'..='\u{2A6DF}' // CJK 扩展 B
        | '\u{F900}'..='\u{FAFF}' // CJK 兼容表意文字
    )
}

/// 列出分类下的文件
pub fn list_category_files(
    project_path: &str,
    category: &str,
) -> Result<Vec<crate::models::CategoryFile>, String> {
    let category_path = Path::new(project_path).join(category);
    if !category_path.exists() {
        return Ok(vec![]);
    }

    let mut files = vec![];
    for entry in fs::read_dir(&category_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let modified_at = crate::utils::system_time_to_rfc3339(
            metadata.modified().map_err(|e| e.to_string())?,
        );

        let mut children = None;
        if metadata.is_dir() {
            let mut child_files = vec![];
            for child in fs::read_dir(&path).map_err(|e| e.to_string())? {
                let child = child.map_err(|e| e.to_string())?;
                let child_path = child.path();
                let child_meta = child.metadata().map_err(|e| e.to_string())?;
                let child_modified = crate::utils::system_time_to_rfc3339(
                    child_meta.modified().map_err(|e| e.to_string())?,
                );
                child_files.push(crate::models::CategoryFile {
                    name: child.file_name().to_string_lossy().to_string(),
                    path: child_path.to_string_lossy().to_string(),
                    is_directory: child_meta.is_dir(),
                    size: child_meta.len() as i64,
                    modified_at: child_modified,
                    children: None,
                });
            }
            child_files.sort_by(|a, b| a.name.cmp(&b.name));
            children = Some(child_files);
        }

        files.push(crate::models::CategoryFile {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: metadata.len() as i64,
            modified_at,
            children,
        });
    }

    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}
