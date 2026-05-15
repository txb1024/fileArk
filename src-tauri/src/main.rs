//! 個人項目資料庫 - Tauri 应用入口
//!
//! 模块结构：
//!   models.rs - 数据结构定义
//!   store.rs  - 数据持久化层
//!   utils.rs  - 工具函数
//!   main.rs   - Tauri 命令 + 应用入口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod store;
mod utils;

use models::*;
use store::*;
use notify::{RecursiveMode, Watcher};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use uuid::Uuid;

/// 文件系统监听器状态
struct FsWatcherState {
    watcher: Option<notify::RecommendedWatcher>,
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 工作空间
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn list_workspaces(app: tauri::AppHandle) -> Result<WorkspaceRegistry, String> {
    read_registry(&app)
}

#[tauri::command]
fn create_workspace(app: tauri::AppHandle, name: String) -> Result<WorkspaceRegistry, String> {
    let mut registry = read_registry(&app)?;
    let id = Uuid::new_v4().to_string();
    let data_file = format!("workspace-{}.json", id);
    let empty_data = create_default_data();
    let data_path = app_path(&app).join(&data_file);
    let json = serde_json::to_string_pretty(&empty_data).map_err(|e| e.to_string())?;
    fs::write(&data_path, json).map_err(|e| e.to_string())?;

    registry.workspaces.push(WorkspaceMeta {
        id: id.clone(),
        name,
        data_file,
        created_at: utils::now_rfc3339(),
    });
    registry.active_workspace_id = id;
    write_registry(&app, &registry)?;
    Ok(registry)
}

#[tauri::command]
fn switch_workspace(app: tauri::AppHandle, workspace_id: String) -> Result<AppData, String> {
    let mut registry = read_registry(&app)?;
    if !registry.workspaces.iter().any(|w| w.id == workspace_id) {
        return Err("找不到資料庫".to_string());
    }
    registry.active_workspace_id = workspace_id;
    write_registry(&app, &registry)?;
    read_data(&app)
}

#[tauri::command]
fn rename_workspace(
    app: tauri::AppHandle,
    workspace_id: String,
    new_name: String,
) -> Result<WorkspaceRegistry, String> {
    let mut registry = read_registry(&app)?;
    registry.workspaces = registry
        .workspaces
        .into_iter()
        .map(|w| {
            if w.id == workspace_id {
                WorkspaceMeta { name: new_name.clone(), ..w }
            } else {
                w
            }
        })
        .collect();
    write_registry(&app, &registry)?;
    Ok(registry)
}

#[tauri::command]
fn delete_workspace(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<WorkspaceRegistry, String> {
    let mut registry = read_registry(&app)?;
    if registry.workspaces.len() <= 1 {
        return Err("至少保留一個資料庫".to_string());
    }
    let target = registry.workspaces.iter().find(|w| w.id == workspace_id).cloned();
    registry.workspaces.retain(|w| w.id != workspace_id);
    if registry.active_workspace_id == workspace_id {
        registry.active_workspace_id = registry.workspaces[0].id.clone();
    }
    if let Some(t) = target {
        let _ = fs::remove_file(app_path(&app).join(&t.data_file));
    }
    write_registry(&app, &registry)?;
    Ok(registry)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 项目
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn get_data(app: tauri::AppHandle) -> Result<AppData, String> {
    read_data(&app)
}

#[tauri::command]
fn create_project(app: tauri::AppHandle, input: CreateProjectInput) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let root = input.root.clone().unwrap_or(data.settings.workspace_root.clone());
    let folder_name = utils::safe_folder_name(&input.name);
    let project_path = Path::new(&root).join(&folder_name);

    fs::create_dir_all(&project_path).map_err(|e| e.to_string())?;
    for cat in &data.settings.categories {
        fs::create_dir_all(project_path.join(cat)).map_err(|e| e.to_string())?;
    }

    let ts = utils::now_rfc3339();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        alias: input.alias.unwrap_or_default(),
        tags: input.tags.unwrap_or_default(),
        path: project_path.to_string_lossy().to_string(),
        pinned: input.pinned.unwrap_or(false),
        created_at: ts.clone(),
        updated_at: ts.clone(),
        last_opened_at: None,
        recent_files: vec![],
    };

    let name_clone = project.name.clone();
    data.projects.insert(0, project);
    data.activities.insert(
        0,
        Activity {
            id: Uuid::new_v4().to_string(),
            kind: "project:create".to_string(),
            title: format!("新建項目：{}", name_clone),
            created_at: ts,
        },
    );

    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn toggle_pin(app: tauri::AppHandle, project_id: String) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let ts = utils::now_rfc3339();
    data.projects = data
        .projects
        .into_iter()
        .map(|p| {
            if p.id == project_id {
                Project { pinned: !p.pinned, updated_at: ts.clone(), ..p }
            } else {
                p
            }
        })
        .collect();
    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn mark_project_opened(app: tauri::AppHandle, project_id: String) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let ts = utils::now_rfc3339();
    data.projects = data
        .projects
        .into_iter()
        .map(|p| {
            if p.id == project_id {
                Project { last_opened_at: Some(ts.clone()), ..p }
            } else {
                p
            }
        })
        .collect();
    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn update_root(app: tauri::AppHandle, root: String) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    data.settings.workspace_root = root;
    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn check_root_files(root: String) -> Result<usize, String> {
    let path = Path::new(&root);
    if !path.exists() {
        return Ok(0);
    }
    Ok(fs::read_dir(path).map_err(|e| e.to_string())?.count())
}

#[tauri::command]
fn migrate_root(app: tauri::AppHandle, input: MigrateRootInput) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let old_path = Path::new(&input.old_root);
    let new_path = Path::new(&input.new_root);

    fs::create_dir_all(&input.new_root).map_err(|e| e.to_string())?;

    if input.migrate && old_path.exists() {
        for entry in fs::read_dir(old_path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let src = entry.path();
            let dest = new_path.join(entry.file_name());
            if src.is_file() {
                fs::copy(&src, &dest).map_err(|e| e.to_string())?;
                fs::remove_file(&src).map_err(|e| e.to_string())?;
            } else if src.is_dir() {
                utils::copy_dir_all(&src, &dest)?;
                fs::remove_dir_all(&src).map_err(|e| e.to_string())?;
            }
        }
    }

    data.settings.workspace_root = input.new_root;
    write_data(&app, &data)?;
    Ok(data)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 分类
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn update_categories(app: tauri::AppHandle, categories: Vec<String>) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    data.settings.categories = categories;
    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn list_category_files_cmd(
    _app: tauri::AppHandle,
    project_path: String,
    category: String,
) -> Result<Vec<CategoryFile>, String> {
    list_category_files(&project_path, &category)
}

#[tauri::command]
fn get_category_counts(
    _app: tauri::AppHandle,
    project_path: String,
    categories: Vec<String>,
) -> Result<std::collections::HashMap<String, usize>, String> {
    use std::collections::HashMap;
    let mut counts = HashMap::new();
    for category in categories {
        let category_path = Path::new(&project_path).join(&category);
        if category_path.exists() && category_path.is_dir() {
            let count = fs::read_dir(&category_path)
                .map_err(|e| e.to_string())?
                .filter_map(|entry| entry.ok())
                .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
                .count();
            counts.insert(category, count);
        } else {
            counts.insert(category, 0);
        }
    }
    Ok(counts)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 文件操作
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
async fn select_root(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.and_then(|p| Some(p.to_string())));
    });
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("All files", &["*"])
        .pick_files(move |paths| {
            let _ = tx.send(paths.map(|v| v.into_iter().map(|p| p.to_string()).collect()));
        });
    match rx.recv().map_err(|e| e.to_string())? {
        Some(v) => Ok(v),
        None => Ok(vec![]),
    }
}

