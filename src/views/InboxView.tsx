import { FileInput, Inbox, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { AppData, Messages } from "../types";

interface InboxViewProps {
  data: AppData;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onImport: () => void;
  onOrganize: (projectId: string, category: string, itemIds?: string[]) => void;
  onDataChange: (data: AppData) => void;
  t: Messages;
}

export function InboxView({ data, selected, onSelectedChange, onImport, onOrganize, onDataChange, t }: InboxViewProps) {
  const [projectId, setProjectId] = useState(data.projects[0]?.id || "");
  const [category, setCategory] = useState(data.settings.categories[0] || "");

  function toggle(id: string) {
    onSelectedChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  async function handleDeleteSelected() {
    if (selected.length === 0) return;
    const next = await api.deleteInboxItems(selected);
    onDataChange(next);
    onSelectedChange([]);
  }

  async function handleDeleteOne(id: string) {
    const next = await api.deleteInboxItems([id]);
    onDataChange(next);
    onSelectedChange(selected.filter((s) => s !== id));
  }

  async function handleClearAll() {
    const next = await api.clearInbox();
    onDataChange(next);
    onSelectedChange([]);
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t.inboxEyebrow}</p>
          <h1>{t.inboxTitle}</h1>
          <p>{t.inboxBody}</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={onImport}>
            <FileInput size={16} />
            {t.importFiles}
          </button>
          {data.inbox.length > 0 && (
            <button className="secondary" onClick={handleClearAll}>
              <Trash2 size={16} />
              {t.clearAll}
            </button>
          )}
        </div>
      </div>

      <div className="organize-bar">
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {data.projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {data.settings.categories.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="organize-bar-actions">
          <button
            className="primary"
            disabled={selected.length === 0 || !projectId}
            onClick={() => onOrganize(projectId, category)}
          >
            {t.organizeSelected} {selected.length}
          </button>
          {selected.length > 0 && (
            <button className="secondary compact-button" onClick={handleDeleteSelected}>
              <Trash2 size={16} />
              {t.deleteSelected}
            </button>
          )}
        </div>
      </div>

      <div className="inbox-table">
        {data.inbox.length === 0 ? (
          <div className="empty-state">
            <Inbox size={48} strokeWidth={1} />
            <h3>{t.inboxEmptyTitle}</h3>
            <p>{t.inboxEmptyBody}</p>
          </div>
        ) : (
          data.inbox.map((item) => {
            const recommendedProject = data.projects.find((project) => project.id === item.recommendedProjectId);
            return (
              <div className="inbox-row" key={item.id}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                <div className="inbox-main">
                  <strong>{item.name}</strong>
                  <span>{item.sourcePath}</span>
                </div>
                <div className="recommend">
                  <span>{recommendedProject?.name || t.noMatchProject}</span>
                  <small>{item.recommendedCategory}</small>
                </div>
                <button
                  className="secondary compact-button"
                  disabled={!recommendedProject}
                  onClick={() => recommendedProject && onOrganize(recommendedProject.id, item.recommendedCategory, [item.id])}
                >
                  {t.applyRecommend}
                </button>
                <button
                  className="icon-button inbox-delete-btn"
                  onClick={() => handleDeleteOne(item.id)}
                  title={t.removeFromInbox}
                  aria-label={t.deleteFile}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
