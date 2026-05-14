import { X } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onClose,
  danger = false
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p dangerouslySetInnerHTML={{ __html: message }} />
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            {cancelText}
          </button>
          <button className={`primary ${danger ? "danger" : ""}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
