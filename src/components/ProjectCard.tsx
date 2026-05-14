import { Star } from "lucide-react";
import type { Project } from "../types";
import { formatDate } from "../utils";

interface ProjectCardProps {
  project: Project;
  onOpen: () => void;
}

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  return (
    <button className="project-card" onClick={onOpen}>
      <div>
        <strong>{project.name}</strong>
        <span>{project.alias}</span>
      </div>
      <div className="tag-row">
        {project.tags.slice(0, 3).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <small>最近：{formatDate(project.lastOpenedAt || project.updatedAt)}</small>
    </button>
  );
}
