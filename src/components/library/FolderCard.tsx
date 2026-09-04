type FolderCardProps = {
  name: string;
  detail: string;
  onOpen: () => void;
};

export function FolderCard({ name, detail, onOpen }: FolderCardProps) {
  return (
    <button type="button" className="folder-card" onClick={onOpen}>
      <span className="folder-card__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M3.5 6.5h5l1.5 1.5H18.5v9.5H3.5V6.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="folder-card__meta">
        <span className="folder-card__name">{name}</span>
        <span className="folder-card__detail">{detail}</span>
      </span>
    </button>
  );
}
