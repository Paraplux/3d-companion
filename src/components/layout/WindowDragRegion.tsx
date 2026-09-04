/**
 * Invisible strip under the macOS overlay traffic lights.
 * `data-tauri-drag-region` enables window move + double-click zoom/maximize.
 */
export function WindowDragRegion() {
  return (
    <div
      className="window-drag-region"
      data-tauri-drag-region
      aria-hidden="true"
    />
  );
}
