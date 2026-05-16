import { Check, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { Modal } from "../components";

const messages = {
  zh: {
    manageCategories: "管理分类",
    addCategory: "添加分类",
    editCategory: "编辑分类",
    deleteCategory: "删除分类",
    categoryName: "分类名称",
    categoryNamePlaceholder: "输入新的分类名称…",
    categoryDeleteWarning: "删除分类不会删除已有文件夹中的文件，仅将该分类从列表中移除。",
    close: "关闭",
    save: "保存",
    cancel: "取消",
    emptyHint: "暂无分类，点击下方按钮创建第一个分类。",
  },
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
  onClose,
}: CategoryEditModalProps) {
  const t = messages.zh;
  return (
    <Modal title={t.manageCategories} onClose={onClose}>
      <div className="category-edit-panel">
        {categories.length === 0 ? (
          <div className="category-edit-empty">
            <FolderPlus size={28} />
            <p>{t.emptyHint}</p>
          </div>
        ) : (
          <div className="category-edit-list">
            {categories.map((category, index) => {
              const isEditing = editing?.index === index;
              return (
                <div
                  className={isEditing ? "category-edit-row editing" : "category-edit-row"}
                  key={`${category}-${index}`}
                >
                  {isEditing ? (
                    <>
                      <input
                        className="category-edit-input"
                        value={newName}
                        onChange={(e) => onNewNameChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSave();
                          if (e.key === "Escape") onEdit(-1, "");
                        }}
                        placeholder={t.categoryNamePlaceholder}
                        autoFocus
                      />
                      <div className="category-edit-actions">
                        <button
                          className="category-edit-icon-btn primary-hover"
                          onClick={onSave}
                          title={t.save}
                          disabled={!newName.trim()}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="category-edit-icon-btn"
                          onClick={() => onEdit(-1, "")}
                          title={t.cancel}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="category-edit-name" title={category}>
                        {category}
                      </span>
                      <div className="category-edit-actions">
                        <button
                          className="category-edit-icon-btn"
                          onClick={() => onEdit(index, category)}
                          title={t.editCategory}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="category-edit-icon-btn danger-hover"
                          onClick={() => onDelete(index)}
                          title={t.deleteCategory}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button className="category-edit-add" onClick={onAdd}>
          <Plus size={15} />
          <span>{t.addCategory}</span>
        </button>

        <p className="category-edit-hint">{t.categoryDeleteWarning}</p>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}
