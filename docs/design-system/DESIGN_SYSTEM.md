# FileArk Design System v2.0

> **Design Philosophy**: 简约现代 — 以 Notion / Linear 为灵感，追求干净利落的视觉表达，注重留白与层次感，深色侧边栏 + 浅色内容区，打造专业且高效的桌面文件管理体验。

---

## 1. Design Tokens — 设计令牌

### 1.1 Color System — 色彩体系

#### Primary Palette — 主色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-primary-50` | `#f0fdfa` | `#042f2e` | 极浅背景 |
| `--color-primary-100` | `#ccfbf1` | `#064e3b` | 浅色背景 |
| `--color-primary-200` | `#99f6e4` | `#065f46` | 浅色高亮 |
| `--color-primary-300` | `#5eead4` | `#047857` | 边框/分割线 |
| `--color-primary-400` | `#2dd4bf` | `#059669` | 次要强调 |
| `--color-primary-500` | `#14b8a6` | `#10b981` | **主色** — 按钮、链接、活跃态 |
| `--color-primary-600` | `#0d9488` | `#34d399` | 悬停态 |
| `--color-primary-700` | `#0f766e` | `#6ee7b7` | 按压态 |
| `--color-primary-800` | `#115e59` | `#a7f3d0` | 深色文字 |
| `--color-primary-900` | `#134e4a` | `#d1fae5` | 极深文字 |

> **设计决策**: 采用 Teal 色系作为主色，传递"归档/存储"的可靠与安全感，区别于常见的蓝色系，形成独特品牌识别。

#### Neutral Palette — 中性色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-neutral-0` | `#ffffff` | `#0f172a` | 纯白/纯黑 |
| `--color-neutral-50` | `#f8fafc` | `#1e293b` | 页面背景 |
| `--color-neutral-100` | `#f1f5f9` | `#334155` | 次级背景 |
| `--color-neutral-200` | `#e2e8f0` | `#475569` | 边框 |
| `--color-neutral-300` | `#cbd5e1` | `#64748b` | 分割线/禁用边框 |
| `--color-neutral-400` | `#94a3b8` | `#94a3b8` | 占位符文字 |
| `--color-neutral-500` | `#64748b` | `#cbd5e1` | 次要文字 |
| `--color-neutral-600` | `#475569` | `#e2e8f0` | 正文文字 |
| `--color-neutral-700` | `#334155` | `#f1f5f9` | 标题文字 |
| `--color-neutral-800` | `#1e293b` | `#f8fafc` | 强调文字 |
| `--color-neutral-900` | `#0f172a` | `#ffffff` | 最高对比文字 |

#### Semantic Colors — 语义色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-success-50` | `#f0fdf4` | `#052e16` | 成功背景 |
| `--color-success-500` | `#22c55e` | `#4ade80` | 成功 — 操作完成 |
| `--color-success-700` | `#15803d` | `#86efac` | 成功文字 |
| `--color-warning-50` | `#fffbeb` | `#422006` | 警告背景 |
| `--color-warning-500` | `#f59e0b` | `#fbbf24` | 警告 — 需要注意 |
| `--color-warning-700` | `#b45309` | `#fde68a` | 警告文字 |
| `--color-error-50` | `#fef2f2` | `#450a0a` | 错误背景 |
| `--color-error-500` | `#ef4444` | `#f87171` | 错误 — 删除/危险 |
| `--color-error-700` | `#b91c1c` | `#fca5a5` | 错误文字 |
| `--color-info-50` | `#eff6ff` | `#172554` | 信息背景 |
| `--color-info-500` | `#3b82f6` | `#60a5fa` | 信息 — 提示 |
| `--color-info-700` | `#1d4ed8` | `#93c5fd` | 信息文字 |

