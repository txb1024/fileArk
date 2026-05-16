import { useEffect, useState } from "react";
import type { BlockNoteEditor } from "@blocknote/core";

interface OutlineItem {
  id: string;
  level: number;
  text: string;
}

interface NoteOutlineProps {
  editor: BlockNoteEditor<any, any, any> | null;
  language: "zh" | "en";
}

/** 把 inline content 数组拼成纯文本(忽略样式) */
function flattenInline(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (obj.type === "text" && typeof obj.text === "string") {
        parts.push(obj.text);
      } else if (obj.type === "link" && Array.isArray(obj.content)) {
        parts.push(flattenInline(obj.content));
      }
    }
  }
  return parts.join("");
}

function extractOutline(editor: BlockNoteEditor<any, any, any>): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const block of editor.document) {
    if ((block.type as string) !== "heading") continue;
    const level = Number((block.props as Record<string, unknown>)?.level ?? 1);
    const text = flattenInline(block.content).trim();
    if (!text) continue;
    out.push({ id: block.id, level: Math.min(Math.max(level, 1), 6), text });
  }
  return out;
}

export function NoteOutline({ editor, language }: NoteOutlineProps) {
  const [items, setItems] = useState<OutlineItem[]>([]);

  useEffect(() => {
    if (!editor) {
      setItems([]);
      return;
    }
    setItems(extractOutline(editor));
    const unsubscribe = editor.onChange(() => {
      setItems(extractOutline(editor));
    });
    return () => {
      // BlockNote 0.50 onChange 返回 Unsubscribe 函数,部分版本可能是 void
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [editor]);

  const jumpTo = (id: string) => {
    if (!editor) return;
    try {
      editor.setTextCursorPosition(id, "start");
      // 滚到视图中央
      requestAnimationFrame(() => {
        const root = editor.prosemirrorView?.dom?.closest(".bn-container");
        const target = root?.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (target && "scrollIntoView" in target) {
          (target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
        }
        editor.focus();
      });
    } catch (err) {
      console.warn("[NoteOutline] jumpTo failed:", err);
    }
  };

  if (items.length === 0) {
    return (
      <div className="note-outline note-outline-empty">
        <div className="note-outline-title">
          {language === "zh" ? "大纲" : "Outline"}
        </div>
        <div className="note-outline-hint">
          {language === "zh"
            ? "用「标题」块开始,大纲会自动生成。"
            : "Add heading blocks to build the outline."}
        </div>
      </div>
    );
  }

  return (
    <div className="note-outline">
      <div className="note-outline-title">
        {language === "zh" ? "大纲" : "Outline"}
      </div>
      <ul className="note-outline-list">
        {items.map((it) => (
          <li
            key={it.id}
            className={`note-outline-item note-outline-level-${it.level}`}
            style={{ paddingLeft: 12 + (it.level - 1) * 12 }}
            onClick={() => jumpTo(it.id)}
            title={it.text}
          >
            <span className="note-outline-text">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
