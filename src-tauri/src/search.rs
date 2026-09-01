use crate::models::{Project, SearchFileResult};
use std::fs;
use std::path::Path;

const MAX_RESULTS: usize = 50;
const MAX_SCANNED_ENTRIES: usize = 100_000;

struct RankedResult {
    score: usize,
    depth: usize,
    result: SearchFileResult,
}

/// 搜索全部项目目录，并按文件名匹配质量排序。
///
/// 查询中的空白会被视为关键词分隔符，所有关键词都需要在文件名或相对路径中出现。
/// 搜索不会跟随符号链接，并设置扫描上限，避免异常目录拖慢应用。
pub fn search_project_files(projects: &[Project], query: &str) -> Vec<SearchFileResult> {
    let terms = query_terms(query);
    if terms.is_empty() {
        return Vec::new();
    }

    let mut ranked = Vec::new();
    let mut scanned_entries = 0usize;

    'projects: for project in projects {
        let project_path = Path::new(&project.path);
        if !project_path.is_dir() {
            continue;
        }

        let mut stack = vec![project_path.to_path_buf()];
        while let Some(dir) = stack.pop() {
            let entries = match fs::read_dir(&dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                scanned_entries += 1;
                if scanned_entries > MAX_SCANNED_ENTRIES {
                    break 'projects;
                }

                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }

                let path = entry.path();
                let file_type = match entry.file_type() {
                    Ok(file_type) => file_type,
                    Err(_) => continue,
                };
                let is_directory = file_type.is_dir();
                let relative_path = path.strip_prefix(project_path).unwrap_or(&path);

                if let Some(score) = match_score(&name, relative_path, &terms) {
                    let size = if is_directory {
                        0
                    } else {
                        entry
                            .metadata()
                            .map(|metadata| metadata.len() as i64)
                            .unwrap_or(0)
                    };
                    ranked.push(RankedResult {
                        score,
                        depth: relative_path.components().count(),
                        result: SearchFileResult {
                            name: name.clone(),
                            path: path.to_string_lossy().to_string(),
                            project_id: project.id.clone(),
                            project_name: project.name.clone(),
                            category: category_for(relative_path, is_directory),
                            size,
                            is_directory,
                        },
                    });
                }

                if is_directory {
                    stack.push(path);
                }
            }
        }
    }

    ranked.sort_by(|a, b| {
        a.score
            .cmp(&b.score)
            .then_with(|| a.result.is_directory.cmp(&b.result.is_directory))
            .then_with(|| a.depth.cmp(&b.depth))
            .then_with(|| {
                a.result
                    .name
                    .to_lowercase()
                    .cmp(&b.result.name.to_lowercase())
            })
            .then_with(|| a.result.path.cmp(&b.result.path))
    });
    ranked.truncate(MAX_RESULTS);
    ranked.into_iter().map(|item| item.result).collect()
}

fn query_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(str::to_lowercase)
        .collect()
}

fn match_score(name: &str, relative_path: &Path, terms: &[String]) -> Option<usize> {
    let lower_name = name.to_lowercase();
    let lower_stem = Path::new(name)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let lower_path = relative_path.to_string_lossy().to_lowercase();
    let mut total = 0usize;

    for term in terms {
        let term_score = if lower_name == *term {
            0
        } else if lower_stem == *term {
            1
        } else if lower_name.starts_with(term) {
            10
        } else if let Some(position) = lower_name.find(term) {
            20 + position
        } else if let Some(position) = lower_path.find(term) {
            60 + position
        } else {
            return None;
        };
        total += term_score;
    }

    Some(total)
}

fn category_for(relative_path: &Path, is_directory: bool) -> String {
    let components: Vec<_> = relative_path.components().collect();
    if components.len() > 1 || is_directory {
        components
            .first()
            .map(|component| component.as_os_str().to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be valid")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("fileark-search-{suffix}"));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn project(path: &Path) -> Project {
        Project {
            id: "project-1".into(),
            name: "资料库".into(),
            alias: String::new(),
            tags: Vec::new(),
            path: path.to_string_lossy().to_string(),
            pinned: false,
            created_at: String::new(),
            updated_at: String::new(),
            last_opened_at: None,
            recent_files: Vec::new(),
            categories: Vec::new(),
        }
    }

    #[test]
    fn searches_beyond_the_old_four_level_limit() {
        let root = TestDir::new();
        let deep = root.0.join("文档/一/二/三/四/五");
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("部署说明.md"), "test").unwrap();

        let results = search_project_files(&[project(&root.0)], "部署");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "部署说明.md");
        assert_eq!(results[0].project_id, "project-1");
        assert_eq!(results[0].category, "文档");
    }

    #[test]
    fn supports_multiple_terms_across_name_and_path() {
        let root = TestDir::new();
        let category = root.0.join("支付资料");
        fs::create_dir_all(&category).unwrap();
        fs::write(category.join("接口说明.md"), "test").unwrap();
        fs::write(category.join("会议记录.md"), "test").unwrap();

        let results = search_project_files(&[project(&root.0)], "支付 接口");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "接口说明.md");
    }

    #[test]
    fn ranks_exact_file_name_before_partial_matches() {
        let root = TestDir::new();
        fs::write(root.0.join("方案.md"), "test").unwrap();
        fs::write(root.0.join("旧方案备份.md"), "test").unwrap();

        let results = search_project_files(&[project(&root.0)], "方案");

        assert_eq!(results[0].name, "方案.md");
        assert_eq!(results[1].name, "旧方案备份.md");
    }

    #[test]
    fn skips_hidden_directories() {
        let root = TestDir::new();
        let hidden = root.0.join(".cache");
        fs::create_dir_all(&hidden).unwrap();
        fs::write(hidden.join("秘密资料.md"), "test").unwrap();

        let results = search_project_files(&[project(&root.0)], "秘密");

        assert!(results.is_empty());
    }
}
