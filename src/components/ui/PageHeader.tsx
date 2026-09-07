import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function PageHeader({ title, subtitle, leading, trailing }: PageHeaderProps) {
  const withSides = Boolean(leading || trailing);

  return (
    <header className={withSides ? "page-header page-header--with-sides" : "page-header"}>
      {leading ? <div className="page-header__leading">{leading}</div> : null}
      <div className="page-header__copy">
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="page-header__trailing">{trailing}</div> : null}
    </header>
  );
}
