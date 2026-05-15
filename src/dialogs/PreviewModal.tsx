import { Download, FileX2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../components";
import { getFileIcon } from "../utils";
import { invoke } from "@tauri-apps/api/core";
import {
  PdfPreview,
  ExcelPreview,
  WordPreview,
  WordLegacyPreview,
  PptxPreview,
  ImagePreview,
  VideoPreview,
  AudioPreview,
  MarkdownPreview,
  HtmlPreview,
  CodePreview,
  UnsupportedPreview,
  IpynbPreview,
  EpubPreview,
  ArchivePreview,
  SubtitlePreview,
  EmlPreview,
  Model3DPreview,
  FontPreview,
  GeoPreview,
  HexPreview,
  RtfPreview,
  extLabel,
  formatSize,
} from "./preview";

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

export function PreviewModal({ file, onClose, onOpenExternal, themeMode }: PreviewModalProps) {
  const previewType = file.info?.previewType ?? "text";
  const ext = file.info?.ext ?? "";

  const [forceHex, setForceHex] = useState(false);
  const [hexBase64, setHexBase64] = useState<string | null>(null);
  const [hexError, setHexError] = useState<string | null>(null);

  // 切换文件时重置 hex 状态
  useEffect(() => {
    setForceHex(false);
    setHexBase64(null);
    setHexError(null);
  }, [file.path]);

  // 触发 hex 加载
  useEffect(() => {
    if (!forceHex || hexBase64) return;
    let cancelled = false;
    invoke<string>("read_file_binary", { filePath: file.path })
      .then((b) => {
        if (!cancelled) setHexBase64(b);
      })
      .catch((e) => {
        if (!cancelled) setHexError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [forceHex, hexBase64, file.path]);

  // 根据类型决定 Modal 尺寸
  const modalStyle = useMemo(() => {
    if (["pdf", "excel", "word", "epub", "ipynb", "model3d", "geo", "email"].includes(previewType)) {
      return { maxWidth: "95vw", width: 1200 };
    }
    if (["video", "image", "pptx", "font", "archive"].includes(previewType)) {
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
  const fileLabel = forceHex ? "十六进制" : extLabel(ext);

  const renderHex = () => {
    if (hexError) {
      return (
        <div className="preview-error">
          <p>读取二进制失败</p>
          <small>{hexError}</small>
        </div>
      );
    }
    if (!hexBase64) {
      return (
        <div className="preview-loading">
          <div className="preview-spinner" />
          <span>读取字节流...</span>
        </div>
      );
    }
    return <HexPreview base64={hexBase64} />;
  };

  const renderBody = () => {
    if (file.loading) {
      return (
        <div className="preview-loading">
          <div className="preview-spinner" />
          <span>加载中...</span>
        </div>
      );
    }
    if (file.error) {
      return (
        <div className="preview-error">
          <div className="preview-error-icon">
            <FileX2 size={36} strokeWidth={1.2} />
          </div>
          <p>预览失败</p>
          <small>{file.error}</small>
        </div>
      );
    }
    if (forceHex) return renderHex();

    switch (previewType) {
      case "pdf":
        return <PdfPreview path={file.path} />;
      case "excel":
        return file.content ? <ExcelPreview base64={file.content} ext={ext} /> : null;
      case "word":
        return file.content ? <WordPreview base64={file.content} themeMode={themeMode} /> : null;
      case "word_legacy":
        return <WordLegacyPreview name={file.name} onOpenExternal={onOpenExternal} />;
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
      case "ipynb":
        return file.content ? <IpynbPreview base64={file.content} /> : null;
      case "epub":
        return file.content ? <EpubPreview base64={file.content} themeMode={themeMode} /> : null;
      case "archive":
        return file.content ? <ArchivePreview base64={file.content} /> : null;
      case "subtitle":
        return file.content ? <SubtitlePreview base64={file.content} ext={ext} /> : null;
      case "email":
        return file.content ? <EmlPreview base64={file.content} /> : null;
      case "model3d":
        return file.content ? <Model3DPreview base64={file.content} ext={ext} /> : null;
      case "font":
        return file.content ? <FontPreview base64={file.content} ext={ext} name={file.name} /> : null;
      case "geo":
        return file.content ? <GeoPreview base64={file.content} ext={ext} /> : null;
      case "rtf":
        return file.content ? <RtfPreview base64={file.content} /> : null;
      case "unsupported":
        return (
          <UnsupportedPreview
            ext={ext}
            name={file.name}
            size={file.info?.size}
            onOpenExternal={onOpenExternal}
            onViewAsHex={() => setForceHex(true)}
          />
        );
      default:
        return file.content ? <CodePreview content={file.content} ext={ext} /> : null;
    }
  };

  return (
    <Modal title={file.name} onClose={onClose} style={modalStyle} headerExtra={headerExtra}>
      <div className="preview-content">{renderBody()}</div>
      {!file.loading && !file.error && (
        <div className="preview-info-bar">
          {fileIcon}
          <span className="preview-info-name">{file.name}</span>
          {fileSize && <span className="preview-info-size">{fileSize}</span>}
          <span className="preview-info-type">{fileLabel}</span>
          <div className="preview-info-bar-spacer" />
          {forceHex && (
            <button className="compact-button secondary" onClick={() => setForceHex(false)}>
              退出 HEX
            </button>
          )}
          <span className="preview-info-hint">Esc 关闭</span>
        </div>
      )}
    </Modal>
  );
}
