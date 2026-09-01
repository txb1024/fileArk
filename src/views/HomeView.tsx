import { ArrowRight, CalendarDays, Check, Clock3, FileInput, FolderPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { EmptyState, Panel, ProjectCard } from "../components";
import { fmtHM, fromISO } from "../components/todo/dateUtils";
import type { AppData, Project, Messages, Todo } from "../types";

interface HomeViewProps {
  data: AppData;
  recentProjects: Project[];
  onOpenProject: (project: Project) => void;
  onNewProject: () => void;
  onImport: () => void;
  onOpenCalendar: () => void;
  language: "zh" | "en";
  workspaceKey?: string;
  t: Messages;
}

export function HomeView({
  data,
  recentProjects,
  onOpenProject,
  onNewProject,
  onImport,
  onOpenCalendar,
  language,
  workspaceKey,
  t,
}: HomeViewProps) {
  const [todos, setTodos] = useState<Todo[]>([]);

  const reload = useCallback(async () => {
    try {
      const list = await api.listTodos();
      setTodos(list);
    } catch (err) {
      console.error("listTodos failed", err);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, workspaceKey]);

  // 过滤出今天的待办,按 start 升序
  const todayTodos = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return todos
      .filter((t0) => {
        const s = fromISO(t0.start).getTime();
        const e = fromISO(t0.end).getTime();
        return s < dayEnd && e > dayStart;
      })
      .sort((a, b) => fromISO(a.start).getTime() - fromISO(b.start).getTime());
  }, [todos]);

  const doneCount = todayTodos.filter((t0) => t0.done).length;

  const onToggleDone = useCallback(async (todo: Todo) => {
    try {
      const next = await api.toggleTodoDone(todo.id);
      setTodos((arr) => arr.map((x) => (x.id === next.id ? next : x)));
    } catch (err) {
      console.error("toggleTodoDone failed", err);
    }
  }, []);

  return (
    <section className="page home-page">
      <div className="hero-band home-hero">
        <div>
          <p className="eyebrow">{t.heroEyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroBody}</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={onNewProject}>
            <FolderPlus size={16} />
            {t.newProject}
          </button>
          <button className="secondary" onClick={onImport}>
            <FileInput size={16} />
            {t.importToInbox}
          </button>
        </div>
      </div>

      <div className="home-grid">
        <Panel title={t.recentProjects} icon={<Clock3 size={18} />}>
          <div className="home-recent-list">
            {recentProjects.length === 0 ? (
              <EmptyState title={t.emptyProjectTitle} body={t.emptyProjectBody} />
            ) : (
              <div className="project-grid">
                {recentProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} onOpen={() => onOpenProject(project)} />
                ))}
              </div>
            )}
          </div>
          <div className="home-recent-stats">
            <span>
              <strong>{data.projects.length}</strong> {t.metricProjectCount}
            </span>
            <span>
              <strong>{data.inbox.length}</strong> {t.metricInboxCount}
            </span>
            <span>
              <strong>{data.projects.filter((p) => p.pinned).length}</strong> {t.metricPinnedCount}
            </span>
          </div>
        </Panel>

        <Panel
          title={
            <span className="home-today-title">
              {t.todayTodos}
              {todayTodos.length > 0 && (
                <span className="home-today-count">
                  {doneCount}/{todayTodos.length}
                </span>
              )}
            </span>
          }
          icon={<CalendarDays size={18} />}
        >
          {todayTodos.length === 0 ? (
            <div className="home-today-empty">
              <EmptyState title={t.noTodayTodosTitle} body={t.noTodayTodosBody} />
              <button className="secondary home-today-cta" onClick={onOpenCalendar}>
                <CalendarDays size={14} />
                {t.openCalendar}
              </button>
            </div>
          ) : (
            <div className="home-today-body">
              <ul className="home-todo-list">
                {todayTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className={`home-todo-item${todo.done ? " is-done" : ""}`}
                  >
                    <button
                      type="button"
                      className="home-todo-check"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleDone(todo);
                      }}
                      aria-label={todo.done ? "标记未完成" : "标记完成"}
                    >
                      {todo.done && <Check size={11} strokeWidth={3} />}
                    </button>
                    <button
                      type="button"
                      className="home-todo-body"
                      onClick={onOpenCalendar}
                      title={t.openCalendar}
                    >
                      <span className="home-todo-title">
                        {todo.title || (language === "zh" ? "(无标题)" : "(Untitled)")}
                      </span>
                      <span className="home-todo-time">
                        {fmtHM(fromISO(todo.start))} – {fmtHM(fromISO(todo.end))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="home-today-link" onClick={onOpenCalendar}>
                {t.openCalendar}
                <ArrowRight size={13} />
              </button>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
