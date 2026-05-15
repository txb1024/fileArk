import { Download, Binary } from "lucide-react";
import { getFileIcon } from "../../utils";
import { extLabel, formatSize } from "./utils";

interface UnsupportedPreviewProps {
  ext: string;
  name: string;
  size?: number;
  onOpenExternal: () => void;
  onViewAsHex?: () => void;
}

const HEX_LIMIT = 1024 * 1024; // 1MB 以内允许 hex 查看

export function UnsupportedPreview({
  ext,
  name,
  size,
  onOpenExternal,
  onViewAsHex,
}: UnsupportedPreviewProps) {
  const fileIcon = getFileIcon(name, false, 40);
  const label = extLabel(ext);
  const displaySize = size != null ? formatSize(size) : null;
  const canHex = onViewAsHex && size != null && size <= HEX_LIMIT;

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
        <div className="unsupported-actions">
          <button className="primary unsupported-action" onClick={onOpenExternal}>
            <Download size={15} />
            用系统程序打开
          </button>
          {canHex && (
            <button className="secondary unsupported-action" onClick={onViewAsHex}>
              <Binary size={15} />
              以十六进制查看
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
