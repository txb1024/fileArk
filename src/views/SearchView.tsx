import { Search } from "lucide-react";
import { api } from "../api";
import type { AppData, Project, InboxItem, Messages } from "../types";
import { ResultSection } from "../components";

interface SearchViewProps {
  query: string;
  setQuery: (query: string) => void;
  results: {
    projects: Project[];
    files: Array<{ name: string; path: string; category: string; projectName: string; size: number }>;
    inbox: InboxItem[];
  };
  onOpenProject: (project: Project) => void;
  t: Messages;
}

export function SearchView({ query, setQuery, results, onOpenProject, t }: SearchViewProps) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t.searchEyebrow}</p>
          <h1>{t.searchTitle}</h1>
          <p>{t.searchBody}</p>
        </div>
      </div>
      <div className="large-search">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholderLarge}
          autoFocus
        />
      </div>

      {!query.trim() ? (
        <div className="empty-state">
          <Search size={48} strokeWidth={1} />
          <h3>{t.searchStartTitle}</h3>
          <p>{t.searchStartBody}</p>
        </div>
      ) : (
        <div className="search-sections">
          <ResultSection title={t.searchProjects}>
            {results.projects.map((project) => (
              <button className="result-row" key={project.id} onClick={() => onOpenProject(project)}>
                <span>{project.name}</span>
                <small>{project.alias || project.path}</small>
              </button>
            ))}
          </ResultSection>
          <ResultSection title={t.searchRecentFiles}>
            {results.files.map((file) => (
              <button className="result-row" key={file.path} onClick={() => api.openFile(file.path)}>
                <span>{file.name}</span>
                <small>
                  {file.projectName} / {file.category}
                </small>
              </button>
            ))}
          </ResultSection>
          <ResultSection title={t.searchInbox}>
            {results.inbox.map((item) => (
              <div className="result-row static" key={item.id}>
                <span>{item.name}</span>
                <small>{item.sourcePath}</small>
              </div>
            ))}
          </ResultSection>
        </div>
      )}
    </section>
  );
}
