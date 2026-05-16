import { memo, useEffect, useLayoutEffect, useRef } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../../api";

interface NoteEditorProps {
  /** 当前便签 id */
  noteId: string;
  /** 该便签的正文（首次加载时的快照） */
  content: string;
  /** 回写盘（debounce 后调用），明确带 noteId — 防止快速切换便签时把 A 的内容写到 B */
  onContentChange: (noteId: string, markdown: string) => void;
  /** 立即上报每次编辑（不 debounce），父组件用 ref 暂存，切换便签前 flush */
  onPendingChange?: (noteId: string, markdown: string) => void;
  language: "zh" | "en";
  /** 是否显示大纲面板 */
  showOutline?: boolean;
  /** 工具栏固定（控制顶部工具栏是否常驻） */
  toolbarPinned?: boolean;
}

const AUTOSAVE_DELAY = 600;
/** 缓存中最多保留的 Vditor 实例数；超过会按 LRU 顺序销毁最旧的 */
const MAX_INSTANCES = 12;
/** NoteEditor 卸载后延迟销毁缓存的时长（ms）。
 *  目的：StrictMode dev 下 mount→unmount→mount 几乎是同帧的，
 *  这点延迟内若 NoteEditor 又挂回来，就取消销毁、整组实例存活，避免无谓重建。 */
const CLEANUP_DELAY = 100;

interface EditorEntry {
  noteId: string;
  /** 实际承载 vditor 的 div；不交给 React 管理，避免 React reconcile 时把它的 DOM 子树拍掉 */
  container: HTMLDivElement;
  vditor: Vditor | null;
  /** Vditor after 回调触发后才置 true；destroy 必须在此之后才安全 */
  ready: boolean;
  /** 我们认为编辑器里现在显示的内容（input 回调与外部 setValue 都会更新它） */
  contentSnapshot: string;
  /** 若 ready 前接到了 setValue 请求，先缓存到这里，after 回调里消费 */
  pendingContent: string | null;
  /** autosave 防抖 timer */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** 守卫：我们自己触发的 setValue 不应被当作用户编辑回传给父组件 */
  isSettingValue: boolean;
}

// ── 模块级缓存：跨 NoteEditor 重挂载存活 ──────────────────────────────────
// React StrictMode dev 下 NoteEditor 第一次 mount 会被 unmount→remount 一次。
// 若把缓存放在 useRef 里，第二次 mount 会拿到新 ref（空缓存），等于第一个 Vditor 白建。
// 放模块级，再配合「卸载延迟销毁 + 重挂前取消」，就能完美兜住 StrictMode 双挂载。
const editorsCache = new Map<string, EditorEntry>();
let cleanupTimer: number | null = null;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function destroyEntry(entry: EditorEntry) {
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
  }
  if (entry.ready && entry.vditor) {
    try {
      entry.vditor.destroy();
    } catch {
      // ready 标记下 destroy 内部偶发 race，吞掉，下面 container.remove 会清干净 DOM
    }
  }
  entry.container.remove();
}

function destroyAll() {
  for (const entry of editorsCache.values()) destroyEntry(entry);
  editorsCache.clear();
}

function touchLRU(noteId: string) {
  const e = editorsCache.get(noteId);
  if (!e) return;
  editorsCache.delete(noteId);
  editorsCache.set(noteId, e);
}

function evictIfNeeded(activeNoteId: string) {
  while (editorsCache.size > MAX_INSTANCES) {
    // Map 按插入顺序迭代；touchLRU 已经把当前活动的挪到了末尾，所以从头取就是「最久没用」
    let oldest: string | null = null;
    for (const key of editorsCache.keys()) {
      if (key !== activeNoteId) {
        oldest = key;
        break;
      }
    }
    if (!oldest) break;
    const e = editorsCache.get(oldest)!;
    editorsCache.delete(oldest);
    destroyEntry(e);
  }
}

function applyThemeTo(vditor: Vditor) {
  const isDark = !!document.querySelector(".app-shell")?.classList.contains("theme-dark");
  if (isDark) vditor.setTheme("dark", "dark", "dracula");
  else vditor.setTheme("classic", "classic", "github");
}

function buildContainerClass(showOutline: boolean, toolbarPinned: boolean): string {
  const cls = ["note-vditor", "toolbar-visible"];
  if (toolbarPinned) cls.push("toolbar-pinned");
  if (!showOutline) cls.push("no-outline");
  return cls.join(" ");
}

/** 外部 API：当便签被删除 / 改名时，把对应缓存条目销毁，避免占用配额与陈旧实例 */
export function dropEditorCache(noteId: string) {
  const entry = editorsCache.get(noteId);
  if (!entry) return;
  editorsCache.delete(noteId);
  destroyEntry(entry);
}

