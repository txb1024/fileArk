//! 数据持久化层

use crate::models::{AppData, Project, TrashData, WorkspaceMeta, WorkspaceRegistry};
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

// ── 推断 ────────────────────────────────────────────────────

/// 根据文件名推断分类
pub fn infer_category(file_name: &str, categories: &[String]) -> String {
    let lower = file_name.to_lowercase();
    let rules: Vec<(&[&str], &str)> = vec![
        (&["需求", "prd"], "01_需求"),
        (&["方案", "架構", "設計方案"], "02_技術方案"),
        (&["功能", "原型", "流程"], "03_功能設計"),
        (&["表", "字段", "資料庫", "database", "sql"], "04_表格設計"),
        (&["接口", "api", "json"], "05_接口文檔"),
        (&["會議", "紀要", "meeting"], "06_會議記錄"),
        (&["測試", "用例", "test"], "07_測試資料"),
        (&["截圖", "screenshot", ".png", ".jpg", ".jpeg"], "08_截圖素材"),
        (&["交付", "確認", "正式"], "09_交付物"),
    ];

    for (keys, category) in rules {
        if keys.iter().any(|k| lower.contains(&k.to_lowercase())) {
            if categories.contains(&category.to_string()) {
                return category.to_string();
            }
        }
    }

    if categories.contains(&"99_臨時資料".to_string()) {
        "99_臨時資料".to_string()
    } else {
        categories.first().cloned().unwrap_or_default()
    }
}

/// 根据文件名推断项目
pub fn infer_project<'a>(file_name: &str, projects: &'a [Project]) -> Option<&'a Project> {
    let lower = file_name.to_lowercase();
    projects.iter().find(|project| {
        let words: Vec<&str> = std::iter::empty()
            .chain(project.name.split_whitespace())
            .chain(project.alias.split_whitespace())
            .chain(project.tags.iter().map(|t| t.as_str()))
            .collect::<Vec<_>>();
        words.iter().any(|w| lower.contains(&w.to_lowercase()))
    })
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