#### Surface & Background — 表面与背景

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--bg-page` | `#f1f5f9` | `#0f172a` | 页面底色 |
| `--bg-surface` | `#ffffff` | `#1e293b` | 卡片/面板 |
| `--bg-surface-raised` | `#f8fafc` | `#334155` | 浮起面板/输入框底 |
| `--bg-surface-overlay` | `#ffffff` | `#1e293b` | 弹窗/浮层 |
| `--bg-sidebar` | `#0f172a` | `#020617` | 侧边栏（始终深色） |
| `--bg-sidebar-hover` | `#1e293b` | `#0f172a` | 侧边栏悬停 |
| `--bg-sidebar-active` | `#14b8a620` | `#14b8a630` | 侧边栏活跃项 |

#### Accent Variants — 强调色变体

| 变体 | 主色值 | 场景 |
|------|--------|------|
| `teal` (默认) | `#14b8a6` | 默认主题，传达可靠、归档感 |
| `blue` | `#3b82f6` | 专业模式，传达效率、精确 |
| `violet` | `#8b5cf6` | 创意模式，传达灵感、个性 |
| `orange` | `#f59e0b` | 活力模式，传达活力、醒目 |

---

### 1.2 Typography System — 字体排版系统

#### Font Family — 字体族

```css
--font-sans: "Inter", "Microsoft YaHei UI", "Segoe UI", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", "Cascadia Code", "Fira Code", monospace;
```

> **设计决策**: Inter 作为主字体，兼顾中英文渲染质量；JetBrains Mono 用于代码预览和文件大小显示。

#### Type Scale — 字号阶梯

| Token | Size | Line Height | Weight | Letter Spacing | 用途 |
|-------|------|-------------|--------|----------------|------|
| `--text-display` | 28px | 1.3 | 700 | -0.02em | 大标题/英雄区 |
| `--text-h1` | 24px | 1.35 | 650 | -0.015em | 页面主标题 |
| `--text-h2` | 20px | 1.4 | 600 | -0.01em | 区块标题 |
| `--text-h3` | 17px | 1.45 | 600 | -0.005em | 卡片标题 |
| `--text-body` | 15px | 1.55 | 400 | 0 | 正文 |
| `--text-body-sm` | 14px | 1.5 | 400 | 0 | 辅助正文 |
| `--text-caption` | 13px | 1.45 | 400 | 0.005em | 说明文字 |
| `--text-overline` | 11px | 1.5 | 600 | 0.08em | 标签/大写标题 |

#### Font Weight — 字重

| Token | Value | 用途 |
|-------|-------|------|
| `--weight-regular` | 400 | 正文 |
| `--weight-medium` | 500 | 强调/按钮 |
| `--weight-semibold` | 600 | 小标题 |
| `--weight-bold` | 700 | 大标题 |

---

### 1.3 Spacing System — 间距系统

> **基准单位: 4px**，所有间距为 4 的整数倍。

| Token | Value | 用途 |
|-------|-------|------|
| `--space-0` | 0 | 无间距 |
| `--space-1` | 4px | 紧凑内边距 |
| `--space-2` | 8px | 小内边距/行内间距 |
| `--space-3` | 12px | 组件内间距 |
| `--space-4` | 16px | 标准内边距 |
| `--space-5` | 20px | 区块间距 |
| `--space-6` | 24px | 大内边距/页面边距 |
| `--space-8` | 32px | 区块外边距 |
| `--space-10` | 40px | 大区块间距 |
| `--space-12` | 48px | 页面段落间距 |
| `--space-16` | 64px | 特大间距 |

#### Layout Spacing — 布局间距

| 场景 | Token | Value |
|------|-------|-------|
| 侧边栏宽度 | `--sidebar-width` | 260px |
| 侧边栏折叠宽度 | `--sidebar-collapsed-width` | 64px |
| 内容区最大宽度 | `--content-max-width` | 1200px |
| 内容区内边距 | `--content-padding` | 32px |
| 卡片内边距 | `--card-padding` | 20px |
| 列表行高 | `--list-row-height` | 44px |
| 组件间距 | `--component-gap` | 12px |

---