#[tauri::command]
fn add_files_to_category(
    app: tauri::AppHandle,
    input: AddFilesToCategoryInput,
) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let project = data
        .projects
        .iter()
        .find(|p| p.id == input.project_id)
        .ok_or("找不到項目")?
        .clone();
    let category = if input.category.is_empty() {
        data.settings.categories[0].clone()
    } else {
        input.category.clone()
    };
    let target_dir = Path::new(&project.path).join(&category);

    let mut added = vec![];
    for source_path in input.file_paths {
        let path = Path::new(&source_path);
        if !path.exists() || !path.is_file() {
            continue;
        }
        match utils::copy_unique(path, &target_dir) {
            Ok((copied, stat)) => added.push((copied, stat)),
            Err(_) => continue,
        }
    }

    let ts = utils::now_rfc3339();
    let project_id = project.id.clone();
    let project_name = project.name.clone();
    data.projects = data
        .projects
        .into_iter()
        .map(|p| {
            if p.id != project_id {
                return p;
            }
            let mut recent = added
                .iter()
                .map(|(path, stat)| RecentFile {
                    name: path.file_name().unwrap().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    category: category.clone(),
                    size: stat.len() as i64,
                    updated_at: ts.clone(),
                })
                .collect::<Vec<_>>();
            recent.extend(p.recent_files);
            recent.truncate(12);
            Project { updated_at: ts.clone(), recent_files: recent, ..p }
        })
        .collect();

    data.activities.insert(
        0,
        Activity {
            id: Uuid::new_v4().to_string(),
            kind: "category:add-files".to_string(),
            title: format!("加入「{} / {}」：{} 個文件", project_name, category, added.len()),
            created_at: ts,
        },
    );

    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn create_category_folder(
    app: tauri::AppHandle,
    input: CreateCategoryFolderInput,
) -> Result<Vec<CategoryFile>, String> {
    let data = read_data(&app)?;
    let project = data
        .projects
        .iter()
        .find(|p| p.id == input.project_id)
        .ok_or("找不到項目")?;
    let folder_name = utils::safe_folder_name(&input.folder_name);
    if folder_name.is_empty() {
        return Err("資料夾名稱不能為空".to_string());
    }
    let dir = Path::new(&project.path).join(&input.category).join(&folder_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    list_category_files(&project.path, &input.category)
}

#[tauri::command]
fn open_file(_app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    open::that(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(_app: tauri::AppHandle, folder_path: String) -> Result<(), String> {
    open::that(&folder_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn copy_file_to(input: CopyFileInput) -> Result<(), String> {
    let source = Path::new(&input.source_path);
    let target_dir = Path::new(&input.target_path);
    if !source.exists() {
        return Err("源文件不存在".to_string());
    }
    fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let file_name = source.file_name().ok_or("无法获取文件名")?.to_string_lossy().to_string();
    let mut target = target_dir.join(&file_name);
    let mut index = 1;
    while target.exists() {
        let stem = Path::new(&file_name).file_stem().unwrap().to_string_lossy();
        let ext = Path::new(&file_name).extension().and_then(|e| e.to_str()).unwrap_or("");
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, index)
        } else {
            format!("{} ({}).{}", stem, index, ext)
        };
        target = target_dir.join(new_name);
        index += 1;
    }
    fs::copy(source, &target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn move_file_to(input: MoveFileInput) -> Result<(), String> {
    let source = Path::new(&input.source_path);
    let target_dir = Path::new(&input.target_path);
    if !source.exists() {
        return Err("源文件不存在".to_string());
    }
    fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let file_name = source.file_name().ok_or("无法获取文件名")?.to_string_lossy().to_string();
    let mut target = target_dir.join(&file_name);
    let mut index = 1;
    while target.exists() {
        let stem = Path::new(&file_name).file_stem().unwrap().to_string_lossy();
        let ext = Path::new(&file_name).extension().and_then(|e| e.to_str()).unwrap_or("");
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, index)
        } else {
            format!("{} ({}).{}", stem, index, ext)
        };
        target = target_dir.join(new_name);
        index += 1;
    }
    if source.is_dir() {
        utils::copy_dir_all(source, &target)?;
        fs::remove_dir_all(source).map_err(|e| e.to_string())
    } else {
        fs::rename(source, &target).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn read_file_content(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !utils::TEXT_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持预览 {} 类型文件", ext));
    }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 1024 * 1024 {
        return Err("文件过大，无法预览（限制 1MB）".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if content.len() > 50000 {
        Ok(format!("{}...\n\n[文件过大，已截断前 50000 字符]", &content[..50000]))
    } else {
        Ok(content)
    }
}

#[tauri::command]
fn get_preview_info(file_path: String) -> Result<PreviewInfo, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("未知文件").to_string();
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    let is_text = utils::TEXT_EXTENSIONS.contains(&ext.as_str());
    let is_image = utils::IMAGE_EXTENSIONS.contains(&ext.as_str());

    let preview_type = if utils::PDF_EXTENSIONS.contains(&ext.as_str()) {
        "pdf".to_string()
    } else if utils::EXCEL_EXTENSIONS.contains(&ext.as_str()) {
        "excel".to_string()
    } else if utils::WORD_EXTENSIONS.contains(&ext.as_str()) {
        "word".to_string()
    } else if utils::PPTX_EXTENSIONS.contains(&ext.as_str()) {
        "pptx".to_string()
    } else if utils::HTML_EXTENSIONS.contains(&ext.as_str()) {
        "html".to_string()
    } else if utils::VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        "video".to_string()
    } else if utils::AUDIO_EXTENSIONS.contains(&ext.as_str()) {
        "audio".to_string()
    } else if utils::MARKDOWN_EXTENSIONS.contains(&ext.as_str()) {
        "markdown".to_string()
    } else if is_image {
        "image".to_string()
    } else if is_text {
        "text".to_string()
    } else if utils::UNSUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
        "unsupported".to_string()
    } else {
        "unsupported".to_string()
    };

    Ok(PreviewInfo { name, ext, size: metadata.len(), is_text, is_image, preview_type })
}

#[tauri::command]
fn read_file_binary(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 50 * 1024 * 1024 {
        return Err("文件过大，无法预览（限制 50MB）".to_string());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 搜索
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn search_project_files(app: tauri::AppHandle, query: String) -> Result<Vec<SearchFileResult>, String> {
    let data = read_data(&app)?;
    let lower = query.trim().to_lowercase();
    if lower.is_empty() {
        return Ok(vec![]);
    }

    let mut results: Vec<SearchFileResult> = Vec::new();
    let max_results = 20;

    for project in &data.projects {
        let project_path = Path::new(&project.path);
        if !project_path.exists() {
            continue;
        }
        for category in &data.settings.categories {
            let cat_path = project_path.join(category);
            if !cat_path.exists() || !cat_path.is_dir() {
                continue;
            }
            let entries = match fs::read_dir(&cat_path) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.to_lowercase().contains(&lower) {
                    continue;
                }
                let path = entry.path();
                let ft = entry.file_type().ok();
                let is_dir = ft.as_ref().map(|t| t.is_dir()).unwrap_or(false);
                let metadata = entry.metadata().ok();
                results.push(SearchFileResult {
                    name,
                    path: path.to_string_lossy().to_string(),
                    project_name: project.name.clone(),
                    category: category.clone(),
                    size: metadata.map(|m| m.len() as i64).unwrap_or(0),
                    is_directory: is_dir,
                });
                if results.len() >= max_results {
                    return Ok(results);
                }
            }
        }
    }

    Ok(results)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 收件箱
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn add_inbox_files(app: tauri::AppHandle, file_paths: Vec<String>) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let ts = utils::now_rfc3339();
    let mut additions = vec![];

    for source_path in file_paths {
        let src_path = Path::new(&source_path);
        if !src_path.exists() {
            continue;
        }
        let metadata = fs::metadata(src_path).map_err(|e| e.to_string())?;
        if !metadata.is_file() {
            continue;
        }
        let name = src_path.file_name().unwrap().to_string_lossy().to_string();
        let recommended = infer_project(&name, Some(&source_path), &data.projects)
            .map(|p| p.id.clone());
        let recommended_category = infer_category(&name, &data.settings.categories);
        additions.push(InboxItem {
            id: Uuid::new_v4().to_string(),
            name,
            source_path,
            size: metadata.len() as i64,
            modified_at: utils::system_time_to_rfc3339(metadata.modified().map_err(|e| e.to_string())?),
            recommended_project_id: recommended,
            recommended_category,
            status: "待整理".to_string(),
            created_at: ts.clone(),
        });
    }

    data.inbox.splice(0..0, additions);
    data.activities.insert(
        0,
        Activity {
            id: Uuid::new_v4().to_string(),
            kind: "inbox:add".to_string(),
            title: format!("加入收件箱：{} 個文件", data.inbox.len()),
            created_at: ts,
        },
    );

    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn organize_inbox(app: tauri::AppHandle, input: OrganizeInput) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let project = data
        .projects
        .iter()
        .find(|p| p.id == input.project_id)
        .ok_or("找不到項目")?
        .clone();
    let category = if input.category.is_empty() {
        data.settings.categories[0].clone()
    } else {
        input.category.clone()
    };
    let target_dir = Path::new(&project.path).join(&category);
    let item_ids: HashSet<String> = input.item_ids.into_iter().collect();

    let mut organized = vec![];
    let mut remaining = vec![];
    for item in data.inbox {
        if item_ids.contains(&item.id) {
            organized.push(item);
        } else {
            remaining.push(item);
        }
    }

    let mut copied_files = vec![];
    for item in &organized {
        let source = Path::new(&item.source_path);
        if !source.exists() {
            continue;
        }
        match utils::copy_unique(source, &target_dir) {
            Ok((p, s)) => copied_files.push((p, s)),
            Err(_) => continue,
        }
    }

    data.inbox = remaining;
    let ts = utils::now_rfc3339();
    let project_id = project.id.clone();
    let project_name = project.name.clone();
    data.projects = data
        .projects
        .into_iter()
        .map(|p| {
            if p.id != project_id {
                return p;
            }
            let mut recent = copied_files
                .iter()
                .map(|(path, stat)| RecentFile {
                    name: path.file_name().unwrap().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    category: category.clone(),
                    size: stat.len() as i64,
                    updated_at: ts.clone(),
                })
                .collect::<Vec<_>>();
            recent.extend(p.recent_files);
            recent.truncate(12);
            Project { updated_at: ts.clone(), recent_files: recent, ..p }
        })
        .collect();

    data.activities.insert(
        0,
        Activity {
            id: Uuid::new_v4().to_string(),
            kind: "inbox:organize".to_string(),
            title: format!("歸入「{} / {}」：{} 個文件", project_name, category, copied_files.len()),
            created_at: ts,
        },
    );

    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn delete_inbox_items(app: tauri::AppHandle, item_ids: Vec<String>) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let ids: HashSet<String> = item_ids.into_iter().collect();
    data.inbox.retain(|item| !ids.contains(&item.id));
    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn clear_inbox(app: tauri::AppHandle) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    data.inbox.clear();
    write_data(&app, &data)?;
    Ok(data)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 便签
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let index = read_notes_index(&app)?;
    Ok(index.notes)
}

#[tauri::command]
fn get_note_content(app: tauri::AppHandle, id: String) -> Result<String, String> {
    read_note_content(&app, &id)
}

#[tauri::command]
fn create_note(app: tauri::AppHandle, input: CreateNoteInput) -> Result<NoteMeta, String> {
    let mut index = read_notes_index(&app)?;
    let id = Uuid::new_v4().to_string();
    let ts = utils::now_rfc3339();

    // 如果未提供标题，创建默认内容带标题
    let title = input.title.unwrap_or_else(|| "未命名便签".to_string());
    let category = input.category.unwrap_or_else(|| "临时".to_string());

    let default_content = format!("# {}\n\n", title);
    write_note_content(&app, &id, &default_content)?;
    let snippet = generate_snippet(&default_content, 120);

    let meta = NoteMeta {
        id,
        title,
        tags: vec![],
        pinned: false,
        category,
        snippet,
        created_at: ts.clone(),
        updated_at: ts,
    };

    index.notes.insert(0, meta.clone());
    write_notes_index(&app, &index)?;
    Ok(meta)
}

#[tauri::command]
fn save_note(app: tauri::AppHandle, id: String, content: String) -> Result<NoteMeta, String> {
    write_note_content(&app, &id, &content)?;

    // 更新索引中的标题、摘要和更新时间
    let mut index = read_notes_index(&app)?;
    let ts = utils::now_rfc3339();
    let snippet = generate_snippet(&content, 120);
    let mut updated_meta: Option<NoteMeta> = None;
    for note in &mut index.notes {
        if note.id == id {
            if let Some(new_title) = extract_title_from_content(&content) {
                note.title = new_title;
            }
            note.snippet = snippet;
            note.updated_at = ts;
            updated_meta = Some(note.clone());
            break;
        }
    }
    write_notes_index(&app, &index)?;
    updated_meta.ok_or_else(|| "Note not found".to_string())
}

#[tauri::command]
fn update_note_meta(app: tauri::AppHandle, id: String, input: UpdateNoteMetaInput) -> Result<(), String> {
    let mut index = read_notes_index(&app)?;
    let ts = utils::now_rfc3339();
    for note in &mut index.notes {
        if note.id == id {
            if let Some(title) = input.title {
                note.title = title;
            }
            if let Some(tags) = input.tags {
                note.tags = tags;
            }
            if let Some(pinned) = input.pinned {
                note.pinned = pinned;
            }
            if let Some(category) = input.category {
                note.category = category;
            }
            note.updated_at = ts;
            break;
        }
    }
    write_notes_index(&app, &index)?;
    Ok(())
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, id: String) -> Result<(), String> {
    trash_note_entry(&app, &id)?;
    Ok(())
}

#[tauri::command]
fn list_trashed_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let index = read_notes_index(&app)?;
    Ok(index.trash)
}

#[tauri::command]
fn restore_note(app: tauri::AppHandle, id: String) -> Result<NoteMeta, String> {
    restore_note_entry(&app, &id)
}

#[tauri::command]
fn permanently_delete_note(app: tauri::AppHandle, id: String) -> Result<(), String> {
    permanently_delete_note_store(&app, &id)
}

#[tauri::command]
fn empty_notes_trash(app: tauri::AppHandle) -> Result<(), String> {
    empty_notes_trash_store(&app)
}

/// 保存便签内嵌资源（图片等），返回绝对路径
/// 前端拿到绝对路径后用 convertFileSrc 转 webview URL 插入 markdown
#[tauri::command]
fn save_note_asset(_app: tauri::AppHandle, data: String, ext: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("base64 decode failed: {}", e))?;
    let path = save_note_asset_file(&_app, &bytes, &ext)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn search_notes(app: tauri::AppHandle, query: String) -> Result<Vec<NoteMeta>, String> {
    let index = read_notes_index(&app)?;
    let lower = query.trim().to_lowercase();
    if lower.is_empty() {
        return Ok(index.notes);
    }
    let mut results: Vec<NoteMeta> = vec![];
    for note in &index.notes {
        let meta_match = note.title.to_lowercase().contains(&lower)
            || note.tags.iter().any(|t| t.to_lowercase().contains(&lower))
            || note.category.to_lowercase().contains(&lower)
            || note.snippet.to_lowercase().contains(&lower);
        if meta_match {
            results.push(note.clone());
            continue;
        }
        // 搜索笔记内容
        if let Ok(content) = read_note_content(&app, &note.id) {
            if content.to_lowercase().contains(&lower) {
                results.push(note.clone());
            }
        }
    }
    Ok(results)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 系统
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e: tauri_plugin_autostart::Error| e.to_string())
}

#[tauri::command]
fn set_autostart_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e: tauri_plugin_autostart::Error| e.to_string())
    } else {
        autolaunch.disable().map_err(|e: tauri_plugin_autostart::Error| e.to_string())
    }
}

