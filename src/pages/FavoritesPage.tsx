import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function FavoritesPage() {
  return (
    <section className="page">
      <PageHeader title="Favorites" />
      <EmptyState
        title="No favorites yet"
        description="Star models you use often and they will show up here."
      />
    </section>
  );
}
