import type { Project } from "@/types/library";

type ProjectPillProps = {
  project: Project;
  onRemove?: () => void;
  onClick?: () => void;
  title?: string;
};

export function ProjectPill({
  project,
  onRemove,
  onClick,
  title,
}: ProjectPillProps) {
  const label = title ?? project.name;

  if (onRemove) {
    return (
      <span className="project-pill project-pill--editable" title={label}>
        <span className="project-pill__label">{project.name}</span>
        <button
          type="button"
          className="project-pill__remove"
          aria-label={`Remove from project ${project.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </span>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className="project-pill project-pill--button"
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
      >
        {project.name}
      </button>
    );
  }

  return (
    <span className="project-pill" title={label}>
      {project.name}
    </span>
  );
}