#[tauri::command]
fn send_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_clipboard_files() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("powershell")
            .args([
                "-NoProfile", "-NoLogo", "-ExecutionPolicy", "Bypass", "-Command",
                "Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName",
            ])
            .output()
            .map_err(|e| format!("执行命令失败: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout
            .lines()
            .filter(|line| {
                let t = line.trim();
                !t.is_empty() && Path::new(t).exists()
            })
            .map(|l| l.trim().to_string())
            .collect())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 回收站
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn get_trash_items(app: tauri::AppHandle) -> Result<Vec<TrashItem>, String> {
    let trash = read_trash(&app)?;
    Ok(trash.items)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let project = data
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .cloned()
        .ok_or("找不到项目")?;

    let mut trash = read_trash(&app)?;
    let ts = utils::now_rfc3339();
    trash.items.insert(
        0,
        TrashItem {
            id: Uuid::new_v4().to_string(),
            name: project.name.clone(),
            project_id: project.id.clone(),
            project_name: project.name.clone(),
            category: "根目录".to_string(),
            original_path: project.path.clone(),
            deleted_at: ts,
        },
    );
    write_trash(&app, &trash)?;

    data.projects.retain(|p| p.id != project_id);
    write_data(&app, &data)?;
    Ok(data)
}

#[tauri::command]
fn restore_project(app: tauri::AppHandle, trash_item_id: String) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let mut trash = read_trash(&app)?;
    let item = trash
        .items
        .iter()
        .find(|i| i.id == trash_item_id)
        .cloned()
        .ok_or("找不到回收站项目")?;

    let ts = utils::now_rfc3339();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: item.name.clone(),
        alias: String::new(),
        tags: vec![],
        path: item.original_path.clone(),
        pinned: false,
        created_at: ts.clone(),
        updated_at: ts.clone(),
        last_opened_at: None,
        recent_files: vec![],
    };

    data.projects.push(project);
    trash.items.retain(|i| i.id != trash_item_id);
    write_data(&app, &data)?;
    write_trash(&app, &trash)?;
    Ok(data)
}

