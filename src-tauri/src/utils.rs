//! 工具函数

use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// 获取当前 RFC3339 时间字符串
pub fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format_timestamp(secs)
}

/// SystemTime → RFC3339 字符串
pub fn system_time_to_rfc3339(t: SystemTime) -> String {
    let epoch = t.duration_since(UNIX_EPOCH).unwrap_or(Duration::from_secs(0));
    format_timestamp(epoch.as_secs())
}

/// Unix 时间戳 → "YYYY-MM-DDTHH:MM:SSZ"
fn format_timestamp(secs: u64) -> String {
    let days = secs / 86400;
    let rem = secs % 86400;
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;
    let (year, month, day) = jdn_to_ymd((days + 2440588) as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

/// Julian Day Number → (year, month, day)
fn jdn_to_ymd(jdn: i64) -> (i64, u32, u32) {
    let l = jdn + 68569;
    let n = (4 * l) / 146097;
    let l = l - (146097 * n + 3) / 4;
    let i = (4000 * (l + 1)) / 1461001;
    let l = l - (1461 * i) / 4 + 31;
    let j = (80 * l) / 2447;
    let day = (l - (2447 * j) / 80) as u32;
    let l = j / 11;
    let month = (j + 2 - 12 * l) as u32;
    let year = 100 * (n - 49) + i + l;
    (year, month, day)
}

/// 安全的文件夹名称
pub fn safe_folder_name(value: &str) -> String {
    use regex::Regex;
    let re = Regex::new(r#"[<>:"/\\|?*\x00-\x1F]"#).unwrap();
    let replaced = re.replace_all(value, " ");
    let re2 = Regex::new(r"\s+").unwrap();
    let collapsed = re2.replace_all(&replaced, " ");
    collapsed.trim().to_string()
}

/// 文本文件扩展名（不含 md/markdown，已归入 MARKDOWN_EXTENSIONS）
pub const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "json", "jsonc", "js", "ts", "jsx", "tsx",
    "html", "css", "scss", "less", "xml", "yaml", "yml", "toml",
    "ini", "conf", "config", "properties", "env", "gitignore",
    "log", "sql", "sh", "bat", "ps1", "py", "rb", "java", "c", "cpp",
    "h", "hpp", "cs", "go", "rs", "php", "lua", "r", "swift",
    "kt", "scala", "gradle", "dockerfile", "makefile", "vim", "editorconfig",
    "csv", "tsv",
];

/// 图片文件扩展名
pub const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp",
];

/// PDF 文件扩展名
pub const PDF_EXTENSIONS: &[&str] = &["pdf"];

/// Excel 文件扩展名
pub const EXCEL_EXTENSIONS: &[&str] = &["xlsx", "xls", "csv"];

/// Word 文件扩展名（仅 docx，doc 为老二进制格式不支持）
pub const WORD_EXTENSIONS: &[&str] = &["docx"];

/// 视频文件扩展名
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mkv", "avi", "mov"];

/// 音频文件扩展名
pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "flac", "aac", "m4a"];

/// Markdown 文件扩展名
pub const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];

/// 不可预览的文件扩展名
pub const UNSUPPORTED_EXTENSIONS: &[&str] = &[
    "exe", "msi", "dll", "sys",    // 可执行文件
    "zip", "rar", "7z", "tar", "gz", "bz2", "xz",  // 压缩包
    "dmg", "iso", "img",           // 镜像
    "bin", "dat", "db", "sqlite",  // 二进制/数据
    "doc",                         // 老 Word 二进制格式（mammoth 不支持）
];

/// 递归复制目录
pub fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 复制文件到目标目录，自动处理重名
pub fn copy_unique(
    source: &std::path::Path,
    target_dir: &std::path::Path,
) -> Result<(std::path::PathBuf, std::fs::Metadata), String> {
    std::fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let parsed = source.file_name().unwrap().to_string_lossy().to_string();
    let mut target = target_dir.join(&parsed);
    let mut index = 1;

    while target.exists() {
        let stem = std::path::Path::new(&parsed)
            .file_stem()
            .unwrap()
            .to_string_lossy();
        let ext = std::path::Path::new(&parsed)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, index)
        } else {
            format!("{} ({}).{}", stem, index, ext)
        };
        target = target_dir.join(new_name);
        index += 1;
    }

    std::fs::copy(source, &target).map_err(|e| e.to_string())?;
    let stat = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    Ok((target, stat))
}
