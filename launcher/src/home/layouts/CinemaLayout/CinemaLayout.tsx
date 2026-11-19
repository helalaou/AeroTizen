import { CinemaFeature } from "../../components/CinemaFeature/CinemaFeature";
import { CinemaProgrammeDetails } from "../../components/CinemaFeature/CinemaProgrammeDetails";
import type { HomeLayoutSectionsProps, HomeLayoutView } from "../types";

import styles from "./CinemaLayout.module.css";

const CinemaSections = ({ definition, env, items, sections }: HomeLayoutSectionsProps) => (
  <>
    {[...definition.main, ...definition.belowFold]
      .filter((section) => sections[section].visible)
      .map((section) => (
        <div key={section} class={styles.rail} data-home-scroll-anchor>
          {section === "continueWatching" && (
            <div class={styles.programmeDetails} aria-hidden="true">
              <CinemaProgrammeDetails env={env} items={items} />
            </div>
          )}
          {sections[section].content}
        </div>
      ))}
  </>
);

export const cinemaLayout: HomeLayoutView = {
  ProgrammeFeature: CinemaFeature,
  Sections: CinemaSections,
  rootClass: styles.home,
  showProgrammeDetails: false,
};
