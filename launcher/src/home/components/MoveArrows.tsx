import type { HomeEnvironment } from '../types';
import { useStore } from '../../shared/hooks/useStore';
const paths = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };
export const MoveArrows = ({ env, id }: { env: HomeEnvironment; id: string }) => {
  const { draft } = useStore(env.state), settings = useStore(env.settings);
  const ids = draft || settings.home, index = ids.indexOf(id), columns = env.columns(settings);
  const allowed = { left: index > 0, right: index < ids.length - 1, up: index >= columns, down: index + columns < ids.length };
  return <>{(Object.keys(paths) as (keyof typeof paths)[]).filter(direction => allowed[direction]).map(direction =>
    <div key={direction} class={'move-arrow ' + direction} aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d={paths[direction]} /></svg></div>)}</>;
};
