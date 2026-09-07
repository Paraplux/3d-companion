import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { LibraryPage } from "@/pages/LibraryPage";

const ModelDetailPage = lazy(async () => {
  const module = await import("@/pages/ModelDetailPage");
  return { default: module.ModelDetailPage };
});

const ProjectsPage = lazy(async () => {
  const module = await import("@/pages/ProjectsPage");
  return { default: module.ProjectsPage };
});

const CollectionsPage = lazy(async () => {
  const module = await import("@/pages/CollectionsPage");
  return { default: module.CollectionsPage };
});

const CollectionDetailPage = lazy(async () => {
  const module = await import("@/pages/CollectionDetailPage");
  return { default: module.CollectionDetailPage };
});

const FavoritesPage = lazy(async () => {
  const module = await import("@/pages/FavoritesPage");
  return { default: module.FavoritesPage };
});

const SettingsPage = lazy(async () => {
  const module = await import("@/pages/SettingsPage");
  return { default: module.SettingsPage };
});

function PageFallback() {
  return (
    <section className="page">
      <p className="page-loading">Loading…</p>
    </section>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/file/:fileId" element={<ModelDetailPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="collections/:collectionId" element={<CollectionDetailPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
