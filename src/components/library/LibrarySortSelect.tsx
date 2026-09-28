import type { SortDirection, SortField } from "@/types/library";

export type LibrarySortValue = `${SortField}:${SortDirection}`;

const SORT_OPTIONS: Array<{ value: LibrarySortValue; label: string }> = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "addedAt:desc", label: "Newest added" },
  { value: "addedAt:asc", label: "Oldest added" },
  { value: "modifiedAt:desc", label: "Newest modified" },
  { value: "modifiedAt:asc", label: "Oldest modified" },
  { value: "size:desc", label: "Largest" },
  { value: "size:asc", label: "Smallest" },
  { value: "type:asc", label: "Type A–Z" },
  { value: "type:desc", label: "Type Z–A" },
];

type LibrarySortSelectProps = {
  field: SortField;
  direction: SortDirection;
  onChange: (field: SortField, direction: SortDirection) => void;
};

export function toLibrarySortValue(
  field: SortField,
  direction: SortDirection,
): LibrarySortValue {
  return `${field}:${direction}`;
}

export function parseLibrarySortValue(value: string): {
  field: SortField;
  direction: SortDirection;
} | null {
  const [field, direction] = value.split(":");
  if (
    (field === "name" ||
      field === "addedAt" ||
      field === "modifiedAt" ||
      field === "size" ||
      field === "type") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { field, direction };
  }
  return null;
}

/** Single control for library sort field + direction. */
export function LibrarySortSelect({
  field,
  direction,
  onChange,
}: LibrarySortSelectProps) {
  const value = toLibrarySortValue(field, direction);

  return (
    <label className="library-sort">
      <span className="library-sort__label">Sort</span>
      <select
        value={value}
        onChange={(event) => {
          const parsed = parseLibrarySortValue(event.target.value);
          if (parsed) {
            onChange(parsed.field, parsed.direction);
          }
        }}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
