import { FILE_FORMAT_LABEL, type FileFormat } from "@/types/filePresentation";

type FileFormatBadgeProps = {
  format: FileFormat;
  className?: string;
};

export function FileFormatBadge({ format, className }: FileFormatBadgeProps) {
  const label = FILE_FORMAT_LABEL[format];
  const classes = ["format-badge", `format-badge--${format}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={`${label} file`} aria-label={`${label} file`}>
      {label}
    </span>
  );
}
