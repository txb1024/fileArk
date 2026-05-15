# FileArk Notion 风格改造优化方案

> 基于对 Notion 设计系统的深入分析，结合 FileArk 作为「项目资料管理器」的产品定位，提出 8 大优化方向。

---

## P1 色彩体系重构 ⭐⭐⭐ 高影响 · 低难度

### 现状问题
- 背景 `#eef2f6` 偏冷蓝灰，缺少 Notion 的「纸质温暖感」
- 侧边栏 `#14213d` 深海军蓝，与主区域割裂感强
- Accent 颜色饱和度偏高（teal `#2ec4b6`），视觉冲击大于引导

### Notion 方案
| Token | 亮色 | 暗色 |
|-------|------|------|
| bg-primary | `#ffffff` | `#191919` |
| bg-secondary | `#f7f6f3` | `#2f3437` |
| bg-tertiary | `#f1f1ef` | `#373c41` |
| text-primary | `#37352f` | `#ffffff` |
| text-secondary | `#6f6e69` | `#9b9998` |
| text-tertiary | `#9b9a97` | `#6f6e69` |
| border | `#e9e9e7` | `#373c41` |

### 改造建议
```css
.app-shell {
  --bg: #f7f6f3;           /* 暖灰背景，替代冷蓝灰 */
  --surface: #ffffff;       /* 纯白卡片 */
  --surface-soft: #f1f1ef;  /* 浅暖灰 */
  --text: #37352f;          /* 暖黑，替代冷黑 */
  --muted: #6f6e69;         /* 暖灰辅助文字 */
  --border: #e9e9e7;        /* 暖灰边框 */
  --sidebar: #ffffff;        /* 白色侧边栏！ */
  --sidebar-hover: #f7f6f3; /* 暖灰悬停 */
  --accent: #2383e2;        /* Notion 蓝，更沉稳 */
  --accent-strong: #1a6bb8;
  --accent-soft: #e7f3ff;
}
```

**核心变化**: 侧边栏从深色改为白色/浅灰，这是 Notion 最显著的视觉特征。

---

## P2 边框与阴影弱化 ⭐⭐⭐ 高影响 · 低难度

### 现状问题
- 边框颜色 `#d9e2ec` 较深，视觉噪声大
- 卡片 `box-shadow` 明显，显得「厚重」
- 分隔线与边框过多，界面不够「透气」

### Notion 方案
- 边框 `0.5px solid #e9e9e7`（仅 0.5px！）
- 阴影极浅：`0 1px 3px rgba(15,15,15,0.05)`
- 大量使用背景色差异代替边框分隔
- Hover 时才显示边框或提升阴影

### 改造建议
```css
/* 所有卡片/面板 */
.panel, .metric, .project-card {
  border: 0.5px solid var(--border);  /* 从 1px 降到 0.5px */
  box-shadow: 0 1px 3px rgba(15,15,15,0.05);  /* 极浅 */
}

/* Hover 时微弱提升 */
.project-card:hover {
  box-shadow: 0 2px 4px rgba(15,15,15,0.08);
}

/* 设置页面分割用背景色差异，而非边框 */
.settings-section {
  border: none;
  background: var(--surface);
  border-radius: 8px;
}
```

---

## P3 侧边栏重构 ⭐⭐⭐ 高影响 · 中高难度

### 现状问题
- 深色侧边栏（`#14213d`）与 Notion 白色侧边栏风格截然不同
- 导航项只有图标+文字，缺少 Notion 的 Emoji 个性化
- 项目快捷方式是平铺列表，缺少树形层级感
- 侧边栏不可折叠到图标模式

### Notion 方案
- 白色/浅灰侧边栏，与主内容区同色系
- 每个页面/项目可自定义 Emoji 图标
- 树形嵌套结构 + 展开/折叠 chevron
- 可折叠至仅图标模式（~48px）
- 底部 workspace 切换器

### 改造建议
1. **侧边栏底色改为白色**，与 `--surface` 一致
2. **项目项增加 Emoji 选择器**，每个项目可选一个 emoji 前缀
3. **增加折叠按钮**：侧边栏可折叠到仅图标模式
4. **导航项 hover 态**：`background: #f7f6f3`，不是深色高亮
5. **活跃态**：文字加粗 + 左侧 3px accent 竖条（保留现有设计，改用暖灰底色）
6. **底部分区**：Workspace 切换器保留，风格调为 Notion 式

```jsx
// 导航项风格示例
<div className="nav-item" style={{
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '4px 8px', borderRadius: '6px',
  fontSize: '14px', color: 'var(--text)',
  cursor: 'pointer',
}}>
  <span className="nav-emoji">📁</span>
  <span>项目名称</span>
</div>
```

---

## P4 排版体系升级 ⭐⭐ 高影响 · 中难度

### 现状问题
- 10 级 Apple 风格层级过于复杂，实际使用只用到 4-5 级
- 基准字号 15px 偏小，Notion 用 16px
- 缺少衬线体选项，Notion 默认衬线体是其标志性设计
- 行间距略紧凑

### Notion 方案
| 级别 | 字号 | 行高 |
|------|------|------|
| H1 | 30px | 36px |
| H2 | 24px | 32px |
| H3 | 20px | 28px |
| Body | 16px | 24px |
| Small | 14px | 20px |
| Caption | 12px | 16px |