/**
 * Markdown 编辑器（基于 Vditor，按便签 id 多实例缓存）。
 *
 * 解决「点击便签整个系统卡死」的核心思路：
 * - 每个便签 id 对应一个独立的 Vditor 实例 + DOM 容器，缓存在模块级 Map（最多 12 个）。
 * - 切换便签时不再走 setValue（这是之前主线程冻 1～2 秒的元凶），而是把当前容器
 *   display:none、目标容器 display:""，纯 CSS 切换，零阻塞，光标位置也自然保留。
 * - 首次访问某便签才会真正 new Vditor，Vditor 自身的初始化是异步的（async after 回调），
 *   主线程不会被一次性吃满；同时容器加 .editor-busy 渲染 shimmer 遮罩。
 * - LRU 淘汰最久未访问的实例，封顶内存。
 * - StrictMode dev 双挂载：cleanup 延迟 100ms 销毁缓存，下一次 mount 在窗口内取消销毁，
 *   缓存与 Vditor 实例完整存活，避免开发模式 1～2 秒的整窗冻结。
 * - 父组件不要给 NoteEditor 设 key，否则会强制销毁整个组件，带走整组缓存。
 */
function NoteEditorBase({
  noteId,
  content,
  onContentChange,
  onPendingChange,
  language,
  showOutline = true,
  toolbarPinned = false,
}: NoteEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onContentChangeRef = useRef(onContentChange);
  const onPendingChangeRef = useRef(onPendingChange);

  // 始终持有最新回调引用，input 回调里读 ref 即可
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onPendingChangeRef.current = onPendingChange;
  });

  // 挂载/卸载：卸载时延迟销毁缓存；下一次 mount（StrictMode 重挂或正常切回）取消销毁
  useEffect(() => {
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    return () => {
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      cleanupTimer = window.setTimeout(() => {
        cleanupTimer = null;
        destroyAll();
      }, CLEANUP_DELAY);
    };
  }, []);

  // 切换便签的核心逻辑：
  // 1) 隐藏所有非当前实例
  // 2) 命中缓存 → 把容器塞回 root、display 切回；若外部 content 与快照不同（文件被外部改），setValue 同步
  // 3) 未命中 → 新建容器 + new Vditor；shimmer 遮罩盖住直到 after 回调
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    for (const [id, entry] of editorsCache) {
      if (id !== noteId) entry.container.style.display = "none";
    }

    const existing = editorsCache.get(noteId);
    if (existing) {
      if (existing.container.parentElement !== root) {
        root.appendChild(existing.container);
      }
      existing.container.style.display = "";

      // 外部内容变化（如文件被其他进程改写）才更新；正常切换 content 等于 snapshot 直接跳过
      if (existing.vditor && existing.contentSnapshot !== content) {
        if (existing.ready) {
          existing.isSettingValue = true;
          try {
            existing.vditor.setValue(content, true);
            existing.vditor.clearStack();
            existing.contentSnapshot = content;
          } finally {
            existing.isSettingValue = false;
          }
        } else {
          existing.pendingContent = content;
        }
      }
      touchLRU(noteId);
      return;
    }

    // 缓存未命中：新建实例
    const container = document.createElement("div");
    container.className = buildContainerClass(showOutline, toolbarPinned);
    container.classList.add("editor-busy");
    root.appendChild(container);

    const newEntry: EditorEntry = {
      noteId,
      container,
      vditor: null,
      ready: false,
      contentSnapshot: content,
      pendingContent: null,
      debounceTimer: null,
      isSettingValue: false,
    };
    editorsCache.set(noteId, newEntry);

    // 注意：upload.handler 与 input/after 都会闭包引用 vditor 变量，
    // 必须用 let 先声明，下面 new Vditor 后再赋值；构造期 vditor 还是 undefined，
    // 但回调真正触发时已经初始化完了，所以安全。
    let vditor!: Vditor;
    vditor = new Vditor(container, {
      // 关键：本地 /vditor 路径，避免去 unpkg 加载 lute.min.js / i18n / icons，
      // 国内网络下走 unpkg 会让 Vditor 初始化卡住几秒。
      cdn: `${location.origin}/vditor`,
      mode: "ir",
      value: content,
      placeholder: language === "zh" ? "开始写点什么…" : "Start writing…",
      lang: language === "zh" ? "zh_CN" : "en_US",
      icon: "ant",
      height: "100%",
      minHeight: 400,
      typewriterMode: false,
      // outline 走 CSS 控制显隐（.note-vditor.no-outline .vditor-outline { display:none }），
      // 这里恒开，避免运行时 enable 切换会触发 Vditor 内部重构造。
      outline: { enable: true, position: "right" },
      toolbar: [
        "headings",
        "bold",
        "italic",
        "strike",
        "|",
        "line",
        "quote",
        "list",
        "ordered-list",
        "check",
        "|",
        "code",
        "inline-code",
        "table",
        "link",
        "upload",
        "|",
        "undo",
        "redo",
        "|",
        "outline",
        "edit-mode",
        "fullscreen",
      ],
      toolbarConfig: { pin: true },
      cache: { enable: false },
      counter: { enable: true, type: "markdown" },
      preview: {
        hljs: { style: "github", lineNumber: true },
        math: { engine: "KaTeX" },
      },
      // 完全禁用 hint:emoji，避免 vditor 在空字典上调 setStart 抛 IndexSizeError
      hint: { parse: false, delay: 200, emoji: {}, emojiPath: "", extend: [] },
      upload: {
        accept: "image/*",
        multiple: true,
        max: 20 * 1024 * 1024,
        handler: (async (files: File[]): Promise<string | null> => {
          try {
            for (const file of files) {
              const ext = file.name.includes(".")
                ? file.name.split(".").pop()!.toLowerCase()
                : file.type.split("/").pop() || "png";
              const base64 = await readFileAsBase64(file);
              const absPath = await api.saveNoteAsset(base64, ext);
              const url = convertFileSrc(absPath);
              const altText = file.name.replace(/\.[^.]+$/, "") || "image";
              vditor.insertValue(`![${altText}](${url})\n`);
            }
            return null;
          } catch (err) {
            console.error("[NoteEditor] image upload failed:", err);
            return language === "zh" ? "图片保存失败" : "Image save failed";
          }
        }) as (files: File[]) => Promise<string>,
      },
      input: (value: string) => {
        if (newEntry.isSettingValue) return;
        if (value === newEntry.contentSnapshot) return;
        newEntry.contentSnapshot = value;

        // 立即上报（带 noteId！防止快切时父组件把 A 内容当成 B 的存）
        onPendingChangeRef.current?.(newEntry.noteId, value);

        if (newEntry.debounceTimer) clearTimeout(newEntry.debounceTimer);
        newEntry.debounceTimer = setTimeout(() => {
          newEntry.debounceTimer = null;
          onContentChangeRef.current(newEntry.noteId, value);
        }, AUTOSAVE_DELAY);
      },
      after: () => {
        newEntry.ready = true;
        if (newEntry.pendingContent !== null) {
          newEntry.isSettingValue = true;
          try {
            vditor.setValue(newEntry.pendingContent, true);
            vditor.clearStack();
            newEntry.contentSnapshot = newEntry.pendingContent;
          } finally {
            newEntry.isSettingValue = false;
            newEntry.pendingContent = null;
          }
        }
        container.classList.remove("editor-busy");
        applyThemeTo(vditor);
      },
    });
    newEntry.vditor = vditor;
    evictIfNeeded(noteId);
  }, [noteId, content, language, showOutline, toolbarPinned]);

  // showOutline / toolbarPinned 切换：同步到所有缓存容器的 class
  // （非当前实例也要更新，避免之后切回去时样式错位）
  useEffect(() => {
    for (const entry of editorsCache.values()) {
      entry.container.classList.toggle("no-outline", !showOutline);
      entry.container.classList.toggle("toolbar-pinned", toolbarPinned);
    }
  }, [showOutline, toolbarPinned]);

  // 主题切换：观察 .app-shell class 变化，挨个给已就绪的实例调 setTheme
  useEffect(() => {
    const applyAll = () => {
      for (const entry of editorsCache.values()) {
        if (entry.ready && entry.vditor) applyThemeTo(entry.vditor);
      }
    };
    const appShell = document.querySelector(".app-shell");
    if (!appShell) return;
    const observer = new MutationObserver(applyAll);
    observer.observe(appShell, { attributes: true, attributeFilter: ["class"] });
    applyAll();
    const timer = setTimeout(applyAll, 300);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return <div ref={rootRef} className="note-vditor-root" />;
}

/**
 * 用 React.memo 包装：父组件因 saveNote 返回的 NoteMeta、tag 编辑等触发的 re-render
 * 不会传到这里，仅当真正影响编辑器渲染的 prop 变化才重渲染。
 */
export const NoteEditor = memo(
  NoteEditorBase,
  (prev, next) =>
    prev.noteId === next.noteId &&
    prev.content === next.content &&
    prev.language === next.language &&
    prev.showOutline === next.showOutline &&
    prev.toolbarPinned === next.toolbarPinned,
);
