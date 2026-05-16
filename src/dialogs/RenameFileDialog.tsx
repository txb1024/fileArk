import { FormEvent, useState } from "react";
import { Modal } from "../components";

interface RenameFileDialogProps {
  currentName: string;
  isDirectory?: boolean;
  onConfirm: (name: string) => void | Promise<void>;
  onClose: () => void;
}

export function RenameFileDialog({
  currentName,
  isDirectory,
  onConfirm,
  onClose,
}: RenameFileDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名称不能为空");
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    if (/[\\/:*?"<>|]/.test(trimmed)) {
      setError('名称不能包含 \\ / : * ? " < > |');
      return;
    }
    try {
      setSubmitting(true);
      await onConfirm(trimmed);
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isDirectory ? "重命名文件夹" : "重命名文件"} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          名称
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
            onFocus={(e) => {
              // 选中文件名主体(扩展名前)便于直接编辑
              if (!isDirectory) {
                const dot = e.currentTarget.value.lastIndexOf(".");
                if (dot > 0) e.currentTarget.setSelectionRange(0, dot);
                else e.currentTarget.select();
              } else {
                e.currentTarget.select();
              }
            }}
          />
        </label>
        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#ef4444" }}>{error}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button className="primary" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "处理中…" : "确定"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
