import { Download, FileX2, ZoomIn, ZoomOut, RotateCw, Monitor, Eye } from "lucide-react";
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

function extToLang(ext: string): string | undefined {
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    kt: "kotlin",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    html: "xml",
    xml: "xml",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    sql: "sql",
    sh: "bash",
    bat: "bat",
    ps1: "powershell",
    md: "markdown",
    markdown: "markdown",
    dockerfile: "dockerfile",
    makefile: "makefile",
    swift: "swift",
    php: "php",
    lua: "lua",
    r: "r",
  };
  return map[ext];
}

function extLabel(ext: string): string {
  const map: Record<string, string> = {
    pdf: "PDF 文档",
    docx: "Word 文档",
    doc: "Word 文档",
    xlsx: "Excel 表格",
    xls: "Excel 表格",
    csv: "CSV 表格",
    pptx: "PowerPoint 演示",
    ppt: "PowerPoint 演示",
    png: "PNG 图片",
    jpg: "JPEG 图片",
    jpeg: "JPEG 图片",
    gif: "GIF 图片",
    svg: "SVG 矢量图",
    webp: "WebP 图片",
    ico: "图标文件",
    bmp: "BMP 图片",
    mp4: "MP4 视频",
    avi: "AVI 视频",
    mov: "MOV 视频",
    mkv: "MKV 视频",
    webm: "WebM 视频",
    mp3: "MP3 音频",
    wav: "WAV 音频",
    flac: "FLAC 音频",
    aac: "AAC 音频",
    ogg: "OGG 音频",
    m4a: "M4A 音频",
    md: "Markdown",
    markdown: "Markdown",
    txt: "纯文本",
    log: "日志文件",
    js: "JavaScript",
    ts: "TypeScript",
    jsx: "JSX",
    tsx: "TSX",
    html: "HTML 网页",
    htm: "HTML 网页",
    css: "CSS 样式",
    scss: "SCSS 样式",
    json: "JSON 数据",
    xml: "XML 数据",
    yaml: "YAML 配置",
    yml: "YAML 配置",
    py: "Python 代码",
    rs: "Rust 代码",
    go: "Go 代码",
    java: "Java 代码",
    zip: "ZIP 压缩包",
    rar: "RAR 压缩包",
    "7z": "7Z 压缩包",
    tar: "TAR 归档",
    gz: "GZ 压缩",
    exe: "可执行文件",
    msi: "安装程序",
    dll: "动态链接库",
  };
  return map[ext] || `${ext.toUpperCase()} 文件`;
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
    import("xlsx")
      .then((XLSX) => {
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
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64, ext]);

  if (error) {
    return (
      <div className="preview-error">
        <p>Excel 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (sheets.length === 0) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>解析中...</span>
      </div>
    );
  }

  const current = sheets[activeSheet];
  const maxCols = Math.max(...current.data.map((row) => row.length), 1);

  const colLetter = (i: number): string => {
    let n = i;
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };

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
          <thead>
            <tr>
              <th className="excel-col-header"></th>
              {Array.from({ length: maxCols }, (_, ci) => (
                <th key={ci} className="excel-col-header">
                  {colLetter(ci)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {current.data.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "excel-header-row" : ""}>
                <td className="excel-row-number">{ri + 1}</td>
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

function WordPreview({ base64, themeMode }: { base64: string; themeMode?: string }) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mammoth")
      .then((mammoth) => {
        if (cancelled) return;
        try {
          const bytes = base64ToUint8Array(base64);
          const buf = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer;
          mammoth.convertToHtml({ arrayBuffer: buf }).then(
            (result: { value: string; messages: unknown[] }) => {
              if (!cancelled) setHtml(result.value);
            },
            (err: unknown) => {
              if (!cancelled) setError(String(err));
            }
          );
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64]);

  if (error) {
    return (
      <div className="preview-error">
        <p>Word 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (!html) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>解析中...</span>
      </div>
    );
  }
  return (
    <div className="preview-word-container">
      <div
        className={`word-page ${themeMode === "dark" ? "theme-dark" : ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ── 子组件：PPTX ──────────────────────────────────────────

interface PptxSlide {
  index: number;
  text: string;
}

function PptxPreview({ base64 }: { base64: string }) {
  const [slides, setSlides] = useState<PptxSlide[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("jszip")
      .then(({ default: JSZip }) => {
        if (cancelled) return;
        try {
          const bytes = base64ToUint8Array(base64);
          JSZip.loadAsync(bytes)
            .then(async (zip) => {
              if (cancelled) return;

              // 收集 slide*.xml 文件并按编号排序
              const slideFiles: { idx: number; path: string }[] = [];
              const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/;
              for (const path of Object.keys(zip.files)) {
                const m = path.match(slideRegex);
                if (m) {
                  slideFiles.push({ idx: parseInt(m[1], 10), path });
                }
              }
              slideFiles.sort((a, b) => a.idx - b.idx);

              const parsed: PptxSlide[] = [];
              for (const sf of slideFiles) {
                const xmlText = await zip.files[sf.path].async("string");
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlText, "text/xml");
                const textElements = doc.getElementsByTagName("a:t");
                const texts: string[] = [];
                for (let i = 0; i < textElements.length; i++) {
                  texts.push(textElements[i].textContent || "");
                }
                const text = texts.join(" ");
                parsed.push({ index: sf.idx, text });
              }

              if (!cancelled) {
                if (parsed.length === 0) {
                  setError("此 PPTX 文件中未找到幻灯片文本");
                } else {
                  setSlides(parsed);
                }
              }
            })
            .catch((e) => {
              if (!cancelled) setError(String(e));
            });
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [base64]);

  if (error) {
    return (
      <div className="preview-error">
        <p>PPTX 解析失败</p>
        <small>{error}</small>
      </div>
    );
  }
  if (slides.length === 0) {
    return (
      <div className="preview-loading">
        <div className="preview-spinner" />
        <span>解析幻灯片...</span>
      </div>
    );
  }

  const current = slides[activeSlide];

  return (
    <div className="preview-pptx-container">
      <div className="pptx-slide-area">
        <div className="pptx-slide-card">
          <div className="pptx-slide-number">Slide {current.index}</div>
          <div className="pptx-slide-content">
            {current.text || <span className="pptx-empty-slide">此幻灯片无文本内容</span>}
          </div>
        </div>
      </div>
      <div className="pptx-controls">
        <button
          className="compact-button secondary"
          disabled={activeSlide === 0}
          onClick={() => setActiveSlide((s) => Math.max(0, s - 1))}
        >
          上一页
        </button>
        <span className="pptx-page-indicator">
          {activeSlide + 1} / {slides.length}
        </span>
        <button
          className="compact-button secondary"
          disabled={activeSlide === slides.length - 1}
          onClick={() => setActiveSlide((s) => Math.min(slides.length - 1, s + 1))}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

// ── 子组件：图片（缩放 + 拖拽平移） ────────────────────────────

function ImagePreview({ path, name }: { path: string; name: string }) {
  const src = convertFileSrc(path);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.25)), []);
  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) => Math.max(0.25, Math.min(5, s + (e.deltaY > 0 ? -0.1 : 0.1))));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      className="preview-image-container"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
    >
      <div className="image-zoom-controls">
        <button className="compact-button secondary" onClick={zoomOut} title="缩小">
          <ZoomOut size={14} />
        </button>
        <span className="zoom-label">{Math.round(scale * 100)}%</span>
        <button className="compact-button secondary" onClick={zoomIn} title="放大">
          <ZoomIn size={14} />
        </button>
        <button className="compact-button secondary" onClick={resetZoom} title="重置">
          <RotateCw size={14} />
        </button>
      </div>
      <img
        src={src}
        alt={name}
        className="preview-image"
        draggable={false}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center center",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
        }}
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

function AudioPreview({ path, name }: { path: string; name: string }) {
  const src = convertFileSrc(path);
  const icon = getFileIcon(name, false, 48);
  return (
    <div className="preview-audio-container">
      <div className="audio-artwork">{icon}</div>
      <div className="audio-name">{name}</div>
      <audio src={src} controls className="preview-audio" />
    </div>
  );
}

// ── 子组件：Markdown（带代码高亮） ───────────────────────────

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="preview-markdown-container">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            if (match && hljs.getLanguage(match[1])) {
              const html = hljs.highlight(codeStr, { language: match[1] }).value;
              return (
                <pre>
                  <code
                    className={className}
                    dangerouslySetInnerHTML={{ __html: html }}
                    {...props}
                  />
                </pre>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── 子组件：HTML（沙箱渲染）─────────────────────────────

function HtmlPreview({ content }: { content: string }) {
  const [viewMode, setViewMode] = useState<"render" | "source">("render");

  return (
    <div className="preview-html-container">
      <div className="html-toolbar">
        <button
          className={`compact-button ${viewMode === "render" ? "primary" : "secondary"}`}
          onClick={() => setViewMode("render")}
        >
          <Eye size={13} /> 渲染
        </button>
        <button
          className={`compact-button ${viewMode === "source" ? "primary" : "secondary"}`}
          onClick={() => setViewMode("source")}
        >
          <Monitor size={13} /> 源码
        </button>
      </div>
      {viewMode === "render" ? (
        <div className="html-render-wrapper">
          <iframe
            className="html-render-iframe"
            srcDoc={content}
            title="HTML Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <CodePreview content={content} ext="html" />
      )}
    </div>
  );
}

// ── 子组件：代码（语法高亮） ──────────────────────────────

function CodePreview({ content, ext }: { content: string; ext: string }) {
  const [highlighted, setHighlighted] = useState<string>("");
  const lines = useMemo(() => content.split("\n"), [content]);

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
    <div className="code-viewer">
      <div className="code-line-numbers">
        {lines.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre className="preview-text code-highlight">
        <code dangerouslySetInnerHTML={{ __html: highlighted || content }} />
      </pre>
    </div>
  );
}

// ── 子组件：不可预览（优化版）───────────────────────────────

function UnsupportedPreview({
  ext,
  name,
  size,
  onOpenExternal,
}: {
  ext: string;
  name: string;
  size?: number;
  onOpenExternal: () => void;
}) {
  const fileIcon = getFileIcon(name, false, 40);
  const label = extLabel(ext);
  const displaySize = size != null ? formatSize(size) : null;

  return (
    <div className="preview-unsupported">
      <div className="unsupported-card">
        <div className="unsupported-icon-wrapper">{fileIcon}</div>
        <h3 className="unsupported-file-name">{name}</h3>
        <div className="unsupported-meta">
          {displaySize && <span className="unsupported-badge">{displaySize}</span>}
          <span className="unsupported-badge accent">{label}</span>
        </div>
        <p className="unsupported-hint">此文件格式暂不支持在线预览</p>
        <button className="primary unsupported-action" onClick={onOpenExternal}>
          <Download size={15} />
          用系统程序打开
        </button>
      </div>
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
    if (["video", "image", "pptx"].includes(previewType)) {
      return { maxWidth: "90vw", width: 960 };
    }
    return { maxWidth: "90vw", width: 800 };
  }, [previewType]);

  // highlight.js 主题
  useEffect(() => {
    const linkId = "hljs-theme";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    const href =
      themeMode === "dark"
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

  // Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const headerExtra = (
    <button className="secondary compact-button" onClick={onOpenExternal} title="用系统程序打开">
      <Download size={14} />
      外部打开
    </button>
  );

  const fileIcon = getFileIcon(file.name, false, 14);
  const fileSize = file.info?.size != null ? formatSize(file.info.size) : null;
  const fileLabel = extLabel(ext);

  return (
    <Modal title={file.name} onClose={onClose} style={modalStyle} headerExtra={headerExtra}>
      <div className="preview-content">
        {file.loading && (
          <div className="preview-loading">
            <div className="preview-spinner" />
            <span>加载中...</span>
          </div>
        )}
        {file.error && (
          <div className="preview-error">
            <div className="preview-error-icon">
              <FileX2 size={36} strokeWidth={1.2} />
            </div>
            <p>预览失败</p>
            <small>{file.error}</small>
          </div>
        )}
        {!file.loading &&
          !file.error &&
          (() => {
            switch (previewType) {
              case "pdf":
                return <PdfPreview path={file.path} />;
              case "excel":
                return file.content ? <ExcelPreview base64={file.content} ext={ext} /> : null;
              case "word":
                return file.content ? (
                  <WordPreview base64={file.content} themeMode={themeMode} />
                ) : null;
              case "pptx":
                return file.content ? <PptxPreview base64={file.content} /> : null;
              case "html":
                return file.content ? <HtmlPreview content={file.content} /> : null;
              case "image":
                return <ImagePreview path={file.path} name={file.name} />;
              case "video":
                return <VideoPreview path={file.path} />;
              case "audio":
                return <AudioPreview path={file.path} name={file.name} />;
              case "markdown":
                return file.content ? <MarkdownPreview content={file.content} /> : null;
              case "text":
                return file.content ? <CodePreview content={file.content} ext={ext} /> : null;
              case "unsupported":
                return (
                  <UnsupportedPreview
                    ext={ext}
                    name={file.name}
                    size={file.info?.size}
                    onOpenExternal={onOpenExternal}
                  />
                );
              default:
                return file.content ? <CodePreview content={file.content} ext={ext} /> : null;
            }
          })()}
      </div>
      {!file.loading && !file.error && (
        <div className="preview-info-bar">
          {fileIcon}
          <span className="preview-info-name">{file.name}</span>
          {fileSize && <span className="preview-info-size">{fileSize}</span>}
          <span className="preview-info-type">{fileLabel}</span>
          <div className="preview-info-bar-spacer" />
          <span className="preview-info-hint">Esc 关闭</span>
        </div>
      )}
    </Modal>
  );
}
