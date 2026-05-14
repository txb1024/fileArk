import { FormEvent, useState } from "react";
import { Modal } from "../components";

interface RenameWorkspaceDialogProps {
  currentName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function RenameWorkspaceDialog({ currentName, onConfirm, onClose }: RenameWorkspaceDialogProps) {
  const [name, setName] = useState(currentName);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === currentName) {
      onClose();
      return;
    }
    onConfirm(name.trim());
  }

  return (
    <Modal title="重命名資料庫" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          名稱
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="submit" disabled={!name.trim()}>
            確定
          </button>
        </div>
      </form>
    </Modal>
  );
}
