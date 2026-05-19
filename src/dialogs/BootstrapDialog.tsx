import { Folder, FolderOpen } from "lucide-react";
import { Modal } from "../components";

interface BootstrapDialogProps {
  defaultRoot: string;
  language: "zh" | "en";
  onUseDefault: () => void;
  onPickCustom: () => void;
}

const messages = {
  zh: {
    title: "选择工作目录",
    body: "FileArk 会把新建项目的文件夹放在这里。可以现在选,也可以以后到「设置 → 存储」修改。",
    currentLabel: "当前默认目录",
    useDefault: "使用此目录",
    pickCustom: "选择其他目录",
  },
  en: {
    title: "Choose workspace folder",
    body: "FileArk creates project folders under this location. You can pick another folder now, or change it later in Settings → Storage.",
    currentLabel: "Default folder",
    useDefault: "Use this folder",
    pickCustom: "Pick another folder",
  },
};

/** 首次启动时显示;让用户确认或选择工作目录,避免默认目录(Documents/FileArk)和习惯不符。 */
export function BootstrapDialog({
  defaultRoot,
  language,
  onUseDefault,
  onPickCustom,
}: BootstrapDialogProps) {
  const t = messages[language];
  return (
    <Modal title={t.title} onClose={onUseDefault /* 关闭=接受默认 */}>
      <p>{t.body}</p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "var(--surface-soft)",
          borderRadius: 8,
          margin: "12px 0 16px",
          color: "var(--muted)",
          fontSize: 13,
          wordBreak: "break-all",
        }}
      >
        <Folder size={16} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, marginBottom: 2 }}>{t.currentLabel}</div>
          <div style={{ color: "var(--text)" }}>{defaultRoot}</div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={onPickCustom}>
          <FolderOpen size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          {t.pickCustom}
        </button>
        <button className="primary" onClick={onUseDefault}>
          {t.useDefault}
        </button>
      </div>
    </Modal>
  );
}
