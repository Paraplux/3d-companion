type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

type LibraryBreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function LibraryBreadcrumbs({ items }: LibraryBreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={`${item.label}-${index}`} className="breadcrumbs__item">
            {index > 0 ? (
              <span className="breadcrumbs__sep" aria-hidden="true">
                /
              </span>
            ) : null}
            {item.onClick && !isLast ? (
              <button type="button" className="breadcrumbs__link" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className="breadcrumbs__current">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
