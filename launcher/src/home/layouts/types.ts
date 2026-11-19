import type { ComponentType, VNode } from "preact";

import type { ContinueItem } from "../../contracts/launcher";
import type { HomeLayoutDefinition, HomeSection } from "../../shared/homeLayout";
import type { HomeEnvironment } from "../types";

export interface HomeLayoutSectionsProps {
  readonly appsAvailable: boolean;
  readonly definition: HomeLayoutDefinition;
  readonly sections: Readonly<Record<HomeSection, VNode>>;
  readonly visible: boolean;
}

interface ProgrammeFeatureProps {
  readonly env: HomeEnvironment;
  readonly items: readonly ContinueItem[];
  onBackdropVisibilityChange(visible: boolean): void;
}

export interface HomeLayoutView {
  readonly ProgrammeFeature?: ComponentType<ProgrammeFeatureProps>;
  readonly rootClass?: string;
  readonly Sections: ComponentType<HomeLayoutSectionsProps>;
  readonly showProgrammeDetails: boolean;
}
