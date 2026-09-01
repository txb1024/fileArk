//! 個人項目資料庫 - Tauri 应用入口
//!
//! 模块结构：
//!   models.rs - 数据结构定义
//!   store.rs  - 数据持久化层
//!   utils.rs  - 工具函数
//!   main.rs   - Tauri 命令 + 应用入口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod search;
mod store;
mod utils;
mod drag_export;

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
    // 用「默认根 / 工作空间名」作为新工作空间的默认根目录,
    // 避免多个工作空间的项目混在同一个 Documents/個人項目資料庫 下。
    let empty_data = store::create_default_data_for_workspace(&name);
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
    // 切换工作空间后,把旧版本残留的全局 trash.json / trashed_files/ 挪到新空间下
    // (只在迁移期生效;新建工作空间不会触发,因为路径已不冲突)
    let _ = store::migrate_legacy_trash_to_workspace(&app);
    // 顺手做一次 30 天清理
    let _ = store::cleanup_expired_trash(&app);
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
        // 新项目的分类初始化为当前全局默认分类的副本,之后完全独立
        categories: data.settings.categories.clone(),
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
fn rename_project(
    app: tauri::AppHandle,
    project_id: String,
    new_name: String,
) -> Result<AppData, String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if trimmed.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("名称包含非法字符".to_string());
    }

    let mut data = read_data(&app)?;
    let target = data
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .cloned()
        .ok_or_else(|| "找不到项目".to_string())?;

    if target.name == trimmed {
        return Ok(data);
    }

    if data
        .projects
        .iter()
        .any(|p| p.id != project_id && p.name == trimmed)
    {
        return Err("已存在同名项目".to_string());
    }

    let old_path = Path::new(&target.path);
    let mut new_project_path = target.path.clone();

    if old_path.exists() {
        if let Some(parent) = old_path.parent() {
            let candidate = parent.join(trimmed);
            if candidate.exists() {
                return Err("目标路径已存在同名文件夹".to_string());
            }
            fs::rename(old_path, &candidate).map_err(|e| format!("重命名文件夹失败: {}", e))?;
            new_project_path = candidate.to_string_lossy().to_string();
        }
    }

    let ts = utils::now_rfc3339();
    data.projects = data
        .projects
        .into_iter()
        .map(|p| {
            if p.id == project_id {
                Project {
                    name: trimmed.to_string(),
                    path: new_project_path.clone(),
                    updated_at: ts.clone(),
                    ..p
                }
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
    let old_root = data.settings.workspace_root.clone();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    data.settings.workspace_root = root.clone();
    // 切换工作目录(不迁移文件)时,把已存在项目的 path 前缀从旧根改到新根,
    // 否则点项目卡片打开会指向旧目录,触发「找不到文件」。
    rewrite_project_paths(&mut data, &old_root, &root);
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

    // 阻止「新目录是旧目录子目录」/ 反之 的迁移:不阻断会导致 copy 进自己的子目录,
    // 触发无限递归直到栈溢出 / 磁盘爆,进程崩溃(用户报告:点迁移整个应用退出)。
    if let Err(e) = ensure_not_nested(old_path, new_path) {
        return Err(e);
    }

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

    let old_root = data.settings.workspace_root.clone();
    data.settings.workspace_root = input.new_root.clone();
    // 不管选了「迁移」还是「仅切换」,项目 path 都得跟着改:文件已搬走 → 必须改;
    // 仅切换 → 用户后续手动把文件挪过去,这一刻起前端已用新根工作,旧路径就是死的。
    rewrite_project_paths(&mut data, &old_root, &input.new_root);
    write_data(&app, &data)?;
    Ok(data)
}

/// 检查两个目录是否互为子目录(canonicalize 后 components 比对,大小写不敏感)。
/// 如果 a == b、a 在 b 之下或 b 在 a 之下,返回 Err 提示用户。
/// 防止 migrate_root 把目录复制进自己的子目录触发无限递归。
fn ensure_not_nested(a: &Path, b: &Path) -> Result<(), String> {
    let canon_a = a.canonicalize().unwrap_or_else(|_| a.to_path_buf());
    let canon_b = b.canonicalize().unwrap_or_else(|_| b.to_path_buf());
    let comps_a: Vec<String> = canon_a
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let comps_b: Vec<String> = canon_b
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    if comps_a == comps_b {
        return Err("源目录和目标目录相同,无需迁移".to_string());
    }
    let nested = if comps_a.len() < comps_b.len() {
        comps_b.starts_with(&comps_a)
    } else {
        comps_a.starts_with(&comps_b)
    };
    if nested {
        return Err(format!(
            "无法迁移:目标目录是源目录的父目录或子目录\n  {}\n  {}",
            canon_a.display(),
            canon_b.display()
        ));
    }
    Ok(())
}

/// 基于 Path::components 把 `path` 中以 `old_root` 为前缀的部分替换成 `new_root`。///
/// 之前用 `&path[old_bs.len()..]` 字节切片实现,**含中文路径时如果分隔符差异 / lowercase
/// 改了字节长度,old_bs.len() 可能落在 UTF-8 字符中间,直接 panic abort 进程**。
/// components 按路径段比对,对大小写不敏感,绝对安全。
///
/// 返回 Some(new_path) 表示前缀匹配并改写;None 表示不匹配,调用者保留原 path。
fn rewrite_path_prefix(path_str: &str, old_root: &str, new_root: &str) -> Option<String> {
    let path = Path::new(path_str);
    let old = Path::new(old_root.trim_end_matches(['\\', '/']));

    let path_comps: Vec<_> = path.components().collect();
    let old_comps: Vec<_> = old.components().collect();
    if old_comps.is_empty() || path_comps.len() < old_comps.len() {
        return None;
    }
    // 逐段比较(忽略大小写)。Windows 文件系统不区分大小写,需要这种比对方式。
    for (oc, pc) in old_comps.iter().zip(path_comps.iter()) {
        let oc_str = oc.as_os_str().to_string_lossy().to_lowercase();
        let pc_str = pc.as_os_str().to_string_lossy().to_lowercase();
        if oc_str != pc_str {
            return None;
        }
    }
    // 拼接 new_root + 剩余 components
    let mut new_pb = std::path::PathBuf::from(new_root.trim_end_matches(['\\', '/']));
    for c in &path_comps[old_comps.len()..] {
        new_pb.push(c.as_os_str());
    }
    Some(new_pb.to_string_lossy().to_string())
}

/// 把所有项目 path 字段中以旧根为前缀的部分替换成新根。
fn rewrite_project_paths(data: &mut AppData, old_root: &str, new_root: &str) {
    if old_root.is_empty() || old_root == new_root {
        return;
    }
    for p in data.projects.iter_mut() {
        if let Some(new_path) = rewrite_path_prefix(&p.path, old_root, new_root) {
            p.path = new_path;
        }
    }
}

/// 一次性修复:遍历所有工作空间数据文件,如果 `workspace_root` 还是默认根(说明从没改过,
/// 是旧版逻辑创建的),改成 `default_root / 工作空间名` 让多个工作空间互相隔离。
///
/// 同时**物理迁移**该工作空间下项目的目录:把旧 path 上存在的文件夹整体搬到新 path 下,
/// 同盘符用 `fs::rename`(秒迁),跨盘符 fallback 到 `copy + remove`。
///
/// 返回 [修复的工作空间数, 物理迁移的项目数, 当前活动工作空间的最新 AppData]。
#[tauri::command]
fn repair_workspace_roots(app: tauri::AppHandle) -> Result<(usize, usize, AppData), String> {
    let registry = read_registry(&app)?;
    let default_root_str = store::default_root().to_string_lossy().to_string();
    let mut fixed = 0usize;
    let mut migrated_files = 0usize;

    for ws in &registry.workspaces {
        let path = store::workspace_data_path(&app, &ws.data_file);
        if !path.exists() {
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut data: AppData = match serde_json::from_str(&raw) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let cur = data.settings.workspace_root.trim_end_matches(['\\', '/']).to_string();
        let def = default_root_str.trim_end_matches(['\\', '/']).to_string();
        if cur != def {
            continue;
        }
        let safe = utils::safe_folder_name(&ws.name);
        if safe.is_empty() {
            continue;
        }
        let new_root = store::default_root().join(&safe).to_string_lossy().to_string();
        let old_root = data.settings.workspace_root.clone();
        // 确保新 root 目录已建
        let _ = fs::create_dir_all(&new_root);
        data.settings.workspace_root = new_root.clone();

        // 先迁移文件,再 rewrite_project_paths 改 path 字段:
        // 旧 path 物理存在且新 path 不存在 → 整目录搬过去。
        // 用 rewrite_path_prefix 计算 dst,避免字节切片在含中文 / 大小写 / 分隔符差异时 panic。
        for p in data.projects.iter() {
            let src_str = p.path.clone();
            let src = Path::new(&src_str);
            if !src.exists() {
                continue;
            }
            let dst_str = match rewrite_path_prefix(&src_str, &old_root, &new_root) {
                Some(s) => s,
                None => continue,
            };
            if dst_str == src_str {
                continue;
            }
            let dst = Path::new(&dst_str);
            if dst.exists() {
                continue; // 目标已存在,不覆盖,留给用户手动处理
            }
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            // 同盘符 rename 快;跨盘符走 copy + remove
            let moved = if fs::rename(src, dst).is_ok() {
                true
            } else {
                match utils::copy_dir_all(src, dst) {
                    Ok(()) => fs::remove_dir_all(src).is_ok(),
                    Err(_) => false,
                }
            };
            if moved {
                migrated_files += 1;
            }
        }

        // 最后统一改 path 字段
        rewrite_project_paths(&mut data, &old_root, &new_root);
        let new_json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
        fs::write(&path, new_json).map_err(|e| e.to_string())?;
        fixed += 1;
    }

    let data = read_data(&app)?;
    Ok((fixed, migrated_files, data))
}

/// 一次性修复:把所有「path 不存在」的项目,重置到当前 workspace_root/{项目名} 下。
/// 用于历史遗留:之前迁移工作目录但项目 path 没跟着改的场景。
/// 不要求目标目录已存在(只是设置 path,真正打开时按需创建)。
/// 返回 [修好的项目数, 最新的 AppData]。
#[tauri::command]
fn repair_project_paths(app: tauri::AppHandle) -> Result<(usize, AppData), String> {
    let mut data = read_data(&app)?;
    let root = data.settings.workspace_root.clone();
    if root.is_empty() {
        return Ok((0, data));
    }
    let root_path = Path::new(&root);
    let mut fixed = 0usize;
    for p in data.projects.iter_mut() {
        if Path::new(&p.path).exists() {
            continue;
        }
        // 重置 path 为 {workspace_root}/{项目名};即使目录还不存在也改,
        // 后续打开 / 添加文件时再 fs::create_dir_all。
        let candidate = root_path.join(&p.name);
        let new_path = candidate.to_string_lossy().to_string();
        if p.path != new_path {
            p.path = new_path;
            fixed += 1;
        }
    }
    if fixed > 0 {
        write_data(&app, &data)?;
    }
    Ok((fixed, data))
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 分类
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn update_categories(app: tauri::AppHandle, categories: Vec<String>) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    // 写入时按名称排序(大小写不敏感),保证所有展示自动有序
    let mut sorted = categories;
    sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    data.settings.categories = sorted;
    write_data(&app, &data)?;
    Ok(data)
}

/// 更新单个项目的分类列表(项目级独立,不影响其他项目)。
/// 名称按大小写不敏感排序后写入,保证侧栏展示顺序稳定。
#[tauri::command]
fn update_project_categories(
    app: tauri::AppHandle,
    project_id: String,
    categories: Vec<String>,
) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let mut sorted = categories;
    sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    let project = data
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| "项目不存在".to_string())?;
    project.categories = sorted;
    project.updated_at = utils::now_rfc3339();
    write_data(&app, &data)?;
    Ok(data)
}

/// 扫描项目根目录下的一级子目录,把结果同步到 project.categories(过滤隐藏目录)。
/// 用户在文件管理器里增删/重命名分类目录后,前端调用此命令把内存 categories
/// 与磁盘对齐。文件监视器触发时也会再调一次,保持双向一致。
#[tauri::command]
fn sync_project_categories(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let project_path = data
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| "项目不存在".to_string())?
        .path
        .clone();
    let path = Path::new(&project_path);
    if !path.exists() {
        return Ok(data);
    }
    let mut scanned: Vec<String> = vec![];
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            let name = entry.file_name().to_string_lossy().to_string();
            // 跳过隐藏目录(.git/.DS_Store 等)
            if !name.starts_with('.') {
                scanned.push(name);
            }
        }
    }
    scanned.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    let project = data
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .unwrap();
    if project.categories != scanned {
        project.categories = scanned;
        project.updated_at = utils::now_rfc3339();
        write_data(&app, &data)?;
    }
    Ok(data)
}

