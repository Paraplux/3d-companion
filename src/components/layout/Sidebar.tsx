import { NavLink } from "react-router-dom";

const primaryNav = [
  { to: "/library", label: "Library", icon: LibraryIcon },
  { to: "/projects", label: "Projects", icon: ProjectsIcon },
  { to: "/favorites", label: "Favorites", icon: FavoritesIcon },
] as const;

export function Sidebar() {
  return (
    <aside className="sidebar" data-tauri-drag-region>
      <div className="sidebar__brand" data-tauri-drag-region>
        <span className="sidebar__mark" aria-hidden="true" />
        <span className="sidebar__title">3D Library</span>
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        {primaryNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to !== "/library"}
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
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.3 3.3l1 1M11.7 11.7l1 1M12.7 3.3l-1 1M4.3 11.7l-1 1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
