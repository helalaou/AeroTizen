import type { ComponentType, VNode } from "preact";

import type { ContinueItem } from "../../contracts/launcher";
import type { HomeLayoutDefinition, HomeSection } from "../../shared/homeLayout";
import type { HomeEnvironment } from "../types";

interface ProgrammeProps {
  readonly env: HomeEnvironment;
  readonly items: readonly ContinueItem[];
}

export interface HomeLayoutSectionsProps extends ProgrammeProps {
  readonly definition: HomeLayoutDefinition;
  readonly sections: Readonly<Record<HomeSection, { readonly content: VNode; readonly visible: boolean }>>;
}

interface ProgrammeFeatureProps extends ProgrammeProps {
  onBackdropVisibilityChange(visible: boolean): void;
}

export interface HomeLayoutView {
  readonly ProgrammeFeature?: ComponentType<ProgrammeFeatureProps>;
  readonly rootClass?: string;
  readonly Sections: ComponentType<HomeLayoutSectionsProps>;
  readonly showProgrammeDetails: boolean;
}
