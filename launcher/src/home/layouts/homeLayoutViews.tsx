import type { HomeLayoutId } from "../../shared/homeLayout";

import { cinemaLayout } from "./CinemaLayout/CinemaLayout";
import type { HomeLayoutSectionsProps, HomeLayoutView } from "./types";

const FlowSections = ({ definition, sections }: HomeLayoutSectionsProps) => (
  <>{[...definition.main, ...definition.belowFold].map((section) => sections[section].content)}</>
);

const homeLayoutViews: Readonly<Record<HomeLayoutId, HomeLayoutView>> = {
  standard: { Sections: FlowSections, showProgrammeDetails: true },
  cinema: cinemaLayout,
};

export const getHomeLayoutView = (id: HomeLayoutId): HomeLayoutView => homeLayoutViews[id];
