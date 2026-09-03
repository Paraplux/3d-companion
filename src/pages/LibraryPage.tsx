import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function LibraryPage() {
  return (
    <section className="page">
      <PageHeader
        title="Library"
        subtitle="Your 3D models and projects"
      />
      <EmptyState
        title="Your library is empty"
        description="Import your first 3D model to get started."
        action={
          <button type="button" className="button button--primary">
            Import model
          </button>
        }
      />
    </section>
  );
}
