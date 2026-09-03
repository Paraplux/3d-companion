import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__glyph" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M14 3.5 23.5 9v10L14 24.5 4.5 19V9L14 3.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M14 14.5V24.5M14 14.5 23.5 9M14 14.5 4.5 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="empty-state__title">{title}</h2>
      {description ? (
        <p className="empty-state__description">{description}</p>
      ) : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
