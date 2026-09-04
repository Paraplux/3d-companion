type FileTypeBadgeProps = {
  extension: string;
};

export function FileTypeBadge({ extension }: FileTypeBadgeProps) {
  const label = extension.toUpperCase();

  return (
    <div className={`file-badge file-badge--${extension.toLowerCase()}`}>
      <span className="file-badge__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M6 3.5h7l4 4V18.5H6V3.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M13 3.5V8h4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="file-badge__label">{label}</span>
    </div>
  );
}