### 1.4 Border & Shape — 边框与形状

| Token | Value | 用途 |
|-------|-------|------|
| `--radius-sm` | 6px | 小按钮、标签、徽章 |
| `--radius-md` | 8px | 输入框、下拉框 |
| `--radius-lg` | 12px | 卡片、面板 |
| `--radius-xl` | 16px | 弹窗、模态框 |
| `--radius-full` | 9999px | 圆形头像、药丸按钮 |

#### Border — 边框

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--border-default` | 1px solid `var(--color-neutral-200)` | 1px solid `var(--color-neutral-700)` | 通用边框 |
| `--border-subtle` | 1px solid `var(--color-neutral-100)` | 1px solid `var(--color-neutral-800)` | 分隔线 |

---

### 1.5 Shadow & Elevation — 阴影与层级

| Token | Light | Dark | 层级 |
|-------|-------|------|------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.2)` | 0 — 默认平面 |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | `0 1px 3px rgba(0,0,0,0.3)` | 1 — 悬浮卡片 |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)` | `0 4px 6px rgba(0,0,0,0.3)` | 2 — 弹出面板 |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)` | `0 10px 15px rgba(0,0,0,0.3)` | 3 — 模态框 |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.04)` | `0 20px 25px rgba(0,0,0,0.4)` | 4 — 全屏遮罩 |

---

### 1.6 Motion & Transition — 动效系统

| Token | Duration | Easing | 用途 |
|-------|----------|--------|------|
| `--duration-instant` | 100ms | `ease-out` | 颜色变化、焦点 |
| `--duration-fast` | 150ms | `ease-out` | 悬停、微交互 |
| `--duration-normal` | 250ms | `ease-in-out` | 面板展开、过渡 |
| `--duration-slow` | 400ms | `ease-in-out` | 页面切换、大动画 |
| `--duration-spring` | 500ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 弹性效果 |

#### Reduced Motion — 无障碍

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

### 1.7 Icon System — 图标系统

| Token | Size | 用途 |
|-------|------|------|
| `--icon-xs` | 14px | 行内小图标 |
| `--icon-sm` | 16px | 列表图标、按钮内图标 |
| `--icon-md` | 18px | 侧边栏图标 |
| `--icon-lg` | 20px | 工具栏图标 |
| `--icon-xl` | 24px | 空状态图标 |
| `--icon-2xl` | 32px | 英雄区图标 |
| `--icon-3xl` | 48px | 大空状态图标 |

> **图标库**: 继续使用 **Lucide React**，保持与现有技术栈一致。

---

### 1.8 Z-Index Scale — 层级系统

| Token | Value | 用途 |
|-------|-------|------|
| `--z-base` | 0 | 默认 |
| `--z-raised` | 10 | 浮动元素 |
| `--z-dropdown` | 100 | 下拉菜单 |
| `--z-sticky` | 200 | 吸顶元素 |
| `--z-overlay` | 300 | 遮罩层 |
| `--z-modal` | 400 | 模态框 |
| `--z-popover` | 500 | 弹出层 |
| `--z-toast` | 600 | 通知提示 |
| `--z-tooltip` | 700 | 工具提示 |

---

## 2. Component Specifications — 组件规范

### 2.1 Button — 按钮

#### 变体

| 变体 | 背景 | 文字 | 边框 | 悬停 |
|------|------|------|------|------|
| Primary | `--color-primary-500` | `#fff` | 无 | 背景加深 `--color-primary-600`，微上移 1px + shadow-sm |
| Secondary | `--color-neutral-100` | `--color-neutral-700` | 1px `--color-neutral-200` | 背景 `--color-neutral-200` |
| Ghost | transparent | `--color-neutral-600` | 无 | 背景 `--color-neutral-100` |
| Danger | `--color-error-500` | `#fff` | 无 | 背景加深 `--color-error-700` |
| Danger Ghost | transparent | `--color-error-500` | 无 | 背景 `--color-error-50` |

