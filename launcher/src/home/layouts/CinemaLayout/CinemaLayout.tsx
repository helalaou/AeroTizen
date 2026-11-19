import { CinemaFeature } from "../../components/CinemaFeature/CinemaFeature";
import type { HomeLayoutSectionsProps, HomeLayoutView } from "../types";

import styles from "./CinemaLayout.module.css";

const CinemaSections = ({ appsAvailable, definition, sections, visible }: HomeLayoutSectionsProps) => (
  <>
    <div class={styles.landing} hidden={!visible}>
      {definition.main.map((section) =>
        section === "apps" ? (
          <div key={section} class={styles.apps} hidden={!appsAvailable}>
            {sections.apps}
          </div>
        ) : (
          sections[section]
        ),
      )}
    </div>
    {definition.belowFold.map((section) => sections[section])}
  </>
);

export const cinemaLayout: HomeLayoutView = {
  ProgrammeFeature: CinemaFeature,
  Sections: CinemaSections,
  rootClass: styles.home,
  showProgrammeDetails: false,
};
