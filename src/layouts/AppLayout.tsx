import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { WindowDragRegion } from "@/components/layout/WindowDragRegion";
import { BackgroundTaskIndicator } from "@/components/ui/BackgroundTaskIndicator";

export function AppLayout() {
  return (
    <div className="app-shell">
      <WindowDragRegion />
      <Sidebar />
      <main className="app-content">
        <div className="app-content__inner">
          <Outlet />
        </div>
      </main>
      <BackgroundTaskIndicator />
    </div>
  );
}
