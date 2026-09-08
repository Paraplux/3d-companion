/**
 * Label + href helpers for returning from Model Detail without losing context.
 */

export function returnLabelFromPath(returnTo: string): string {
  const path = returnTo.split("?")[0] ?? returnTo;
  if (path.startsWith("/favorites")) {
    return "Favorites";
  }
  if (/^\/collections\/[^/]+/.test(path)) {
    return "Collection";
  }
  if (path.startsWith("/collections")) {
    return "Collections";
  }
  if (/^\/projects\/[^/]+/.test(path)) {
    return "Project";
  }
  if (path.startsWith("/projects")) {
    return "Projects";
  }
  return "Library";
}

export function returnActionLabel(returnTo: string): string {
  const label = returnLabelFromPath(returnTo);
  return label === "Library" ? "Back to Library" : `Back to ${label}`;
}
