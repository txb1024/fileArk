import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import type { AppData } from "../types";
import { Modal } from "../components";

interface NewProjectDialogProps {
  root: string;
  onClose: () => void;
  onCreated: (data: AppData) => void;
  onSubmit: (input: {
    name: string;
    alias: string;
    tags: string[];
    pinned: boolean;
    root: string;
  }) => Promise<AppData>;
}

export function NewProjectDialog({ root, onClose, onCreated, onSubmit }: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(true);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = await onSubmit({
      name: name.trim(),
      alias: alias.trim(),
      tags: tags.split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean),
      pinned,
      root
    });
    onCreated(next);
  }

  return (
    <Modal title="新建項目" onClose={onClose} style={{ minWidth: 400 }}>
      <form onSubmit={submit}>
        <label>
          項目名稱
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：醫院支付系統改造"
            autoFocus
          />
        </label>
        <label>
          常用別名
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="例如：支付改造、門診支付"
          />
        </label>
        <label>
          標籤
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="例如：HIS 支付 2026"
          />
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
          建立後置頂
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="submit">
            建立項目
          </button>
        </div>
      </form>
    </Modal>
  );
}
