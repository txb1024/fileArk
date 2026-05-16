import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getPageBreakReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import {
  BlockNoteSchema,
  filterSuggestionItems,
  withPageBreak,
  type PartialBlock,
} from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { api } from "../../api";
import { NoteOutline } from "./NoteOutline";
import { activeNoteEditorStore } from "./activeNoteEditorStore";

interface NoteEditorProps {
  /** 当前便签 id (后缀 .bnote 或 .md;.md 表示老格式,内容是 markdown 文本) */
  noteId: string;
  /** 该便签的正文(.bnote → JSON 字符串;.md → markdown 文本) */
  content: string;
  /** 回写盘(debounce 后调用),明确带 noteId 防止快速切换便签时把 A 的内容写到 B */
  onContentChange: (noteId: string, content: string) => void;
  /** 立即上报每次编辑(不 debounce),父组件用 ref 暂存,切换便签前 flush */
  onPendingChange?: (noteId: string, content: string) => void;
  language: "zh" | "en";
  /** 是否显示大纲面板(暂时占位,BlockNote 没有原生 outline,后期可加自定义) */
  showOutline?: boolean;
}

const AUTOSAVE_DELAY = 600;

const EMPTY_DOC: PartialBlock[] = [{ type: "paragraph", content: [] }];

/** BlockNote 0.50 默认 schema + PageBreak 扩展 */
const SCHEMA = withPageBreak(BlockNoteSchema.create());

/** BlockNote 默认 schema + PageBreak 支持的块类型 */
const KNOWN_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "codeBlock",
  "quote",
  "toggleListItem",
  "table",
  "image",
  "video",
  "audio",
  "file",
  "divider",
  "pageBreak",
]);

const INLINE_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "codeBlock",
  "quote",
  "toggleListItem",
]);

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

/** 规范化行内内容,避免非法结构触发 ProseMirror renderSpec 错误 */
function sanitizeInlineContent(raw: unknown): PartialBlock["content"] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw)) return [];

  const out: Array<Record<string, unknown> | string> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (item.length > 0) out.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") {
      // ProseMirror 不允许空 text node,过滤掉 text="" 的项,否则触发 invariant
      if (obj.text.length === 0) continue;
      out.push({
        type: "text",
        text: obj.text,
        styles:
          obj.styles && typeof obj.styles === "object"
            ? (obj.styles as Record<string, boolean>)
            : {},
      });
      continue;
    }
    if (obj.type === "link" && typeof obj.href === "string") {
      const nested = sanitizeInlineContent(obj.content);
      const nestedArr = Array.isArray(nested) ? nested : [];
      if (nestedArr.length === 0 && typeof nested !== "string") continue;
      out.push({
        type: "link",
        href: obj.href,
        content:
          typeof nested === "string"
            ? nested
            : (nestedArr as Array<Record<string, unknown> | string>),
      });
    }
  }
  return out as PartialBlock["content"];
}

function sanitizeBlock(raw: unknown): PartialBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") return null;

  let type = obj.type;
  if (!KNOWN_BLOCK_TYPES.has(type)) {
    type = "paragraph";
  }

  const out: Record<string, unknown> = { type };
  if (typeof obj.id === "string") out.id = obj.id;

  if (INLINE_BLOCK_TYPES.has(type)) {
    out.content = sanitizeInlineContent(obj.content);
  } else if (type === "table" && Array.isArray(obj.content)) {
    out.content = obj.content;
  }

  if (Array.isArray(obj.children)) {
    const kids = obj.children
      .map((c) => sanitizeBlock(c))
      .filter((c): c is PartialBlock => c !== null);
    if (kids.length > 0) out.children = kids;
  }

  if (obj.props && typeof obj.props === "object") {
    const srcProps = obj.props as Record<string, unknown>;
    const safeProps: Record<string, unknown> = {};
    if (typeof srcProps.level === "number") {
      const lv = srcProps.level;
      safeProps.level = lv >= 1 && lv <= 6 ? lv : 1;
    }
    if (typeof srcProps.checked === "boolean") safeProps.checked = srcProps.checked;
    if (typeof srcProps.language === "string") safeProps.language = srcProps.language;
    if (typeof srcProps.textAlignment === "string") {
      safeProps.textAlignment = srcProps.textAlignment;
    }
    if (typeof srcProps.url === "string") safeProps.url = srcProps.url;
    if (typeof srcProps.name === "string") safeProps.name = srcProps.name;
    if (typeof srcProps.caption === "string") safeProps.caption = srcProps.caption;
    if (Object.keys(safeProps).length > 0) out.props = safeProps;
  }

  return out as PartialBlock;
}

