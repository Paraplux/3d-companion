import bambuLogo from "@/assets/ecosystems/bambu.svg";
import { ECOSYSTEM_LABEL, type Ecosystem } from "@/types/filePresentation";

type EcosystemIconProps = {
  ecosystem: Ecosystem;
  className?: string;
};

const ECOSYSTEM_ICON: Record<Ecosystem, string> = {
  bambu: bambuLogo,
};

export function EcosystemIcon({ ecosystem, className }: EcosystemIconProps) {
  const label = ECOSYSTEM_LABEL[ecosystem];
  const src = ECOSYSTEM_ICON[ecosystem];
  const classes = ["ecosystem-icon", `ecosystem-icon--${ecosystem}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={label}>
      <img src={src} alt="" aria-hidden="true" draggable={false} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
