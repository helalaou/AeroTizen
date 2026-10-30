import { useMemo } from 'preact/hooks';
import { AppArtwork } from './AppArtwork';
import { HomeControl } from './HomeControl';
import type { ContinueItem, HomeEnvironment } from '../types';
export const ContinueCard = ({ env, item }: { env: HomeEnvironment; item: ContinueItem }) => {
  const app = useMemo(() => ({ id: item.sourceId, name: item.sourceName, icon: item.sourceIcon }), [item.sourceId, item.sourceName, item.sourceIcon]);
  const brand = useMemo(() => env.describe(app), [env, app]);
  const episode = item.season > 0 && item.episode > 0 ? 'S' + item.season + ' E' + item.episode : '';
  const [imageFailed, setImageFailed] = useImageFailure(item.image);
  return <HomeControl env={env} controlKey={'continue:' + item.key} dataKey={item.key}
    className={'continue-card' + (episode ? ' episodic' : '')} title={item.title + (episode ? ' · ' + episode : '') + ' · ' + item.sourceName}>
    <div class="continue-image-wrap">
      {item.image && !imageFailed ? <img class="continue-image" alt="" src={item.image} onError={setImageFailed} /> : null}
      <div class="tile app-tile continue-app-icon" aria-hidden="true" style={{ background: brand.background }}><AppArtwork app={app} brand={brand} active /></div>
    </div>
    <div class={'continue-progress' + (item.duration > 0 && item.playback > 0 ? '' : ' empty')} aria-hidden="true">
      {item.duration > 0 && item.playback > 0 ? <div class="continue-progress-fill" style={{ width: Math.min(100, item.playback / item.duration * 100) + '%' }} /> : null}
    </div>
    <div class="continue-label"><div class="continue-details"><div class="continue-title">{item.title}</div>
      {episode ? <div class="continue-episode">{episode}</div> : null}</div></div>
  </HomeControl>;
};
// Artwork errors are local to each keyed feed item; changing its URL permits retry.
import { useState } from 'preact/hooks';
const useImageFailure = (url?: string): [boolean, () => void] => {
  const [failed, setFailed] = useState<string | undefined>();
  return [Boolean(url && failed === url), () => setFailed(url)];
};

