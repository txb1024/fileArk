# Codex 代码开发规范

> 適用於 E:\codex 個人項目資料庫

---

## 1. 技術棧

| 層 | 技術 |
|---|------|
| 前端框架 | React 18 + TypeScript 5 |
| 構建工具 | Vite 5 |
| 後端框架 | Tauri 2.0 (Rust) |
| 圖標庫 | lucide-react |
| 樣式 | 原生 CSS + CSS 變量系統 |

---

## 2. 項目結構

```
codex/
├── src/                      # 前端源碼
│   ├── main.tsx              # React 入口
│   ├── App.tsx               # 主應用（含所有業務邏輯）
│   ├── api.ts                # Tauri API 封裝
│   ├── types.ts              # TypeScript 類型定義
│   └── styles.css            # 全局樣式
├── src-tauri/
│   ├── src/main.rs           # Rust 後端命令
│   ├── Cargo.toml            # Rust 依賴
│   ├── tauri.conf.json       # Tauri 配置
│   └── capabilities/         # 權限配置
├── dist/                     # Vite 構建輸出
├── release/                  # Tauri 資源文件
└── package.json
```

---

## 3. 命名規範

### 3.1 TypeScript / React

| 類別 | 規範 | 示例 |
|------|------|------|
| 類型/接口 | PascalCase | `type Project`, `interface AppData` |
| 枚舉成員 | PascalCase | `type View = "home" \| "projects"` |
| 變量/函數 | camelCase | `activeProjectId`, `formatDate()` |
| React 組件 | PascalCase | `HomeView`, `SettingsPanel` |
| CSS 類名 | kebab-case | `.settings-section`, `.sidebar-nav` |
| 常量 | SCREAMING_SNAKE | `MAX_FILE_SIZE` |
| 文件名 | camelCase 或 kebab-case | `api.ts`, `types.ts`, `app-state.ts` |

### 3.2 Rust

| 類別 | 規範 | 示例 |
|------|------|------|
| 結構體/枚舉 | PascalCase | `struct Project`, `enum Error` |
| 函數/方法 | snake_case | `fn read_data()`, `fn safe_folder_name()` |
| 字段 | snake_case | `workspace_root`, `created_at` |
| 與 TS 交互 | serde rename | `#[serde(rename = "workspaceRoot")]` |

---

## 4. 類型定義

### 4.1 TypeScript 類型定義

```typescript
// ✅ 正確：使用 type alias 定義數據結構
export type Project = {
  id: string;
  name: string;
  alias: string;
  tags: string[];
  path: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  recentFiles: RecentFile[];
};

// ✅ 正確：枚舉用 type union
export type View = "home" | "projects" | "inbox" | "search" | "settings" | "trash";
export type ThemeMode = "light" | "dark";

// ✅ 正確：API 接口定義
export type ArchiveApi = {
  getData: () => Promise<AppData>;
  createProject: (input: CreateProjectInput) => Promise<AppData>;
  // ...
};
```

### 4.2 Rust 類型定義

```rust
// ✅ 正確：使用 serde 序列化
#[derive(Serialize, Deserialize, Clone, Debug)]
struct Project {
    name: String,
    #[serde(rename = "alias")]
    alias: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

// ✅ 正確：Result 錯誤類型
fn read_data(app: &tauri::AppHandle) -> Result<AppData, String> {
    // ... 使用 ? 運算符傳播錯誤
}
```

---

## 5. 狀態管理

### 5.1 React 狀態分層

```typescript
// 1. 組件本地狀態
const [data, setData] = useState<AppData>(emptyData);
const [view, setView] = useState<View>("home");

// 2. 派生狀態（用 useMemo）
const sidebarProjects = useMemo(() => {
  return [...data.projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastOpenedAt.localeCompare(a.lastOpenedAt);
  });
}, [data.projects, language]);

// 3. localStorage 持久化
const [themeMode, setThemeMode] = useState<ThemeMode>(
  () => storage.get("archive.theme", "light" as ThemeMode)
);
```

### 5.2 Storage 封裝（必須使用）

```typescript
// ✅ 正確：帶錯誤處理的 storage 封裝
const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to save ${key}:`, e);
    }
  }
};
```

---

## 6. API 調用模式

### 6.1 前端 API 封裝

```typescript
// ✅ 正確：統一封裝在 api.ts
export const api: ArchiveApi = {
  getData: () => invoke<AppData>("get_data"),
  createProject: (input) => invoke<AppData>("create_project", { input }),
  openFile: (filePath) => invoke<void>("open_file", { filePath }),
  // ...
};
```

### 6.2 Rust Tauri 命令

```rust
// ✅ 正確：使用 #[tauri::command] 標記
#[tauri::command]
fn get_data(app: tauri::AppHandle) -> Result<AppData, String> {
    read_data(&app)
}

#[tauri::command]
async fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("All files", &["*"])
        .pick_files(move |paths| {
            let _ = tx.send(paths);
        });
    let paths = rx.recv().map_err(|e| e.to_string())?;
    Ok(paths.unwrap_or_default())
}
```

---

## 7. 錯誤處理

### 7.1 TypeScript 錯誤處理

```typescript
// ✅ 正確：try-catch + early return
async function handlePreviewFile(path: string, name: string) {
  setPreviewFile({ path, name, loading: true });
  try {
    const info = await api.getPreviewInfo(path);
    setPreviewFile({ path, name, loading: false, data: info });
  } catch (error) {
    setPreviewFile({ path, name, loading: false, error: String(error) });
  }
}

