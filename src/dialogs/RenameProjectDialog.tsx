import { FormEvent, useState } from "react";
import { Modal } from "../components";

interface RenameProjectDialogProps {
  currentName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function RenameProjectDialog({ currentName, onConfirm, onClose }: RenameProjectDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
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
      setError("名称不能包含 \\ / : * ? \" < > |");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Modal title="重命名项目" onClose={onClose}>
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
          />
        </label>
        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#ef4444" }}>{error}</p>
        )}
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          会同步重命名项目所在的磁盘文件夹。
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="submit" disabled={!name.trim()}>
            确定
          </button>
        </div>
      </form>
    </Modal>
  );
}
