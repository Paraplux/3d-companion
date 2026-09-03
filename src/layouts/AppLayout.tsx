import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <div className="app-content__inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
