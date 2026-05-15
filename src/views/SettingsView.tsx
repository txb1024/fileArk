import { Check, Moon, Pencil, Sun, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../api";
import type {
  AppData,
  AccentColor,
  Language,
  ThemeMode,
  WorkspaceRegistry,
  Messages,
} from "../types";

interface SettingsViewProps {
  data: AppData;
  setData: (data: AppData) => void;
  registry: WorkspaceRegistry | null;
  language: Language;
  setLanguage: (lang: Language) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  t: Messages;
  onRename: (workspaceId: string, currentName: string) => void;
  onDelete: (workspaceId: string, name: string) => void;
  onSwitch: (workspaceId: string) => void;
  onMigrateRoot: (oldRoot: string, newRoot: string, fileCount: number) => void;
  categories: string[];
  onEditCategories: () => void;
}

export function SettingsView({
  data,
  setData,
  registry,
  language,
  setLanguage,
  themeMode,
  setThemeMode,
  accentColor,
  setAccentColor,
  t,
  onRename,
  onDelete,
  onSwitch,
  onMigrateRoot,
  categories,
  onEditCategories,
}: SettingsViewProps) {
  const [autostartEnabled, setAutostartEnabled] = useState(false);

  useEffect(() => {
    api
      .getAutostartEnabled()
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  async function handleAutostartToggle(enabled: boolean) {
    try {
      await api.setAutostartEnabled(enabled);
      setAutostartEnabled(enabled);
    } catch (error) {
      console.error("Failed to set autostart:", error);
    }
  }

  async function chooseRoot() {
    const root = await api.selectRoot();
    if (!root) return;
    const oldRoot = data.settings.workspaceRoot;
    if (oldRoot && oldRoot !== root) {
      const count = await api.checkRootFiles(oldRoot);
      if (count > 0) {
        onMigrateRoot(oldRoot, root, count);
        return;
      }
    }
    setData(await api.updateRoot(root));
  }

  return (
    <section className="page settings-page">
      <div className="page-header">
        <div>
          <h1>{t.settingsTitle}</h1>
          <p className="text-subhead">{t.settingsBody}</p>
        </div>
      </div>

      {/* Appearance */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t.appearance}</h3>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.themeLabel}</strong>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`secondary compact-button ${themeMode === "light" ? "active-toggle" : ""}`}
              onClick={() => setThemeMode("light")}
            >
              {themeMode === "light" && <Check size={14} />}
              <Sun size={14} />
              {t.light}
            </button>
            <button
              className={`secondary compact-button ${themeMode === "dark" ? "active-toggle" : ""}`}
              onClick={() => setThemeMode("dark")}
            >
              {themeMode === "dark" && <Check size={14} />}
              <Moon size={14} />
              {t.dark}
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.accentLabel}</strong>
          </div>
          <div className="accent-swatches">
            {(
              [
                ["blue", "#2383e2"],
                ["teal", "#0f7b6f"],
                ["violet", "#9065b0"],
                ["orange", "#d9730d"],
              ] as const
            ).map(([name, color]) => (
              <button
                key={name}
                className={`accent-swatch ${accentColor === name ? "active" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => setAccentColor(name)}
                title={name}
              >
                {accentColor === name && <Check size={14} color="#fff" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* General */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t.general}</h3>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.language}</strong>
          </div>
          <select
            className="toolbar-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            style={{ minWidth: 120 }}
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.autostart}</strong>
            <p>{t.autostartDesc}</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={autostartEnabled}
              onChange={(e) => handleAutostartToggle(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      {/* Storage */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t.storage}</h3>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t.workspaceRoot}</strong>
            <p>{t.workspaceRootDesc}</p>
            <p className="path-display" title={data.settings.workspaceRoot || undefined}>
              {data.settings.workspaceRoot || t.workspaceRootNotSet}
            </p>
          </div>
          <button className="secondary" onClick={chooseRoot}>
            {t.changeRoot}
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t.categoryManagement}</h3>
        </div>
        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              marginBottom: 12,
            }}
          >
            <strong>{t.categoryManagement}</strong>
            <button className="secondary compact-button" onClick={onEditCategories}>
              <Pencil size={14} />
              {t.editCategory}
            </button>
          </div>
          <div className="category-grid">
            {categories.map((category) => (
              <div className="category-tile passive" key={category}>
                {category}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Database */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>{t.database}</h3>
        </div>
        {registry?.workspaces.map((ws) => (
          <div className="setting-row" key={ws.id}>
            <div>
              <strong>{ws.name}</strong>
              {ws.id === registry.activeWorkspaceId && (
                <span className="badge">{t.currentDatabase}</span>
              )}
            </div>
            <div className="setting-actions">
              {ws.id !== registry.activeWorkspaceId && (
                <button className="secondary compact-button" onClick={() => onSwitch(ws.id)}>
                  <Check size={14} />
                  {t.switchDatabase}
                </button>
              )}
              <button className="secondary compact-button" onClick={() => onRename(ws.id, ws.name)}>
                <Pencil size={14} />
                {t.renameDatabase}
              </button>
              {ws.id !== registry.activeWorkspaceId && (
                <button
                  className="secondary compact-button danger-hover"
                  onClick={() => onDelete(ws.id, ws.name)}
                >
                  <Trash2 size={14} />
                  {t.deleteDatabase}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