#[tauri::command]
fn permanently_delete_trash_item(app: tauri::AppHandle, trash_item_id: String) -> Result<(), String> {
    let mut trash = read_trash(&app)?;
    let item = trash
        .items
        .iter()
        .find(|i| i.id == trash_item_id)
        .cloned()
        .ok_or("找不到回收站项目")?;

    let path = Path::new(&item.original_path);
    if path.exists() {
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    trash.items.retain(|i| i.id != trash_item_id);
    write_trash(&app, &trash)?;
    Ok(())
}

#[tauri::command]
fn empty_trash(app: tauri::AppHandle) -> Result<(), String> {
    let mut trash = read_trash(&app)?;
    for item in &trash.items {
        let path = Path::new(&item.original_path);
        if path.exists() {
            if path.is_dir() {
                let _ = fs::remove_dir_all(path);
            } else {
                let _ = fs::remove_file(path);
            }
        }
    }
    trash.items.clear();
    write_trash(&app, &trash)?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 文件系统监听
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn start_watching(
    state: tauri::State<'_, Mutex<FsWatcherState>>,
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() || !target.is_dir() {
        return Err(format!("目录不存在: {}", path));
    }

    // 先停掉旧的监听器
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        *guard = FsWatcherState { watcher: None };
    }

    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(target, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // 存储 watcher，keep it alive
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.watcher = Some(watcher);
    }

    // 后台线程：收集 + 防抖，合并到主事件
    std::thread::spawn(move || {
        let mut paths: Vec<String> = Vec::new();
        let mut last_emit = Instant::now();
        let debounce_ms = 300;

        loop {
            match rx.recv_timeout(std::time::Duration::from_millis(debounce_ms)) {
                Ok(event) => {
                    for p in &event.paths {
                        let s = p.to_string_lossy().to_string();
                        if !paths.contains(&s) {
                            paths.push(s);
                        }
                    }
                    if last_emit.elapsed().as_millis() as u64 >= debounce_ms && !paths.is_empty() {
                        let _ = app.emit("fs-changed", paths.clone());
                        paths.clear();
                        last_emit = Instant::now();
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if !paths.is_empty() {
                        let _ = app.emit("fs-changed", paths.clone());
                        paths.clear();
                        last_emit = Instant::now();
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    if !paths.is_empty() {
                        let _ = app.emit("fs-changed", paths);
                    }
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_watching(state: tauri::State<'_, Mutex<FsWatcherState>>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    *guard = FsWatcherState { watcher: None };
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
//  入口
// ═══════════════════════════════════════════════════════════════

fn app_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app: &mut tauri::App| {
            app.manage(Mutex::new(FsWatcherState { watcher: None }));

            let icon = app.default_window_icon().cloned().unwrap();
            let app_handle = app.handle().clone();

            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(&app_handle)?;
            let hide_item = MenuItemBuilder::with_id("hide", "最小化到托盘").build(&app_handle)?;
            let add_files_item =
                MenuItemBuilder::with_id("add-files", "📂 快速添加文件...").build(&app_handle)?;
            let autostart_item = MenuItemBuilder::with_id("autostart-toggle", "开机自启")
                .build(&app_handle)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(&app_handle)?;

            let menu = MenuBuilder::new(&app_handle)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&add_files_item)
                .separator()
                .item(&autostart_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("個人項目資料庫")
                .menu(&menu)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .on_menu_event(|app: &tauri::AppHandle, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "add-files" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("trigger-add-files", ());
                            }
                        }
                        "autostart-toggle" => {
                            let autolaunch = app.autolaunch();
                            let is_enabled = autolaunch.is_enabled().unwrap_or(false);
                            if is_enabled {
                                let _ = autolaunch.disable();
                            } else {
                                let _ = autolaunch.enable();
                            }
                            let _ = app.emit("autostart-changed", !is_enabled);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_data,
            create_project,
            toggle_pin,
            mark_project_opened,
            update_root,
            check_root_files,
            migrate_root,
            update_categories,
            select_root,
            select_files,
            list_category_files_cmd,
            get_category_counts,
            add_files_to_category,
            create_category_folder,
            open_file,
            open_folder,
            delete_file,
            copy_file_to,
            move_file_to,
            read_file_content,
            read_file_binary,
            get_preview_info,
            add_inbox_files,
            organize_inbox,
            delete_inbox_items,
            clear_inbox,
            list_workspaces,
            create_workspace,
            switch_workspace,
            rename_workspace,
            delete_workspace,
            get_autostart_enabled,
            set_autostart_enabled,
            send_notification,
            read_clipboard_files,
            get_trash_items,
            delete_project,
            restore_project,
            permanently_delete_trash_item,
            empty_trash,
            start_watching,
            stop_watching,
            search_project_files,
            list_notes,
            get_note_content,
            create_note,
            save_note,
            update_note_meta,
            delete_note,
            search_notes,
            list_trashed_notes,
            restore_note,
            permanently_delete_note,
            empty_notes_trash,
            save_note_asset,
        ])
        .run(tauri::generate_context!())
        .expect("tauri 启动失败");
}
