import { useEffect, useRef } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../../api";

interface NoteEditorProps {
  content: string;
  onContentChange: (markdown: string) => void;
  language: "zh" | "en";
  /** 是否显示大纲面板 */
  showOutline?: boolean;
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
 * Typora 级别的 Markdown 编辑器，基于 Vditor。
 *
 * 核心体验：
 * - 默认 WYSIWYG（所见即所得）模式
 * - Cmd/Ctrl + / 切换源码模式（SV）
 * - 内置大纲导航（outline）
 * - 打字机模式（光标始终居中）
 * - 中文工具栏 & 提示
 * - 深色主题联动
 */
export function NoteEditor({
  content,
  onContentChange,
  language,
  showOutline = true,
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const isSettingValue = useRef(false);
  // Vditor 异步初始化，after 回调触发前不能调用 setValue，否则内容丢失
  const isReady = useRef(false);
  const pendingContent = useRef<string | null>(null);

  // 保持回调引用最新
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  // 初始化 Vditor
  useEffect(() => {
    if (!containerRef.current) return;

    const vditor = new Vditor(containerRef.current, {
      // 基础配置
      mode: "wysiwyg",
      value: content,
      placeholder:
        language === "zh" ? "开始写点什么…" : "Start writing…",
      lang: language === "zh" ? "zh_CN" : "en_US",
      icon: "ant",
      height: "100%",
      minHeight: 400,

      // 打字机模式 — 光标始终居中
      typewriterMode: true,

      // 大纲
      outline: showOutline
        ? { enable: true, position: "right" }
        : { enable: false, position: "right" },

      // 工具栏 — 精选 Typora 风格按钮
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
        pin: true, // 工具栏固定在顶部
      },

      // 禁用 localStorage 缓存（我们用文件系统持久化）
      cache: { enable: false },

      // 计数器
      counter: {
        enable: true,
        type: "markdown",
      },

      // 预览配置
      preview: {
        theme: {
          current: "classic",
          path: "https://unpkg.com/vditor@3.11.2/dist/css/content-theme",
        },
        hljs: {
          style: "github",
          lineNumber: true,
        },
        math: {
          engine: "KaTeX",
        },
      },

      // 自定义快捷键
      hint: {
        parse: false,
        emoji: {},
      },

      // 图片本地化 — 拦截上传 / 拖入 / 粘贴，落到本地 notes/assets 并插入 webview URL
      upload: {
        accept: "image/*",
        multiple: true,
        max: 20 * 1024 * 1024, // 20MB
        // Vditor handler 类型限定为 Promise<string> 或 Promise<null>，无法用联合，故用断言
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

      // 输入回调 — 驱动自动保存
      input: (value: string) => {
        if (isSettingValue.current) return;
        if (value === lastSavedContent.current) return;
        lastSavedContent.current = value;

        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          onContentChangeRef.current(value);
        }, AUTOSAVE_DELAY);
      },

      // 编辑器渲染完成
      after: () => {
        isReady.current = true;
        // 应用挂载到 ready 期间累积的最新内容（解决初次打开空白问题）
        if (pendingContent.current !== null) {
          isSettingValue.current = true;
          vditor.setValue(pendingContent.current, true);
          lastSavedContent.current = pendingContent.current;
          pendingContent.current = null;
          vditor.clearStack();
          isSettingValue.current = false;
        }
        vditor.focus();
      },
    });

    vditorRef.current = vditor;

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      isReady.current = false;
      pendingContent.current = null;
      vditor.destroy();
      vditorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在挂载时初始化一次

  // 内容切换（用户选中不同便签时）
  useEffect(() => {
    const vditor = vditorRef.current;
    if (!vditor) return;

    // vditor 还在异步初始化，暂存内容由 after 回调消费
    if (!isReady.current) {
      pendingContent.current = content;
      return;
    }

    // 避免自己触发的 input 回调
    isSettingValue.current = true;
    lastSavedContent.current = content;
    vditor.setValue(content, true);
    isSettingValue.current = false;

    // 重置 undo 栈，避免 undo 回到上一个便签的内容
    vditor.clearStack();
  }, [content]);

  // 工具栏悬停浮现 — 鼠标接近顶部时显示，离开后淡出
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const HOVER_THRESHOLD = 70;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const inHotZone = offsetY >= 0 && offsetY < HOVER_THRESHOLD;

      if (inHotZone) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        container.classList.add("toolbar-visible");
      } else if (!container.classList.contains("toolbar-pinned")) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          container.classList.remove("toolbar-visible");
        }, 400);
      }
    };

    const handleLeave = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        container.classList.remove("toolbar-visible");
      }, 200);
    };

    container.addEventListener("mousemove", handleMove);
    container.addEventListener("mouseleave", handleLeave);
    return () => {
      container.removeEventListener("mousemove", handleMove);
      container.removeEventListener("mouseleave", handleLeave);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // 主题切换 — 跟随 app 的 theme-dark class
  useEffect(() => {
    const applyTheme = () => {
      const vditor = vditorRef.current;
      if (!vditor || !isReady.current) return;
      const isDark = document
        .querySelector(".app-shell")
        ?.classList.contains("theme-dark");
      if (isDark) {
        vditor.setTheme("dark", "dark", "dracula");
      } else {
        vditor.setTheme("classic", "classic", "github");
      }
    };

    const observer = new MutationObserver(applyTheme);

    const appShell = document.querySelector(".app-shell");
    if (appShell) {
      observer.observe(appShell, {
        attributes: true,
        attributeFilter: ["class"],
      });

      // 初次尝试，若 vditor 还未 ready 会跳过；ready 后由下面定时器再尝试
      applyTheme();

      // vditor 挂载到 ready 通常 < 200ms，轮询一次兜底
      const timer = setTimeout(applyTheme, 300);
      return () => {
        clearTimeout(timer);
        observer.disconnect();
      };
    }

    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="note-vditor" />;
}