#### 尺寸

| 尺寸 | 高度 | 内边距 | 字号 | 图标间距 |
|------|------|--------|------|----------|
| SM | 32px | 0 12px | 13px | 4px |
| MD (默认) | 36px | 0 16px | 14px | 6px |
| LG | 44px | 0 24px | 15px | 8px |

#### 状态

- **Default**: 正常态
- **Hover**: 上移 1px + shadow-sm，背景加深
- **Active**: 下移 1px，背景再加深
- **Focus**: 2px outline `--color-primary-500`，offset 2px
- **Disabled**: opacity 0.4，cursor not-allowed
- **Loading**: 文字替换为旋转 spinner，宽度保持不变

---

### 2.2 Input — 输入框

| 属性 | 值 |
|------|-----|
| 高度 | 36px (MD) |
| 内边距 | 0 12px |
| 背景 | `--bg-surface` |
| 边框 | 1px solid `--color-neutral-200` |
| 圆角 | `--radius-md` (8px) |
| 字号 | `--text-body` (15px) |
| Placeholder | `--color-neutral-400` |

#### 状态

- **Focus**: 边框变为 `--color-primary-500`，外发光 0 0 0 3px `--color-primary-200`
- **Error**: 边框 `--color-error-500`，外发光 `--color-error-50`
- **Disabled**: 背景 `--color-neutral-50`，文字 `--color-neutral-400`

---

### 2.3 Card — 卡片

| 属性 | 值 |
|------|-----|
| 背景 | `--bg-surface` |
| 边框 | 1px solid `--color-neutral-200` |
| 圆角 | `--radius-lg` (12px) |
| 内边距 | `--card-padding` (20px) |
| 阴影 | `--shadow-xs` |
| Hover | 阴影 `--shadow-sm`，微上移 2px |

#### 变体

- **Default**: 标准卡片
- **Interactive**: 可点击，hover 时阴影+位移
- **Flat**: 无阴影无边框，仅背景区分

---

### 2.4 Navigation Sidebar — 侧边栏导航

| 属性 | 值 |
|------|-----|
| 宽度 | 260px |
| 背景 | `--bg-sidebar` (始终深色) |
| 项高度 | 40px |
| 项内边距 | 0 16px |
| 项圆角 | 8px |
| 活跃项 | 左侧 3px 宽主色条 + 半透明背景 |
| Hover | 半透明背景 `--bg-sidebar-hover` |

#### 分区

1. **品牌区** — Logo + 应用名
2. **主导航** — 6 个导航项（Home/Projects/Inbox/Search/Trash/Settings）
3. **项目快捷** — 置顶项目列表
4. **底部栏** — 主题切换 + 工作区切换

---

### 2.5 Modal — 模态框

| 属性 | 值 |
|------|-----|
| 最大宽度 | 480px (标准) / 640px (宽) |
| 背景 | `--bg-surface-overlay` |
| 圆角 | `--radius-xl` (16px) |
| 阴影 | `--shadow-xl` |
| 内边距 | 24px |
| 遮罩 | `rgba(0,0,0,0.4)` / dark: `rgba(0,0,0,0.6)` |

---

### 2.6 Tag — 标签

| 属性 | 值 |
|------|-----|
| 高度 | 24px |
| 内边距 | 0 8px |
| 圆角 | `--radius-full` (药丸形) |
| 字号 | `--text-caption` (13px) |
| 背景 | `--color-primary-50` |
| 文字 | `--color-primary-700` |

---

### 2.7 Badge — 徽章

| 变体 | 背景 | 文字 |
|------|------|------|
| Default | `--color-neutral-100` | `--color-neutral-600` |
| Primary | `--color-primary-50` | `--color-primary-700` |
| Success | `--color-success-50` | `--color-success-700` |
| Warning | `--color-warning-50` | `--color-warning-700` |
| Error | `--color-error-50` | `--color-error-700` |

---

### 2.8 Empty State — 空状态

