import type { AppPresentation } from "../../../contracts/launcher";
import { AppArtworkContent } from "../../../shared/components/AppArtworkContent/AppArtworkContent";
import type { AppFallbackVariant } from "../../../shared/components/AppFallback/AppFallback";
import { useImageSequence } from "../../../shared/hooks/useImageSequence";

export const AppArtwork = ({
  presentation,
  active,
  variant = "home",
}: {
  presentation: AppPresentation;
  active: boolean;
  variant?: AppFallbackVariant;
}) => {
  const artwork = useImageSequence(presentation.artwork, active);
  return <AppArtworkContent presentation={presentation} artwork={artwork} variant={variant} />;
};
