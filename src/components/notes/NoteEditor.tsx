import { memo, useEffect, useLayoutEffect, useRef } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../../api";

interface NoteEditorProps {
  /** 当前便签 id，用作切换内容的"信号源"——内容回填只在 noteId 变化时发生 */
  noteId: string;
  /** 当前便签的内容（已由父组件读取完成） */
  content: string;
  onContentChange: (markdown: string) => void;
  /** 立即上报每次编辑（不 debounce）— 父组件用 ref 暂存，切换便签前 flush */
  onPendingChange?: (markdown: string) => void;
  language: "zh" | "en";
  /** 是否显示大纲面板 */
  showOutline?: boolean;
  /** 工具栏固定（保留 prop 以兼容外层切换；当前实现总是常驻顶部） */
  toolbarPinned?: boolean;
}

const AUTOSAVE_DELAY = 600;

/** 读取 File 内容为 base64 字符串（不含 data: 前缀） */
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

/**
 * Markdown 编辑器（基于 Vditor）。
 *
 * 切换便签的卡顿对策：
 * - vditor 实例只创建一次（[] 依赖），切换便签走 setValue 而非重建实例
 * - 仅当 noteId 变化时才调用 setValue（避免父组件 re-render 误触发）
 * - 内容相同时跳过 setValue
 * - setValue 之前给容器加 .editor-busy class，让 CSS 渲染一个 skeleton
 *   覆盖编辑区，setValue 同步阻塞主线程时用户看到的是 loading 而非旧内容
 * - setValue 推到 rAF 之后执行，让 React commit + 浏览器 paint 先发生
 * - 移除 mousemove 工具栏 hover（永久顶部工具栏，去掉 60Hz 监听器）
 */
