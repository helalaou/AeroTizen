import { useMemo } from 'preact/hooks';
import { useStore } from '../../shared/hooks/useStore';
import { AppArtwork } from './AppArtwork';
import { MoveArrows } from './MoveArrows';
import { HomeControl } from './HomeControl';
import type { HomeEnvironment } from '../types';
import type { InstalledApp } from '../../settings/types';
export const AppCard = ({ env, app, active }: { env: HomeEnvironment; app: InstalledApp; active: boolean }) => {
  const brand = useMemo(() => env.describe(app), [env, app]);
  const state = useStore(env.state), moving = state.moving === app.id;
  return <HomeControl env={env} controlKey={'app:' + app.id} dataId={app.id} registered={active} className={'tile app-tile' + (moving ? ' moving' : '')}
    title={brand.title} style={{ background: brand.background }}>
    <AppArtwork app={app} brand={brand} active={active} />
    {moving ? <MoveArrows env={env} id={app.id} /> : null}
  </HomeControl>;
};