// ✅ 正確：條件檢查 + early return
async function addFilesToCategory(filePaths?: string[]) {
  if (!activeProject || !selectedCategory) return;
  const files = filePaths || await api.selectFiles();
  if (files.length === 0) return;
  // 業務邏輯...
}
```

### 7.2 Rust 錯誤處理

```rust
// ✅ 正確：Result 類型 + 錯誤鏈
fn read_data(app: &tauri::AppHandle) -> Result<AppData, String> {
    let registry = read_registry(app)?;
    let data_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("data")
        .join(format!("workspace-{}.json", registry.workspace_id));

    let raw = fs::read_to_string(&data_path)
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&raw)
        .map_err(|e| e.to_string())
}

// ✅ 正確：備份損壞文件
match serde_json::from_str::<AppData>(&raw) {
    Ok(data) => Ok(data),
    Err(_) => {
        let backup_path = data_path.with_extension("json.corrupt");
        let _ = fs::rename(&data_path, &backup_path);
        Ok(create_default_data())
    }
}
```

---

## 8. 樣式規範

### 8.1 CSS 變量系統

```css
/* ✅ 正確：使用 CSS 變量 */
:root {
  --bg: #eef2f6;
  --surface: #ffffff;
  --text: #1f2933;
  --muted: #627d98;
  --border: #d9e2ec;
  --accent: #2ec4b6;
}

/* ✅ 正確：主題變量覆蓋 */
.app-shell.theme-dark {
  --bg: #0d1117;
  --surface: #161b22;
  --text: #c9d1d9;
  --muted: #8b949e;
  --border: #30363d;
}

/* ✅ 正確：組件特定變量 */
.app-shell.accent-blue { --accent: #58a6ff; }
.app-shell.accent-violet { --accent: #a371f7; }
```

### 8.2 字體系統 (Apple Typography)

```css
/* ✅ 正確：清晰的字體層級 */
.text-large-title { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
.text-title-1 { font-size: 22px; font-weight: 700; }
.text-title-2 { font-size: 20px; font-weight: 600; }
.text-title-3 { font-size: 17px; font-weight: 600; }
.text-body { font-size: 15px; font-weight: 400; line-height: 1.5; }
.text-subhead { font-size: 13px; font-weight: 400; color: var(--muted); }
.text-caption { font-size: 12px; font-weight: 400; }
```

### 8.3 圖標尺寸規範

```typescript
// ✅ 正確：統一圖標尺寸
const ICON_SIZE = {
  small: 14,   // 內聯文本
  normal: 16,   // 默認
  medium: 18,   // 工具欄
  large: 48     // 空狀態
} as const;

// 使用
<Folder size={16} />
```

---

## 9. 組件規範

### 9.1 組件內聯原則

當前項目所有業務組件內聯在 App.tsx 中。

如需抽取獨立組件：

```typescript
// ✅ 正確：獨立組件文件
// src/components/Modal.tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;
  // ...
}
```

### 9.2 設置頁面樣式

```css
/* ✅ 正確：設置頁面分組卡片 */
.settings-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 24px;
}

.settings-section-header {
  padding: 8px 14px;
  background: var(--surface-soft);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.settings-row:last-child { border-bottom: none; }
```

---

## 10. 國際化

### 10.1 翻譯字符串

```typescript
// ✅ 正確：集中在翻譯對象
const translations = {
  zh: {
    home: "首頁",
    projects: "項目",
    settings: "設置",
    // ...
  },
  en: {
    home: "Home",
    projects: "Projects",
    settings: "Settings",
    // ...
  }
};

// 使用
<span>{translations[language].projects}</span>
```

---

## 11. 提交規範

### 11.1 Git 提交信息

```
<type>(<scope>): <subject>

feat: 新增項目收藏功能
fix(settings): 修復主題切換閃爍問題
docs: 更新 API 文檔
refactor(api): 重構文件操作邏輯
style: 調整設置頁面間距
```

### 11.2 分支命名

```
feature/project-folder-structure
fix/settings-theme-toggle
refactor/api-error-handling
chore/update-dependencies
```

---

## 12. 構建與發布

### 12.1 開發模式

```bash
npm run tauri dev
```

### 12.2 生產構建

```bash
npm run tauri build
```

### 12.3 輸出目錄

| 類型 | 路徑 |
|------|------|
| 可執行文件 | `src-tauri/target/release/personal-project-archive.exe` |
| 安裝包 | `src-tauri/target/release/bundle/nsis/*.exe` |

---

## 13. 待改進項

| 項目 | 當前狀態 | 建議 |
|------|----------|------|
| 組件抽取 | 全部內聯 | 抽取通用組件到 `src/components/` |
| 業務邏輯分離 | App.tsx 2200+ 行 | 抽取 hooks 到 `src/hooks/` |
| 測試覆蓋 | 無 | 添加 Vitest + Testing Library |
| Lint 配置 | 無 | 添加 ESLint + Prettier |

---

*最後更新: 2026-05-14*
