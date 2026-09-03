type PageHeaderProps = {
  title: string;
  subtitle?: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="page-header">
      <h1 className="page-header__title">{title}</h1>
      {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
    </header>
  );
}