### 改造建议
1. **精简为 6 级层级**（合并 Apple 10 级）
2. **基准字号 15px → 16px**
3. **增加字体族切换**：Sans / Serif / Mono（Settings 里加选项）
4. **标题减负**：font-weight 从 700/600 统一降到 600/500

```css
:root {
  font-size: 16px;  /* 从 15px 提升 */
  line-height: 1.5;
}

/* Serif 字体选项 */
.app-shell.font-serif {
  font-family: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
}
```

---

## P5 悬停揭示交互 ⭐⭐ 中影响 · 中难度

### 现状问题
- 所有操作按钮始终可见，界面视觉噪声大
- 列表行右侧的删除、复制等操作一直占据空间
- 项目卡片底部的操作按钮始终显示

### Notion 方案
- 操作按钮 hover 时才出现（`⋮⋮` 拖拽手柄、删除按钮等）
- 保持「干净画布」哲学：不操作时界面尽可能简洁
- 文件列表行的操作图标 hover 才显示

### 改造建议
```css
/* 文件行：操作按钮 hover 才显示 */
.file-row .file-actions {
  opacity: 0;
  transition: opacity 0.15s;
}
.file-row:hover .file-actions {
  opacity: 1;
}

/* 项目卡片：操作按钮 hover 才显示 */
.project-card .card-actions {
  opacity: 0;
  transition: opacity 0.15s;
}
.project-card:hover .card-actions {
  opacity: 1;
}
```

---

## P6 圆角与间距微调 ⭐ 低影响 · 低难度

### 现状问题
- 部分组件圆角偏大（12px+），与 Notion 的 3-8px 不一致
- 间距体系不够统一，部分地方偏紧

### Notion 方案
| 组件 | 圆角 |
|------|------|
| 小元素（tag, badge） | 3px |
| 输入框、按钮 | 6px |
| 卡片、面板 | 8px |

### 改造建议
```css
:root {
  --radius-sm: 3px;   /* tags, badges */
  --radius-md: 6px;   /* inputs, buttons */
  --radius-lg: 8px;   /* cards, panels */
}
```

间距统一用 4px 倍数：4, 8, 12, 16, 24, 32, 48。

---

## P7 暗色模式调色 ⭐⭐ 中影响 · 中难度

### 现状问题
- 暗色模式背景 `#101826` 偏蓝冷调
- 与 Notion 的 `#191919` 暖黑差异明显
- 侧边栏暗色更冷 `#0b1220`

### Notion 方案
- 暗色模式用暖灰色系 `#191919` / `#2f3437` / `#373c41`
- 不用纯黑 `#000`，也不用蓝调黑
- 文字用纯白 `#ffffff`，辅助文字偏暖灰

### 改造建议
```css
.app-shell.theme-dark {
  --bg: #191919;       /* 暖黑，替代蓝冷黑 */
  --surface: #202020;  /* 略浅暖黑 */
  --surface-soft: #2f3437;
  --text: #ffffff;
  --muted: #9b9998;
  --border: #373c41;
  --sidebar: #191919;
  --sidebar-hover: #2f3437;
}
```

---

## P8 页面即应用范式 ❌ 暂不适用

### Notion 独有特征
Notion 的「编辑器即应用」范式（Slash 命令、无限嵌套页面、数据库多视图）是其核心竞争力，但 **FileArk 是文件管理器，不是文档编辑器**，直接套用会：

- 破坏文件管理的核心操作效率（拖拽、批量、右键菜单）
- 增加不必要的学习成本
- 技术实现成本极高（富文本编辑器、数据库视图引擎）

### 可借鉴的局部
- **面包屑导航**：Notion 的深层面包屑设计，可用于文件路径
- **Cover Image**：项目卡片可加封面图，增加视觉识别度
- **Inline search/filter**：列表页顶部即时搜索，类似 Notion 数据库筛选

---

## 实施路线建议

### 第一阶段：视觉基调（1-2天）
1. **P1 色彩体系重构** — 改 CSS 变量即可，全局生效
2. **P2 边框阴影弱化** — 改 CSS 即可
3. **P6 圆角间距微调** — 改 CSS 即可

> 这三步只改 `styles.css`，不动组件逻辑，改动最小、效果最明显。

### 第二阶段：结构升级（3-5天）
4. **P3 侧边栏重构** — 改组件代码 + CSS，涉及 App.tsx
5. **P7 暗色模式调色** — 跟随 P1 一并调整

### 第三阶段：交互细节（2-3天）
6. **P4 排版体系升级** — 精简层级 + 加 Serif 选项
7. **P5 悬停揭示交互** — 逐组件添加 hover-reveal

### 不做
8. **P8** — 不照搬「页面即应用」范式

---

## 兼容性提醒

- 所有改动均在 CSS 变量层 + React 组件层，**不涉及 Tauri 后端**
- 主题切换机制（`theme-light` / `theme-dark`）保持不变
- Accent 颜色切换机制保持不变（teal/blue/violet/orange），但默认值可考虑从 teal 改为 blue
- i18n 机制不受影响
- SpotlightSearch 组件保持现有动画，仅调整色彩
