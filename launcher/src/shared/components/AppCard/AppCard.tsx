import type { ComponentChildren, VNode } from "preact";

import type { AppPresentation } from "../../../contracts/launcher";
import { useImageSequence } from "../../hooks/useImageSequence";
import { AppArtworkContent } from "../AppArtworkContent/AppArtworkContent";
import { SelectionIndicator } from "../SelectionIndicator/SelectionIndicator";

import styles from "./AppCard.module.css";

export type AppCardVariant = "home" | "favourite" | "source";

interface ControlProps {
  artworkLoaded: boolean;
  children: ComponentChildren;
  className: string;
}

interface Props {
  active?: boolean;
  children?: ComponentChildren;
  presentation?: AppPresentation;
  renderControl(props: ControlProps): VNode;
  selected?: boolean;
  variant: AppCardVariant;
}

const NO_ARTWORK: readonly string[] = [];

// Screens supply focus and activation. The card owns its appearance and artwork lifetime.
export const AppCard = ({ active = false, children, presentation, renderControl, selected, variant }: Props) => {
  const artwork = useImageSequence(presentation?.artwork || NO_ARTWORK, active);
  return renderControl({
    artworkLoaded: artwork.loaded,
    className: styles.card + " " + (variant === "home" ? styles.home : styles.choice),
    children: (
      <>
        {presentation ? <AppArtworkContent presentation={presentation} artwork={artwork} variant={variant} /> : null}
        {children}
        {selected ? <SelectionIndicator /> : null}
      </>
    ),
  });
};