| 属性 | 值 |
|------|-----|
| 图标大小 | `--icon-3xl` (48px) |
| 图标颜色 | `--color-neutral-300` |
| 标题字号 | `--text-h3` (17px) |
| 标题颜色 | `--color-neutral-500` |
| 描述字号 | `--text-body-sm` (14px) |
| 描述颜色 | `--color-neutral-400` |
| 间距 | 图标与标题 12px，标题与描述 8px |

---

### 2.9 Toast / Notification — 通知提示

| 属性 | 值 |
|------|-----|
| 最大宽度 | 360px |
| 圆角 | `--radius-lg` (12px) |
| 阴影 | `--shadow-lg` |
| 内边距 | 12px 16px |
| 位置 | 右下角，距边 24px |

---

### 2.10 Tooltip — 工具提示

| 属性 | 值 |
|------|-----|
| 背景 | `--color-neutral-800` |
| 文字 | `--color-neutral-0` |
| 圆角 | `--radius-sm` (6px) |
| 内边距 | 4px 8px |
| 字号 | `--text-caption` (13px) |
| 延迟 | 500ms |

---

## 3. Page Layouts — 页面布局

### 3.1 App Shell — 应用外壳

```
+-------+-------------------------------------------+
| 260px |                 1fr                        |
|       |                                            |
| SIDE  |  CONTENT                                   |
| BAR   |  +--------------------------------------+  |
|       |  |  Topbar (56px)                       |  |
| Brand |  +--------------------------------------+  |
| Nav   |  |                                      |  |
| Proj  |  |  Page Content (scrollable)            |  |
| Quick |  |  max-width: 1200px                    |  |
|       |  |  padding: 32px                        |  |
| ----- |  |                                      |  |
| Theme |  +--------------------------------------+  |
| Work  |                                            |
+-------+-------------------------------------------+
```

#### Topbar — 顶部栏

| 属性 | 值 |
|------|-----|
| 高度 | 56px |
| 背景 | `--bg-surface` |
| 底部边框 | 1px solid `--color-neutral-200` |
| 内边距 | 0 32px |
| 内容 | 面包屑/搜索栏（居中）+ 操作按钮（右侧） |

---

### 3.2 Home View — 首页

```
+-- content (max-width: 1200px) --+
|                                  |
|  Welcome Banner (hero)           |
|  +----------------------------+  |
|  | 欢迎回来, {user} 👋         |  |
|  | 你有 N 个项目, M 个待整理    |  |
|  +----------------------------+  |
|                                  |
|  Metrics (4-col grid)           |
|  +--------+ +--------+ +--------+ +--------+
|  | 📁 12  | | 📥 3   | | 🏷 28  | | 🗑 2   |
|  | 项目   | | 待整理 | | 标签   | | 已归档 |
|  +--------+ +--------+ +--------+ +--------+
|                                  |
|  Two-column split                |
|  +--------------------+ +------+|
|  | Recent Projects    | | Act. ||
|  | [Card] [Card]      | | List ||
|  | [Card] [Card]      | |      ||
|  +--------------------+ +------+|
+----------------------------------+
```

---

### 3.3 Projects View — 项目详情

```
+--- 240px ---+---------- 1fr -----------+
| Category    | File Browser             |
| Sidebar     |                          |
|             | Toolbar                  |
| 📁 Docs     | [Search][View][Sort][+]  |
| 📁 Design   |                          |
| 📁 Code     | File Table/List          |
| 📁 Assets   | +----------------------+ |
|             | | Name | Date | Size |✓| |
|             | | file1 | 2d  | 12KB |●| |
|             | | file2 | 5d  | 8KB  |●| |
|             | +----------------------+ |
+-------------+--------------------------+
```

---

### 3.4 Inbox View — 收件箱

