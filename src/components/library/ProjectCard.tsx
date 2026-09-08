import { Link } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  formatProjectCount,
  projectPreviewThumbnails,
} from "@/lib/projects";
import type { LibraryFile, Project } from "@/types/library";

type ProjectCardProps = {
  project: Project;
  filesById: Map<string, LibraryFile>;
};

export function ProjectCard({ project, filesById }: ProjectCardProps) {
  const previews = projectPreviewThumbnails(project, filesById, 4);
  const countLabel = formatProjectCount(project.fileCount);

  return (
    <Link
      to={`/projects/${project.id}`}
      className="project-card"
      title={project.name}
    >
      <div className="project-card__preview" aria-hidden="true">
        {previews.length === 0 ? (
          <div className="project-card__empty-preview">
            <span>Empty</span>
          </div>
        ) : (
          <div
            className={`project-card__mosaic project-card__mosaic--${Math.min(
              previews.length,
              4,
            )}`}
          >
            {previews.map((preview) =>
              preview.thumbnailPath ? (
                <img
                  key={preview.libraryFileId}
                  className="project-card__thumb"
                  src={convertFileSrc(preview.thumbnailPath)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div
                  key={preview.libraryFileId}
                  className="project-card__thumb project-card__thumb--placeholder"
                />
              ),
            )}
          </div>
        )}
      </div>

      <div className="project-card__meta">
        <h3 className="project-card__name">{project.name}</h3>
        {project.description ? (
          <p className="project-card__description">{project.description}</p>
        ) : null}
        <p className="project-card__count">{countLabel}</p>
      </div>
    </Link>
  );
}
