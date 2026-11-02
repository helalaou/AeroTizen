import type { LucideIcon, LucideProps } from "lucide-preact";

export const ICON_DEFAULTS = { size: 24, strokeWidth: 2, color: "currentColor" } as const;
interface Props extends Omit<
  LucideProps,
  "aria-hidden" | "aria-label" | "children" | "role" | "focusable" | "class" | "className"
> {
  class?: string;
  icon: LucideIcon;
  label?: string;
}

// Controls supply their own labels. Standalone status icons opt into a label.
export const Icon = ({ icon: Glyph, label, class: className = "", ...props }: Props) => (
  <Glyph
    {...ICON_DEFAULTS}
    {...props}
    class={"ui-icon " + className}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? "img" : undefined}
    focusable="false"
  />
);