function parseInitialBnote(content: string): PartialBlock[] {
  const trimmed = content.trim();
  if (!trimmed) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) return EMPTY_DOC;
    const cleaned = parsed
      .map((b) => sanitizeBlock(b))
      .filter((b): b is PartialBlock => b !== null);
    return cleaned.length > 0 ? cleaned : EMPTY_DOC;
  } catch (err) {
    console.warn("[NoteEditor] parseInitialBnote failed, using empty doc:", err);
    return EMPTY_DOC;
  }
}

function detectIsDark(): boolean {
  return document.querySelector(".app-shell")?.classList.contains("theme-dark") ?? false;
}

function NoteEditorBase({
  noteId,
  content,
  onContentChange,
  onPendingChange,
  language,
  showOutline,
}: NoteEditorProps) {
  const isMarkdown = noteId.endsWith(".md");
  const isLegacyMarkdownBody =
    !isMarkdown && content.trim().length > 0 && !content.trim().startsWith("[");

  const onContentChangeRef = useRef(onContentChange);
  const onPendingChangeRef = useRef(onPendingChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onPendingChangeRef.current = onPendingChange;
  });

  const [isDark, setIsDark] = useState<boolean>(detectIsDark);

  const uploadFile = useCallback(async (file: File) => {
    const ext =
      file.name.includes(".") && file.name.split(".").pop()
        ? file.name.split(".").pop()!
        : "bin";
    const data = await readFileAsBase64(file);
    const absPath = await api.saveNoteAsset(data, ext);
    return convertFileSrc(absPath);
  }, []);

  const placeholders = useMemo(
    () =>
      language === "zh"
        ? {
            default: "输入 / 选择块",
            emptyDocument: "输入 / 选择块,或直接开始写...",
            heading: "标题",
            bulletListItem: "列表项",
            numberedListItem: "列表项",
            checkListItem: "待办",
            quote: "引用",
            codeBlock: "代码",
          }
        : {
            default: "Type '/' for commands",
            emptyDocument: "Type '/' for commands, or start writing...",
            heading: "Heading",
            bulletListItem: "List item",
            numberedListItem: "List item",
            checkListItem: "To-do",
            quote: "Quote",
            codeBlock: "Code",
          },
    [language],
  );

  // 显式传入 initialContent: EMPTY_DOC，避免 BlockNote 内部默认空文档
  // 在某些版本下触发 ProseMirror toDOM 异常("Invalid array passed to renderSpec")。
  // deps=[] 让 editor 在 NoteEditor 实例的整个生命周期内复用一次。父组件 key={noteId}
  // 保证切换便签时整组件重建。
  const editor = useCreateBlockNote(
    {
      uploadFile,
      initialContent: EMPTY_DOC,
      schema: SCHEMA,
      placeholders,
      // Slash 菜单始终用英文(zh 翻译质量一般,英文更紧凑)
      dictionary: en,
    },
    [],
  );

  // 首次挂载后异步注入内容:.bnote 直接 replaceBlocks;.md / legacy markdown 走解析。
  // 即使内容格式异常,错误也只发生在 replaceBlocks(已挂载完成的 editor 上),
  // 不会让 BlockNoteView mount 失败 — 整体编辑器仍可用,最多看不到旧内容。
  const injectedRef = useRef(false);
  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    let aborted = false;
    (async () => {
      if (isMarkdown || isLegacyMarkdownBody) {
        try {
          const blocks = await editor.tryParseMarkdownToBlocks(content);
          if (aborted) return;
          if (blocks.length > 0) {
            editor.replaceBlocks(editor.document, blocks);
          }
          if (isMarkdown) {
            try {
              await api.migrateMdToBnote(noteId, JSON.stringify(editor.document));
            } catch (err) {
              console.warn("[NoteEditor] migrateMdToBnote failed:", err);
            }
          }
        } catch (err) {
          if (aborted) return;
          console.warn("[NoteEditor] tryParseMarkdownToBlocks failed:", err);
        }
        return;
      }

      const blocks = parseInitialBnote(content);
      if (blocks.length === 0 || blocks === EMPTY_DOC) return;
      try {
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.warn("[NoteEditor] replaceBlocks failed,保留空文档:", err);
      }
    })();

    return () => {
      aborted = true;
    };
    // 只在挂载时执行一次。eslint 关掉:editor / isMarkdown / content 等在父组件
    // key={noteId} 重建语义下都是同实例稳定的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    const obs = new MutationObserver(() => setIsDark(detectIsDark()));
    obs.observe(shell, { attributes: true, attributeFilter: ["class"] });
    setIsDark(detectIsDark());
    return () => obs.disconnect();
  }, []);

  // 把当前 editor 暴露给 NotesView 顶栏(导出按钮、未来其它跨组件操作)使用。
  // 见 activeNoteEditorStore.ts。
  useEffect(() => {
    activeNoteEditorStore.set(editor);
    return () => {
      if (activeNoteEditorStore.get() === editor) activeNoteEditorStore.set(null);
    };
  }, [editor]);

  // 给代码块注入「复制」按钮:监听编辑器 DOM 变化,扫描未处理的 codeBlock 容器,
  // append 一个 contentEditable=false 的浮动按钮。BlockNote 不自带复制按钮。
  const rootElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootElRef.current;
    if (!root) return;
    const copyLabel = language === "zh" ? "复制" : "Copy";
    const copiedLabel = language === "zh" ? "已复制" : "Copied";
    const failedLabel = language === "zh" ? "失败" : "Failed";

    const enhance = () => {
      const containers = root.querySelectorAll<HTMLElement>(
        '.bn-block-content[data-content-type="codeBlock"]:not([data-copy-injected])',
      );
      containers.forEach((container) => {
        container.setAttribute("data-copy-injected", "1");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "notes-codeblock-copy";
        btn.contentEditable = "false";
        btn.textContent = copyLabel;
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const code = container.querySelector("code");
          const text = code ? code.textContent ?? "" : "";
          navigator.clipboard
            .writeText(text)
            .then(() => {
              btn.textContent = copiedLabel;
              btn.classList.add("copied");
              window.setTimeout(() => {
                btn.textContent = copyLabel;
                btn.classList.remove("copied");
              }, 1400);
            })
            .catch(() => {
              btn.textContent = failedLabel;
              window.setTimeout(() => (btn.textContent = copyLabel), 1400);
            });
        });
        container.appendChild(btn);
      });
    };

    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        enhance();
      });
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(root, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [language]);

  const debounceRef = useRef<number | undefined>(undefined);
  const lastSerializedRef = useRef<string>("");
  const handleChange = useCallback(() => {
    const json = JSON.stringify(editor.document);
    if (json === lastSerializedRef.current) return;
    lastSerializedRef.current = json;
    onPendingChangeRef.current?.(noteId, json);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = undefined;
      onContentChangeRef.current(noteId, json);
    }, AUTOSAVE_DELAY);
  }, [editor, noteId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
        try {
          const json = JSON.stringify(editor.document);
          if (json !== lastSerializedRef.current) {
            onContentChangeRef.current(noteId, json);
          } else {
            onContentChangeRef.current(noteId, lastSerializedRef.current);
          }
        } catch {
          // ignore
        }
      }
    };
  }, [editor, noteId]);

  /** 合并默认 + PageBreak slash menu 项;按用户输入过滤 */
  const getSlashMenuItems = useCallback(
    (query: string): DefaultReactSuggestionItem[] => {
      const items = [
        ...getDefaultReactSlashMenuItems(editor),
        ...getPageBreakReactSlashMenuItems(editor),
      ];
      return filterSuggestionItems(items, query);
    },
    [editor],
  );

  return (
    <div
      ref={rootElRef}
      className={"note-blocknote-root" + (showOutline ? " has-outline" : "")}
    >
      <BlockNoteView
        editor={editor}
        theme={isDark ? "dark" : "light"}
        onChange={handleChange}
        slashMenu={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => getSlashMenuItems(query)}
        />
      </BlockNoteView>
      {showOutline ? <NoteOutline editor={editor} language={language} /> : null}
    </div>
  );
}

/**
 * Markdown 块编辑器(基于 BlockNote @blocknote/mantine, Notion 风格)。
 *
 * 切换便签策略:父组件用 `key={noteId}` 强制重建。BlockNote 实例创建成本远低于 Vditor,
 * 重建时间在 100~200ms,可接受。
 *
 * 老 .md 便签迁移:打开时挂载 effect 调 BlockNote 的 markdown parser,
 * 解析成功后通过 api.migrateMdToBnote 让后端把 .md → .bnote + index 更新。
 */
export const NoteEditor = memo(
  NoteEditorBase,
  (prev, next) =>
    prev.noteId === next.noteId &&
    prev.language === next.language &&
    prev.showOutline === next.showOutline
);

/** 兼容老 import:NotesView 仍在用 dropEditorCache / renameEditorCache,
 *  BlockNote 走父组件 key={noteId} 重建,这两个 no-op 即可。 */
export function dropEditorCache(_noteId: string): void {
  /* noop */
}

export function renameEditorCache(_oldId: string, _newId: string): void {
  /* noop */
}