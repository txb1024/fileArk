import { Trash2 } from "lucide-react";
import { Modal } from "../components";

interface ConfirmDeleteDialogProps {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteDialog({ name, onConfirm, onClose }: ConfirmDeleteDialogProps) {
  return (
    <Modal title="刪除資料庫" onClose={onClose}>
      <p>
        確定刪除「<strong>{name}</strong>」嗎？此操作無法撤銷，資料庫數據將永久丟失。
      </p>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button className="primary danger" onClick={onConfirm}>
          <Trash2 size={14} />
          確認刪除
        </button>
      </div>
    </Modal>
  );
}