```
+-- content --+
|              |
| Page Header  |
| "Inbox (3)"  |
|              |
| Organize Bar |
| [Project ▾] [Category ▾] [Organize →] |
|              |
| Inbox List   |
| +----------+ |
| | ☐ file1  | |
| | ☐ file2  | |
| | ☐ file3  | |
| +----------+ |
+--------------+
```

---

### 3.5 Settings View — 设置

```
+-- content (max-width: 720px) --+
|                                 |
| Page Title: Settings            |
|                                 |
| Section: Appearance             |
| +----------------------------+ |
| | Theme    [Light] [Dark]    | |
| | Accent   [●][●][●][●]    | |
| +----------------------------+ |
|                                 |
| Section: General                |
| +----------------------------+ |
| | Language    [中文 ▾]       | |
| | Auto-start  [Toggle]       | |
| +----------------------------+ |
|                                 |
| Section: Storage                |
| +----------------------------+ |
| | Root Path   /Users/...     | |
| | [Change] [Migrate]         | |
| +----------------------------+ |
+---------------------------------+
```

---

## 4. Interaction Patterns — 交互规范

### 4.1 Keyboard Shortcuts

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+K` | 全局搜索 |
| `Ctrl+N` | 新建项目 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+1-6` | 切换侧边栏导航项 |
| `Delete` | 删除选中项 |
| `Escape` | 关闭弹窗/取消操作 |

### 4.2 Drag & Drop

- 外部文件拖入 → 高亮放置区域 + 半透明预览
- 内部拖拽 → 文件夹高亮 + 数字徽章显示数量
- 拖拽过程中光标变为 grab/grabbing

### 4.3 Context Menu

- 右键文件/文件夹 → 上下文菜单
- 菜单项：打开、预览、复制路径、移至...、删除
- 危险操作用红色文字标注

### 4.4 Transitions

- 页面切换：fade-in 200ms
- 侧边栏折叠：width transition 300ms + content reflow
- 弹窗打开：scale(0.95) → scale(1) + fade-in 200ms
- 弹窗关闭：fade-out 150ms

---

## 5. Accessibility — 无障碍标准

### 5.1 颜色对比度

| 场景 | 标准 | 对比度 |
|------|------|--------|
| 正文文字 vs 背景 | WCAG AA | ≥ 4.5:1 |
| 大文字 (≥18px bold) | WCAG AA | ≥ 3:1 |
| UI 组件 & 图形 | WCAG AA | ≥ 3:1 |

### 5.2 键盘导航

- 所有交互元素可通过 Tab 键访问
- 焦点指示器清晰可见 (2px outline)
- 逻辑 Tab 顺序：从左到右、从上到下
- 模态框内 Tab 循环 (focus trap)

### 5.3 屏幕阅读器

- 语义化 HTML (nav, main, section, article)
- ARIA labels 用于图标按钮
- ARIA live regions 用于动态内容
- 状态变化使用 ARIA 通知

### 5.4 触控目标

- 最小点击区域: 44x44px (WCAG 2.5.5)
- 相邻可点击元素间距 ≥ 8px

---

## 6. Dark Mode Strategy — 暗色模式策略

### 原则

1. **不是简单反色** — 暗色模式有独立的色彩映射
2. **降低对比度** — 暗色背景上文字对比度略低于浅色，减轻视觉疲劳
3. **阴影替代** — 暗色模式下用更深的背景色替代阴影表达层级
4. **侧边栏始终深色** — 与主题无关，保持一致的导航体验
5. **尊重系统偏好** — 支持 `prefers-color-scheme` 自动切换

### 切换方式

- 侧边栏底部快速切换按钮
- 设置页面内切换
- 支持跟随系统

---

## 7. Internationalization — 国际化

### 设计考量

- UI 文本预留 30% 空间（中文→英文约膨胀 30%）
- 按钮和标签避免固定宽度
- 日期格式本地化 (zh: 2026年5月14日 / en: May 14, 2026)
- 数字格式本地化

---

*Design System v2.0 — FileArk UI Designer*
*Last Updated: 2026-05-14*
