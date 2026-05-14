import { Clock3, FileInput, FolderPlus, Sparkles } from "lucide-react";
import { EmptyState, Metric, Panel, ProjectCard } from "../components";
import type { AppData, Project, Messages } from "../types";

interface HomeViewProps {
  data: AppData;
  recentProjects: Project[];
  onOpenProject: (project: Project) => void;
  onNewProject: () => void;
  onImport: () => void;
  t: Messages;
}

export function HomeView({ data, recentProjects, onOpenProject, onNewProject, onImport, t }: HomeViewProps) {
  return (
    <section className="page">
      <div className="hero-band">
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

      <div className="metric-grid">
        <Metric label={t.metricProjectCount} value={String(data.projects.length)} />
        <Metric label={t.metricInboxCount} value={String(data.inbox.length)} />
        <Metric label={t.metricPinnedCount} value={String(data.projects.filter((project) => project.pinned).length)} />
        <Metric
          label={t.metricWorkspaceRoot}
          value={data.settings.workspaceRoot || t.metricRootNotSet}
          compact
          tooltip={data.settings.workspaceRoot}
        />
      </div>

      <div className="split">
        <Panel title={t.recentProjects} icon={<Clock3 size={18} />}>
          {recentProjects.length === 0 ? (
            <EmptyState title={t.emptyProjectTitle} body={t.emptyProjectBody} />
          ) : (
            <div className="project-grid">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onOpen={() => onOpenProject(project)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t.recentActivity} icon={<Sparkles size={18} />}>
          {data.activities.length === 0 ? (
            <EmptyState title={t.emptyActivityTitle} body={t.emptyActivityBody} />
          ) : (
            <div className="activity-list">
              {data.activities.slice(0, 8).map((activity) => (
                <div className="activity" key={activity.id}>
                  <span>{activity.title}</span>
                  <time>{activity.createdAt}</time>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
