import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

const messages = {
  zh: {
    manageCategories: "管理分类",
    addCategory: "添加分类",
    editCategory: "编辑分类",
    deleteCategory: "删除分类",
    categoryName: "分类名称",
    categoryNamePlaceholder: "输入分类名称",
    categoryDeleteWarning: "删除分类不会删除文件夹中的文件，但分类将从列表中移除。"
  }
};

interface CategoryEditModalProps {
  categories: string[];
  editing: { index: number; name: string } | null;
  newName: string;
  onNewNameChange: (name: string) => void;
  onSave: () => void;
  onDelete: (index: number) => void;
  onEdit: (index: number, name: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

export function CategoryEditModal({
  categories,
  editing,
  newName,
  onNewNameChange,
  onSave,
  onDelete,
  onEdit,
  onAdd,
  onClose
}: CategoryEditModalProps) {
  const t = messages.zh;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ minWidth: 400 }}>
        <h2>{t.manageCategories}</h2>
        <div className="category-edit-list">
          {categories.map((category, index) => (
            <div className="category-edit-row" key={index}>
              {editing?.index === index ? (
                <>
                  <input
                    value={newName}
                    onChange={(e) => onNewNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSave();
                      if (e.key === "Escape") onEdit(-1, "");
                    }}
                    autoFocus
                  />
                  <button className="secondary compact-button" onClick={onSave}>
                    <Check size={14} />
                  </button>
                  <button className="secondary compact-button" onClick={() => onEdit(-1, "")}>
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span>{category}</span>
                  <div className="category-edit-actions">
                    <button className="secondary compact-button" onClick={() => onEdit(index, category)}>
                      <Pencil size={14} />
                    </button>
                    <button className="secondary compact-button danger-hover" onClick={() => onDelete(index)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{t.categoryDeleteWarning}</p>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={onClose}>
            关闭
          </button>
          <button className="primary" onClick={onAdd}>
            <Plus size={15} />
            {t.addCategory}
          </button>
        </div>
      </div>
    </div>
  );
}
