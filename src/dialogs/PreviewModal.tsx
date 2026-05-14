import { Download, FileX2, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getFileIcon } from "../utils";
import { Modal } from "../components";

// ── 类型 ──────────────────────────────────────────────────

interface PreviewModalProps {
  file: {
    path: string;
    name: string;
    content?: string;
    loading: boolean;
    error?: string;
    info?: { ext: string; size: number; is_image: boolean; previewType: string };
  };
  onClose: () => void;
  onOpenExternal: () => void;
  themeMode?: string;
}

// ── 工具函数 ──────────────────────────────────────────────

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 根据文件扩展名推断 highlight.js 语言 */
function extToLang(ext: string): string | undefined {
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", rb: "ruby", rs: "rust", go: "go", kt: "kotlin",
    java: "java", cs: "csharp", cpp: "cpp", c: "c", h: "c",
    html: "xml", xml: "xml", css: "css", scss: "scss", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", toml: "ini",
    sql: "sql", sh: "bash", bat: "bat", ps1: "powershell",
    md: "markdown", markdown: "markdown",
    dockerfile: "dockerfile", makefile: "makefile",
  };
  return map[ext];
}

// ── 子组件：PDF ───────────────────────────────────────────

function PdfPreview({ path }: { path: string }) {
  const src = convertFileSrc(path);
  return (
    <div className="preview-pdf-container">
      <iframe src={src} className="preview-pdf-iframe" title="PDF Preview" />
    </div>
  );
}

// ── 子组件：Excel ─────────────────────────────────────────

function ExcelPreview({ base64, ext }: { base64: string; ext: string }) {
  const [sheets, setSheets] = useState<{ name: string; data: string[][] }[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("xlsx").then((XLSX) => {
      if (cancelled) return;
      try {
        const bytes = base64ToUint8Array(base64);
        let workbook: ReturnType<typeof XLSX.read>;
        if (ext === "csv") {
          const text = new TextDecoder().decode(bytes);
          workbook = XLSX.read(text, { type: "string" });
        } else {
          workbook = XLSX.read(bytes, { type: "array" });
        }
        const parsed = workbook.SheetNames.map((name: string) => {
          const sheet = workbook.Sheets[name];
          const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          return { name, data: json as string[][] };
        });
        setSheets(parsed);
      } catch (e) {
        setError(String(e));
      }
    }).catch((e) => setError(String(e)));
    return () => { cancelled = true; };
  }, [base64, ext]);

  if (error) {
    return <div className="preview-error"><p>Excel 解析失败</p><small>{error}</small></div>;
  }
  if (sheets.length === 0) {
    return <div className="preview-loading">解析中...</div>;
  }

  const current = sheets[activeSheet];
  const maxCols = Math.max(...current.data.map((row) => row.length), 1);

  return (
    <div className="preview-excel-container">
      {sheets.length > 1 && (
        <div className="excel-sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              className={`excel-sheet-tab ${i === activeSheet ? "active" : ""}`}
              onClick={() => setActiveSheet(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="excel-table-wrapper">
        <table className="excel-table">
          <tbody>
            {current.data.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "excel-header-row" : ""}>
                {Array.from({ length: maxCols }, (_, ci) => (
                  <td key={ci} className={ri === 0 ? "excel-header-cell" : ""}>
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="excel-info">
        {current.data.length} 行 · {maxCols} 列 · {sheets.length} 个工作表
      </div>
    </div>
  );
}

// ── 子组件：Word ──────────────────────────────────────────

function WordPreview({ base64 }: { base64: string }) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mammoth").then((mammoth) => {
      if (cancelled) return;
      try {
        const bytes = base64ToUint8Array(base64);
        mammoth.convertToHtml({ arrayBuffer: bytes.buffer as ArrayBuffer }).then(
          (result: { value: string; messages: unknown[] }) => {
            if (!cancelled) setHtml(result.value);
          },
          (err: unknown) => { if (!cancelled) setError(String(err)); }
        );
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }).catch((e) => setError(String(e)));
    return () => { cancelled = true; };
  }, [base64]);

  if (error) {
    return <div className="preview-error"><p>Word 解析失败</p><small>{error}</small></div>;
  }
  if (!html) {
    return <div className="preview-loading">解析中...</div>;
  }
  return (
    <div className="preview-word-container">
      <div className="word-page" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ── 子组件：图片（带缩放） ──────────────────────────────────

function ImagePreview({ path, name }: { path: string; name: string }) {
  const src = convertFileSrc(path);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.25)), []);
  const resetZoom = useCallback(() => setScale(1), []);

  // Ctrl+滚轮缩放
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) => {
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          return Math.max(0.25, Math.min(5, s + delta));
        });
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  return (
    <div className="preview-image-container" ref={containerRef}>
      <div className="image-zoom-controls">
        <button className="compact-button secondary" onClick={zoomOut} title="缩小"><ZoomOut size={14} /></button>
        <span className="zoom-label">{Math.round(scale * 100)}%</span>
        <button className="compact-button secondary" onClick={zoomIn} title="放大"><ZoomIn size={14} /></button>
        <button className="compact-button secondary" onClick={resetZoom} title="重置"><RotateCw size={14} /></button>
      </div>
      <img
        src={src}
        alt={name}
        className="preview-image"
        style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
      />
    </div>
  );
}

