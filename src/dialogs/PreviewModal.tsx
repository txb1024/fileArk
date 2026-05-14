import { Download, Eye, X } from "lucide-react";
import type { ReactNode } from "react";
import { getFileIcon } from "../utils";
import { Modal } from "../components";

interface PreviewModalProps {
  file: {
    path: string;
    name: string;
    content?: string;
    loading: boolean;
    error?: string;
    info?: { ext: string; size: number; is_image: boolean };
  };
  onClose: () => void;
  onOpenExternal: () => void;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function PreviewModal({ file, onClose, onOpenExternal }: PreviewModalProps) {
  return (
    <Modal title={file.name} onClose={onClose} style={{ maxWidth: "90vw", width: 800 }}>
      <div className="preview-header" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16 }}>
        <div className="preview-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {getFileIcon(file.name, false, 20)}
          <span>{file.name}</span>
          {file.info && (
            <small className="preview-info">
              {file.info.ext.toUpperCase()} · {formatSize(file.info.size)}
            </small>
          )}
        </div>
        <div className="preview-actions">
          <button className="secondary compact-button" onClick={onOpenExternal} title="用系统程序打开">
            <Download size={14} />
            外部打开
          </button>
        </div>
      </div>
      <div className="preview-content">
        {file.loading && <div className="preview-loading">加载中...</div>}
        {file.error && (
          <div className="preview-error">
            <p>预览失败</p>
            <small>{file.error}</small>
          </div>
        )}
        {!file.loading && !file.error && file.info?.is_image && file.content && (
          <div className="preview-image-container">
            <img src={file.content} alt={file.name} className="preview-image" />
          </div>
        )}
        {!file.loading && !file.error && !file.info?.is_image && file.content && (
          <pre className="preview-text">
            <code>{file.content}</code>
          </pre>
        )}
      </div>
    </Modal>
  );
}
