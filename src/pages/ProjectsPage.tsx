import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function ProjectsPage() {
  return (
    <section className="page">
      <PageHeader title="Projects" />
      <EmptyState
        title="No projects yet"
        description="Projects will appear here once you start grouping models."
      />
    </section>
  );
}