/// 在项目根下创建一级分类目录(物理 mkdir),返回 sync 后的 AppData。
#[tauri::command]
fn create_project_category(
    app: tauri::AppHandle,
    project_id: String,
    name: String,
) -> Result<AppData, String> {
    let project_path = {
        let data = read_data(&app)?;
        data.projects
            .iter()
            .find(|p| p.id == project_id)
            .ok_or_else(|| "项目不存在".to_string())?
            .path
            .clone()
    };
    let dir = Path::new(&project_path).join(&name);
    if dir.exists() {
        return Err("分类已存在".to_string());
    }
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    sync_project_categories(app, project_id)
}

/// 重命名分类目录(物理 rename),返回 sync 后的 AppData。
#[tauri::command]
fn rename_project_category(
    app: tauri::AppHandle,
    project_id: String,
    old_name: String,
    new_name: String,
) -> Result<AppData, String> {
    let project_path = {
        let data = read_data(&app)?;
        data.projects
            .iter()
            .find(|p| p.id == project_id)
            .ok_or_else(|| "项目不存在".to_string())?
            .path
            .clone()
    };
    let from = Path::new(&project_path).join(&old_name);
    let to = Path::new(&project_path).join(&new_name);
    if !from.exists() {
        return Err("源分类目录不存在".to_string());
    }
    if to.exists() {
        return Err("目标分类目录已存在".to_string());
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())?;
    sync_project_categories(app, project_id)
}

