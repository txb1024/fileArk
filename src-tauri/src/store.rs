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
