import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
};

export function PageHeader({ title, subtitle, leading }: PageHeaderProps) {
  return (
    <header className={leading ? "page-header page-header--with-leading" : "page-header"}>
      {leading ? <div className="page-header__leading">{leading}</div> : null}
      <div className="page-header__copy">
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}