/// 删除分类目录(整目录移到回收站,可在回收站恢复)。返回 sync 后的 AppData。
#[tauri::command]
fn delete_project_category(
    app: tauri::AppHandle,
    project_id: String,
    category: String,
) -> Result<AppData, String> {
    let (project_path, project_name) = {
        let data = read_data(&app)?;
        let p = data
            .projects
            .iter()
            .find(|p| p.id == project_id)
            .ok_or_else(|| "项目不存在".to_string())?;
        (p.path.clone(), p.name.clone())
    };
    let dir = Path::new(&project_path).join(&category);
    if dir.exists() {
        let trashed = store::move_file_into_trash(
            &app,
            &dir,
            Some(project_id.clone()),
            Some(project_name),
            Some(category.clone()),
        )?;
        let mut trash = store::read_trash(&app)?;
        trash.files.push(trashed);
        store::write_trash(&app, &trash)?;
    }
    sync_project_categories(app, project_id)
}

/// 自定义便签附件存放路径。传入 None 或空字符串 = 恢复默认 `{workspaceRoot}/notes/assets`。
#[tauri::command]
fn set_note_assets_path(
    app: tauri::AppHandle,
    path: Option<String>,
) -> Result<AppData, String> {
    let mut data = read_data(&app)?;
    let cleaned = path
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    data.settings.note_assets_path = cleaned;
    write_data(&app, &data)?;
    Ok(data)
}