// ── 子组件：视频 ─────────────────────────────────────────

function VideoPreview({ path }: { path: string }) {
  const src = convertFileSrc(path);
  return (
    <div className="preview-video-container">
      <video src={src} controls className="preview-video" />
    </div>
  );
}

// ── 子组件：音频 ─────────────────────────────────────────

function AudioPreview({ path }: { path: string }) {
  const src = convertFileSrc(path);
  return (
    <div className="preview-audio-container">
      <div className="audio-icon">🎵</div>
      <audio src={src} controls className="preview-audio" />
    </div>
  );
}

// ── 子组件：Markdown ──────────────────────────────────────

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="preview-markdown-container">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ── 子组件：代码（语法高亮） ──────────────────────────────

function CodePreview({ content, ext }: { content: string; ext: string }) {
  const [highlighted, setHighlighted] = useState<string>("");

  useEffect(() => {
    const lang = extToLang(ext);
    try {
      let result: string;
      if (lang && hljs.getLanguage(lang)) {
        result = hljs.highlight(content, { language: lang }).value;
      } else {
        result = hljs.highlightAuto(content).value;
      }
      setHighlighted(result);
    } catch {
      setHighlighted("");
    }
  }, [content, ext]);

  return (
    <pre className="preview-text code-highlight">
      <code dangerouslySetInnerHTML={{ __html: highlighted || content }} />
    </pre>
  );
}

// ── 子组件：不可预览 ─────────────────────────────────────

function UnsupportedPreview({ ext, onOpenExternal }: { ext: string; onOpenExternal: () => void }) {
  return (
    <div className="preview-unsupported">
      <FileX2 size={48} strokeWidth={1.2} />
      <p>无法预览此文件类型</p>
      <small>.{ext} 格式文件暂不支持在线预览</small>
      <button className="primary compact-button" onClick={onOpenExternal} style={{ marginTop: 12 }}>
        <Download size={14} />
        用系统程序打开
      </button>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

export function PreviewModal({ file, onClose, onOpenExternal, themeMode }: PreviewModalProps) {
  const previewType = file.info?.previewType ?? "text";
  const ext = file.info?.ext ?? "";

  // 根据类型决定 Modal 尺寸
  const modalStyle = useMemo(() => {
    if (["pdf", "excel", "word"].includes(previewType)) {
      return { maxWidth: "95vw", width: 1200 };
    }
    if (["video", "image"].includes(previewType)) {
      return { maxWidth: "90vw", width: 960 };
    }
    return { maxWidth: "90vw", width: 800 };
  }, [previewType]);

  // highlight.js 主题
  useEffect(() => {
    const linkId = "hljs-theme";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    const href = themeMode === "dark"
      ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css"
      : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css";
    if (link) {
      link.href = href;
    } else {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, [themeMode]);

  // Modal header extra: 外部打开按钮
  const headerExtra = (
    <button className="secondary compact-button" onClick={onOpenExternal} title="用系统程序打开">
      <Download size={14} />
      外部打开
    </button>
  );

  return (
    <Modal title={file.name} onClose={onClose} style={modalStyle} headerExtra={headerExtra}>
      <div className="preview-content">
        {file.loading && <div className="preview-loading">加载中...</div>}
        {file.error && (
          <div className="preview-error">
            <p>预览失败</p>
            <small>{file.error}</small>
          </div>
        )}
        {!file.loading && !file.error && (() => {
          switch (previewType) {
            case "pdf":
              return <PdfPreview path={file.path} />;
            case "excel":
              return file.content ? <ExcelPreview base64={file.content} ext={ext} /> : null;
            case "word":
              return file.content ? <WordPreview base64={file.content} /> : null;
            case "image":
              return <ImagePreview path={file.path} name={file.name} />;
            case "video":
              return <VideoPreview path={file.path} />;
            case "audio":
              return <AudioPreview path={file.path} />;
            case "markdown":
              return file.content ? <MarkdownPreview content={file.content} /> : null;
            case "text":
              return file.content ? <CodePreview content={file.content} ext={ext} /> : null;
            case "unsupported":
              return <UnsupportedPreview ext={ext} onOpenExternal={onOpenExternal} />;
            default:
              return file.content ? <CodePreview content={file.content} ext={ext} /> : null;
          }
        })()}
      </div>
    </Modal>
  );
}
