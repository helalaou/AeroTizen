import type { ContinueItem } from "../../../contracts/launcher";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import type { HomeEnvironment } from "../../types";

export interface ProgrammeProps {
  env: HomeEnvironment;
  items: readonly ContinueItem[];
}

export const useSelectedProgramme = ({ env, items }: ProgrammeProps) => {
  const selected = useStoreSelector(env.state, (state) => (state.active ? state.selected : ""));
  return items.find((item) => "continue:" + item.key === selected);
};