/// 返回当前生效的附件目录(自定义优先,否则默认),并确保目录存在。
#[tauri::command]
fn get_note_assets_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(store::notes_assets_dir(&app).to_string_lossy().to_string())
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
fn select_root(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // 注意:不能用 `async fn` + 同步 rx.recv() — 会阻塞 async runtime 导致 dialog
    // callback 永远拿不到执行,UI 卡住。改成 sync 命令(Tauri 自动 spawn_blocking)
    // + std::sync::mpsc 阻塞这个独立 worker 线程,主 runtime 不受影响。
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.and_then(|p| Some(p.to_string())));
    });
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    // 同 select_root,改 sync 防 async runtime 死锁
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
    // 目录不存在(常见于:迁移工作目录后,旧分类目录还没建)就按需创建,
    // 避免 Windows 资源管理器弹出「找不到文件」对话框。
    let p = Path::new(&folder_path);
    if !p.exists() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    open::that(&folder_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(
    app: tauri::AppHandle,
    file_path: String,
    project_id: Option<String>,
    project_name: Option<String>,
    category: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    // 移入回收站(而非真删);30 天后被 cleanup_expired_trash 自动永久清理
    let trashed = store::move_file_into_trash(&app, path, project_id, project_name, category)?;
    let mut trash = store::read_trash(&app)?;
    trash.files.push(trashed);
    store::write_trash(&app, &trash)?;
    Ok(())
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

/// 原地重命名文件/文件夹:目标名已存在则报错(不自动加 (1))。
#[tauri::command]
fn rename_file_in_place(source_path: String, new_name: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("源文件不存在".to_string());
    }
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if trimmed.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("名称不能包含 \\ / : * ? \" < > |".to_string());
    }
    let parent = source.parent().ok_or("无法获取父目录")?;
    let target = parent.join(trimmed);
    // 同名(忽略大小写)且不是 case-only rename → 视为相同,直接返回
    let current_name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if current_name == trimmed {
        return Ok(source_path);
    }
    if target.exists() {
        return Err(format!("已存在同名文件:{}", trimmed));
    }
    fs::rename(source, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
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
    } else if utils::IPYNB_EXTENSIONS.contains(&ext.as_str()) {
        "ipynb".to_string()
    } else if utils::EPUB_EXTENSIONS.contains(&ext.as_str()) {
        "epub".to_string()
    } else if utils::ARCHIVE_EXTENSIONS.contains(&ext.as_str()) {
        "archive".to_string()
    } else if utils::SUBTITLE_EXTENSIONS.contains(&ext.as_str()) {
        "subtitle".to_string()
    } else if utils::EMAIL_EXTENSIONS.contains(&ext.as_str()) {
        "email".to_string()
    } else if utils::MODEL3D_EXTENSIONS.contains(&ext.as_str()) {
        "model3d".to_string()
    } else if utils::FONT_EXTENSIONS.contains(&ext.as_str()) {
        "font".to_string()
    } else if utils::GEO_EXTENSIONS.contains(&ext.as_str()) {
        "geo".to_string()
    } else if utils::RTF_EXTENSIONS.contains(&ext.as_str()) {
        "rtf".to_string()
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
    } else if ext == "doc" {
        // .doc 在前端给友好提示（mammoth 仅支持 docx）
        "word_legacy".to_string()
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
async fn search_project_files(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<SearchFileResult>, String> {
    let data = read_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || search::search_project_files(&data.projects, &query))
        .await
        .map_err(|error| error.to_string())
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
fn list_notes_tree(app: tauri::AppHandle) -> Result<Vec<NoteTreeNode>, String> {
    migrate_old_notes_if_needed(&app)?;
    let index = read_notes_index(&app)?;
    let root = notes_dir(&app);
    Ok(scan_tree(&app, &root, "", &index))
}

#[tauri::command]
fn get_note_content(app: tauri::AppHandle, id: String) -> Result<String, String> {
    read_note_content(&app, &id)
}

#[tauri::command]
fn create_note(app: tauri::AppHandle, input: CreateNoteInput) -> Result<NoteMeta, String> {
    create_note_entry(&app, &input.parent, input.name.as_deref())
}

#[tauri::command]
fn create_folder(app: tauri::AppHandle, input: CreateFolderInput) -> Result<NoteTreeNode, String> {
    create_folder_entry(&app, &input.parent, &input.name)
}

#[tauri::command]
fn save_note(app: tauri::AppHandle, id: String, content: String) -> Result<NoteMeta, String> {
    save_note_entry(&app, &id, &content)
}

#[tauri::command]
fn update_note_meta(app: tauri::AppHandle, id: String, input: UpdateNoteMetaInput) -> Result<(), String> {
    update_note_meta_entry(&app, &id, input.tags, input.pinned)
}

#[tauri::command]
fn rename_note(app: tauri::AppHandle, id: String, new_name: String) -> Result<NoteMeta, String> {
    rename_note_entry(&app, &id, &new_name)
}

#[tauri::command]
fn rename_folder(app: tauri::AppHandle, path: String, new_name: String) -> Result<String, String> {
    rename_folder_entry(&app, &path, &new_name)
}

#[tauri::command]
fn move_note(app: tauri::AppHandle, id: String, new_parent: String) -> Result<NoteMeta, String> {
    move_note_entry(&app, &id, &new_parent)
}

#[tauri::command]
fn move_folder(app: tauri::AppHandle, path: String, new_parent: String) -> Result<String, String> {
    move_folder_entry(&app, &path, &new_parent)
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, id: String) -> Result<(), String> {
    delete_note_entry(&app, &id)
}

#[tauri::command]
fn delete_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    delete_folder_entry(&app, &path)
}

#[tauri::command]
fn list_trashed_notes(app: tauri::AppHandle) -> Result<Vec<TrashedNote>, String> {
    // 顺手做一次 30 天清理（便签/项目/文件都会被瘦身）
    let _ = store::cleanup_expired_trash(&app);
    let index = read_notes_index(&app)?;
    Ok(index.trash)
}

#[tauri::command]
fn restore_note(app: tauri::AppHandle, trash_id: String) -> Result<NoteMeta, String> {
    restore_note_entry(&app, &trash_id)
}

#[tauri::command]
fn permanently_delete_note(app: tauri::AppHandle, trash_id: String) -> Result<(), String> {
    permanently_delete_note_store(&app, &trash_id)
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
        return Ok(index.meta.values().cloned().collect());
    }
    // 限制结果数,防止便签量大时把 N 个文件全 read 一遍
    let max_results = 30;
    let mut results: Vec<NoteMeta> = vec![];
    // 第一遍:只查 meta(零 IO,极快)。命中 max_results 直接返回。
    for note in index.meta.values() {
        let meta_match = note.title.to_lowercase().contains(&lower)
            || note.name.to_lowercase().contains(&lower)
            || note.parent.to_lowercase().contains(&lower)
            || note.tags.iter().any(|t| t.to_lowercase().contains(&lower))
            || note.snippet.to_lowercase().contains(&lower);
        if meta_match {
            results.push(note.clone());
            if results.len() >= max_results {
                results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
                return Ok(results);
            }
        }
    }
    // 第二遍:meta 没命中的便签才 read 正文(慢路径)。
    let already: std::collections::HashSet<String> =
        results.iter().map(|r| r.id.clone()).collect();
    for (id, note) in index.meta.iter() {
        if already.contains(id) {
            continue;
        }
        if let Ok(content) = read_note_content(&app, id) {
            let haystack = if id.ends_with(".bnote") {
                extract_plain_text_from_blocks(&content).to_lowercase()
            } else {
                content.to_lowercase()
            };
            if haystack.contains(&lower) {
                results.push(note.clone());
                if results.len() >= max_results {
                    break;
                }
            }
        }
    }
    results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(results)
}

#[tauri::command]
fn list_pending_migrations(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    list_pending_migrations_entry(&app)
}

#[tauri::command]
fn migrate_md_to_bnote(
    app: tauri::AppHandle,
    old_id: String,
    bnote_content: String,
) -> Result<NoteMeta, String> {
    migrate_md_to_bnote_entry(&app, &old_id, &bnote_content)
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
//  Tauri Commands - 系统剪贴板写入 & 文件拖出
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    drag_export::copy_files_to_clipboard(&paths)
}

// ═══════════════════════════════════════════════════════════════
//  Tauri Commands - 回收站
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn get_trash_items(app: tauri::AppHandle) -> Result<Vec<TrashItem>, String> {
    let _ = store::cleanup_expired_trash(&app);
    let trash = read_trash(&app)?;
    Ok(trash.items)
}

#[tauri::command]
fn list_trashed_files(app: tauri::AppHandle) -> Result<Vec<TrashedFile>, String> {
    let _ = store::cleanup_expired_trash(&app);
    let trash = read_trash(&app)?;
    Ok(trash.files)
}

#[tauri::command]
fn restore_trashed_file(app: tauri::AppHandle, file_id: String) -> Result<String, String> {
    store::restore_trashed_file_entry(&app, &file_id)
}

#[tauri::command]
fn permanently_delete_trashed_file(app: tauri::AppHandle, file_id: String) -> Result<(), String> {
    store::permanently_delete_trashed_file_entry(&app, &file_id)
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
        // 恢复时用当前全局分类作为初始;之后该项目独立。
        categories: data.settings.categories.clone(),
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
//  Tauri Commands - 日历 / 待办
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
fn list_todos(app: tauri::AppHandle) -> Result<Vec<Todo>, String> {
    Ok(read_todos(&app)?.todos)
}

#[tauri::command]
fn create_todo(app: tauri::AppHandle, input: CreateTodoInput) -> Result<Todo, String> {
    let now = utils::now_rfc3339();
    let todo = Todo {
        id: Uuid::new_v4().to_string(),
        title: input.title,
        notes: input.notes,
        start: input.start,
        end: input.end,
        done: false,
        color: if input.color.is_empty() { "sky".to_string() } else { input.color },
        remind_offset_min: input.remind_offset_min,
        reminded: false,
        created_at: now.clone(),
        updated_at: now,
    };
    let mut store_data = read_todos(&app)?;
    store_data.todos.push(todo.clone());
    write_todos(&app, &store_data)?;
    Ok(todo)
}

#[tauri::command]
fn update_todo(
    app: tauri::AppHandle,
    id: String,
    input: UpdateTodoInput,
) -> Result<Todo, String> {
    let mut store_data = read_todos(&app)?;
    let todo = store_data
        .todos
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("找不到待办")?;
    if let Some(v) = input.title { todo.title = v; }
    if let Some(v) = input.notes { todo.notes = v; }
    if let Some(v) = input.start {
        // start 改了 → 清空 reminded 让重新评估
        if v != todo.start { todo.reminded = false; }
        todo.start = v;
    }
    if let Some(v) = input.end { todo.end = v; }
    if let Some(v) = input.done { todo.done = v; }
    if let Some(v) = input.color { todo.color = v; }
    if let Some(v) = input.remind_offset_min {
        // 提醒偏移改了 → 清空 reminded
        if v != todo.remind_offset_min { todo.reminded = false; }
        todo.remind_offset_min = v;
    }
    if let Some(v) = input.reminded { todo.reminded = v; }
    todo.updated_at = utils::now_rfc3339();
    let result = todo.clone();
    write_todos(&app, &store_data)?;
    Ok(result)
}

#[tauri::command]
fn toggle_todo_done(app: tauri::AppHandle, id: String) -> Result<Todo, String> {
    let mut store_data = read_todos(&app)?;
    let todo = store_data
        .todos
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("找不到待办")?;
    todo.done = !todo.done;
    todo.updated_at = utils::now_rfc3339();
    let result = todo.clone();
    write_todos(&app, &store_data)?;
    Ok(result)
}

#[tauri::command]
fn delete_todo(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut store_data = read_todos(&app)?;
    store_data.todos.retain(|t| t.id != id);
    write_todos(&app, &store_data)
}

// ═══════════════════════════════════════════════════════════════
//  入口
// ═══════════════════════════════════════════════════════════════

fn app_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap()
}

fn main() {
    tauri::Builder::default()
        // 必须最先注册：后续启动的进程会立即退出，并通过回调唤醒现有主窗口。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
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

            // 启动时跑一次 30 天清理(过期的项目 / 项目文件 / 便签都会被永久移除)
            // 顺带把旧版本共享的 trash.json 迁移到当前工作空间专属路径下
            let cleanup_handle = app_handle.clone();
            std::thread::spawn(move || {
                let _ = store::migrate_legacy_trash_to_workspace(&cleanup_handle);
                let _ = store::cleanup_expired_trash(&cleanup_handle);
            });

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
            update_project_categories,
            sync_project_categories,
            create_project_category,
            rename_project_category,
            delete_project_category,
            set_note_assets_path,
            get_note_assets_dir,
            repair_project_paths,
            repair_workspace_roots,
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
            rename_file_in_place,
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
            copy_files_to_clipboard,
            get_trash_items,
            delete_project,
            rename_project,
            restore_project,
            permanently_delete_trash_item,
            empty_trash,
            list_trashed_files,
            restore_trashed_file,
            permanently_delete_trashed_file,
            start_watching,
            stop_watching,
            search_project_files,
            list_notes_tree,
            get_note_content,
            create_note,
            create_folder,
            save_note,
            update_note_meta,
            rename_note,
            rename_folder,
            move_note,
            move_folder,
            delete_note,
            delete_folder,
            search_notes,
            list_pending_migrations,
            migrate_md_to_bnote,
            list_trashed_notes,
            restore_note,
            permanently_delete_note,
            empty_notes_trash,
            save_note_asset,
            list_todos,
            create_todo,
            update_todo,
            toggle_todo_done,
            delete_todo,
        ])
        .run(tauri::generate_context!())
        .expect("tauri 启动失败");
}