function NoteEditorBase({
  noteId,
  content,
  onContentChange,
  onPendingChange,
  language,
  showOutline = true,
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedContent = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const onPendingChangeRef = useRef(onPendingChange);
  const isSettingValue = useRef(false);
  const isReady = useRef(false);
  // 当前已渲染到编辑器的 noteId；用于判断 prop 切换是否真的换了便签
  const renderedNoteId = useRef<string | null>(null);
  // 异步初始化期间，最新的 (noteId, content) 暂存这里，after 回调消费
  const pendingPayload = useRef<{ noteId: string; content: string } | null>(null);
  // 切换便签时正在排队的 setValue rAF id
  const pendingApplyHandle = useRef<number | null>(null);

  // 保持回调引用最新
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onPendingChangeRef.current = onPendingChange;
  }, [onContentChange, onPendingChange]);

  // 初始化 Vditor — 只跑一次
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.classList.add("editor-busy");

    const vditor = new Vditor(container, {
      // ir = instant rendering，类似 Typora 的"输入即所见"。
      // 输入 `# 空格` 立刻成 H1、`**xx**` 立刻成粗体；与 wysiwyg 的纯富文本不同。
      mode: "ir",
      value: content,
      placeholder: language === "zh" ? "开始写点什么…" : "Start writing…",
      lang: language === "zh" ? "zh_CN" : "en_US",
      icon: "ant",
      height: "100%",
      minHeight: 400,

      typewriterMode: false,

      outline: { enable: !!showOutline, position: "right" },

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
      toolbarConfig: {
        pin: true,
      },

      cache: { enable: false },

      counter: {
        enable: true,
        type: "markdown",
      },

      // 注意：不设置 preview.theme.path（保留 vditor 默认值，避免远程 unpkg 请求阻塞）
      preview: {
        hljs: {
          style: "github",
          lineNumber: true,
        },
        math: {
          engine: "KaTeX",
        },
      },

      hint: {
        parse: false,
        emoji: {},
      },

      upload: {
        accept: "image/*",
        multiple: true,
        max: 20 * 1024 * 1024,
        handler: (async (files: File[]): Promise<string | null> => {
          try {
            for (const file of files) {
              const ext = file.name.includes(".")
                ? file.name.split(".").pop()!.toLowerCase()
                : (file.type.split("/").pop() || "png");
              const base64 = await readFileAsBase64(file);
              const absPath = await api.saveNoteAsset(base64, ext);
              const url = convertFileSrc(absPath);
              const altText = file.name.replace(/\.[^.]+$/, "") || "image";
              const md = `![${altText}](${url})\n`;
              vditorRef.current?.insertValue(md);
            }
            return null;
          } catch (err) {
            console.error("[NoteEditor] image upload failed:", err);
            return language === "zh" ? "图片保存失败" : "Image save failed";
          }
        }) as (files: File[]) => Promise<string>,
      },

      input: (value: string) => {
        if (isSettingValue.current) return;
        if (value === lastSyncedContent.current) return;
        lastSyncedContent.current = value;

        onPendingChangeRef.current?.(value);

        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          onContentChangeRef.current(value);
        }, AUTOSAVE_DELAY);
      },

      after: () => {
        isReady.current = true;
        // 应用挂载到 ready 期间，可能已经收到了一次 noteId 切换
        const payload = pendingPayload.current;
        if (payload) {
          isSettingValue.current = true;
          vditor.setValue(payload.content, true);
          lastSyncedContent.current = payload.content;
          renderedNoteId.current = payload.noteId;
          vditor.clearStack();
          isSettingValue.current = false;
          pendingPayload.current = null;
        } else {
          renderedNoteId.current = noteId;
          lastSyncedContent.current = content;
        }
        container.classList.remove("editor-busy");
        // 不主动 focus，避免 mount 时把页面滚到编辑器
      },
    });

    vditorRef.current = vditor;

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (pendingApplyHandle.current !== null) {
        cancelAnimationFrame(pendingApplyHandle.current);
        pendingApplyHandle.current = null;
      }
      isReady.current = false;
      pendingPayload.current = null;
      renderedNoteId.current = null;
      vditor.destroy();
      vditorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换便签：仅当 noteId 真变了才同步内容
  // 用 useLayoutEffect 在 React commit 后立刻给容器加 busy class（让 skeleton 跟着同一帧出现），
  // 实际 setValue 推到下一帧，让浏览器先 paint skeleton。
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const vditor = vditorRef.current;

    // vditor 还在异步初始化：把当前 (noteId, content) 暂存，after 回调里消费
    if (!vditor || !isReady.current) {
      pendingPayload.current = { noteId, content };
      return;
    }

    // 这个 noteId 已经渲染到编辑器里了，不刷新（保护用户的光标和未保存草稿）
    // 父组件保证 (noteId, content) 是配对的，所以 noteId 没变就一定是同篇便签
    if (renderedNoteId.current === noteId) return;

    // 立刻显示 skeleton，再下一帧执行 setValue
    container.classList.add("editor-busy");

    if (pendingApplyHandle.current !== null) {
      cancelAnimationFrame(pendingApplyHandle.current);
    }
    pendingApplyHandle.current = requestAnimationFrame(() => {
      pendingApplyHandle.current = null;
      isSettingValue.current = true;
      try {
        vditor.setValue(content, true);
        vditor.clearStack();
        lastSyncedContent.current = content;
        renderedNoteId.current = noteId;
      } finally {
        isSettingValue.current = false;
        // setValue 同步完成后再下一帧移除 busy（让用户看到的"loading→内容"过渡更稳）
        requestAnimationFrame(() => {
          container.classList.remove("editor-busy");
        });
      }
    });
  }, [noteId, content]);

  // 同步 outline 显示
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.classList.toggle("no-outline", !showOutline);
  }, [showOutline]);

  // 主题切换 — 跟随 .app-shell 的 theme-dark class
  useEffect(() => {
    let lastIsDark: boolean | null = null;
    const applyTheme = () => {
      const vditor = vditorRef.current;
      if (!vditor || !isReady.current) return;
      const isDark = !!document
        .querySelector(".app-shell")
        ?.classList.contains("theme-dark");
      if (isDark === lastIsDark) return;
      lastIsDark = isDark;
      if (isDark) {
        vditor.setTheme("dark", "dark", "dracula");
      } else {
        vditor.setTheme("classic", "classic", "github");
      }
    };

    const appShell = document.querySelector(".app-shell");
    if (!appShell) return;
    const observer = new MutationObserver(applyTheme);
    observer.observe(appShell, {
      attributes: true,
      attributeFilter: ["class"],
    });

    applyTheme();
    const timer = setTimeout(applyTheme, 300);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return <div ref={containerRef} className="note-vditor toolbar-pinned toolbar-visible" />;
}

/**
 * NoteEditor 用 React.memo 包装：
 * 父组件由于 saveNote 返回的 NoteMeta、tag 编辑等触发的 re-render 不会传到这里。
 * 仅当真正影响编辑器渲染的 prop 变化才重渲染。
 */
export const NoteEditor = memo(
  NoteEditorBase,
  (prev, next) =>
    prev.noteId === next.noteId &&
    prev.content === next.content &&
    prev.language === next.language &&
    prev.showOutline === next.showOutline
);
