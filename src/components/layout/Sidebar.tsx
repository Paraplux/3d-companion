import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import appLogo from "@/assets/brand/app-icon.png";
import { useLibrary } from "@/hooks/useLibrary";

type NavItem = {
  to: string;
  label: string;
  icon: () => ReactNode;
  end?: boolean;
};

export function Sidebar() {
  const { cloudMode } = useLibrary();

  const primaryNav: NavItem[] = [
    { to: "/library", label: "Library", icon: LibraryIcon },
    ...(cloudMode
      ? [{ to: "/imports", label: "Imports", icon: ImportsIcon, end: true }]
      : []),
    { to: "/projects", label: "Projects", icon: ProjectsIcon },
    { to: "/collections", label: "Collections", icon: CollectionsIcon },
    { to: "/favorites", label: "Favorites", icon: FavoritesIcon, end: true },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__brand" data-tauri-drag-region>
        <img
          className="sidebar__logo"
          src={appLogo}
          alt=""
          width={28}
          height={28}
          draggable={false}
        />
        <span className="sidebar__title">3D Companion</span>
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        {primaryNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={
              end ??
              (to !== "/library" && to !== "/collections" && to !== "/projects")
            }
            className={({ isActive }) =>
              isActive ? "sidebar__link is-active" : "sidebar__link"
            }
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive ? "sidebar__link is-active" : "sidebar__link"
          }
        >
          <SettingsIcon />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}

function LibraryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h4v9h-4v-9ZM7.5 3.5h6v9h-6v-9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImportsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 10.5v2h10v-2M8 2.5v7M8 9.5 5.5 7M8 9.5 10.5 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5h11v8.5H2.5V4.5ZM2.5 4.5 4 2.5h3.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollectionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 3.5h4.5v4.5H3V3.5ZM8.5 3.5H13v4.5H8.5V3.5ZM3 9h4.5v4.5H3V9ZM8.5 9H13v4.5H8.5V9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FavoritesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 12.6 3.7 14.7l.9-4.7L1.2 6.7l4.8-.6L8 1.8l2 4.3 4.8.6-3.4 3.3.9 4.7L8 12.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.4 1.7h3.2l.3 1.2c.35.12.68.3.98.52l1.2-.45 1.6 1.6-.45 1.2c.22.3.4.63.52.98l1.2.3v3.2l-1.2.3c-.12.35-.3.68-.52.98l.45 1.2-1.6 1.6-1.2-.45a4.1 4.1 0 0 1-.98.52l-.3 1.2H6.4l-.3-1.2a4.1 4.1 0 0 1-.98-.52l-1.2.45-1.6-1.6.45-1.2a4.1 4.1 0 0 1-.52-.98L1.05 8.8V5.6l1.2-.3c.12-.35.3-.68.52-.98l-.45-1.2 1.6-1.6 1.2.45c.3-.22.63-.4.98-.52l.3-1.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.15" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
