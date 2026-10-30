import { useLayoutEffect } from 'preact/hooks';
import { useStore } from '../shared/hooks/useStore';
import { FlameIcon } from '../shared/icons/FlameIcon';
import { HeaderPlate } from './components/HeaderPlate';
import { HomeControl } from './components/HomeControl';
import type { HomeEnvironment } from './types';
import { AppCard } from './components/AppCard';
import { ContinueCard } from './components/ContinueCard';
import { MoveArrows } from './components/MoveArrows';
import { TileMenu } from './components/TileMenu';
export const Home = ({ env }: { env: HomeEnvironment }) => {
  const settings = useStore(env.settings), { page, active, draft, moving } = useStore(env.state);
  const { apps, inputs, items, ready } = useStore(env.inventory);
  const home = draft || (settings.home.length || env.runtime.settings.home !== null ? settings.home : [env.runtime.config.FIREPLACE_ID]);
  const visibleHome = home.filter(id => id === env.runtime.config.FIREPLACE_ID || !ready || apps.some(app => app.id === id));
  const size = settings.cardSize === 'small' ? 'small' : 'big';
  useLayoutEffect(() => { env.bridge.focus(); }, [env, page, apps, inputs, items, settings.home, draft, size]);
  useLayoutEffect(() => {
    const list = document.getElementById('continue-items');
    if (list) {
      const offset = Math.max(0, Math.min(Number(list.dataset.offset || 0), list.scrollWidth - list.clientWidth));
      list.dataset.offset = String(offset);
      list.style.transform = 'translate3d(' + (-offset) + 'px,0,0)';
    }
  }, [items]);
  const cards = (ids: readonly string[], shown: boolean) => ids.map(id => {
    if (id === env.runtime.config.FIREPLACE_ID) {return <HomeControl key={id} env={env} controlKey={'app:' + id} dataId={id} registered={shown} className={'tile fire' + (moving === id ? ' moving' : '')} title={env.translate('Fireplace')}><FlameIcon />{moving === id ? <MoveArrows env={env} id={id} /> : null}</HomeControl>;}
    const app = apps.find(app => app.id === id) || { id, name: id, icon: '' };
    return <AppCard key={id} env={env} app={app} active={active && shown} />;
  });
  return <>
    <header class="topbar" aria-hidden={!active}><div class="topbar-left"><HeaderPlate env={env} />
      <HomeControl env={env} id="gear" controlKey="gear" className="icon-btn" preserveSelection title={env.translate('Settings')}>
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" /></svg>
      </HomeControl>
      {/* Existing status services own only the contents of these stable hosts. */}
      <HomeControl env={env} id="samsung-home-shortcut" controlKey="samsung-home-shortcut" className="icon-btn samsung-home-shortcut" title={env.translate('Use Samsung Home instead')}><svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 11 12 3l9 8v10h-6v-7H9v7H3Z" /></svg></HomeControl>
      <svg id="network" class="status-icon" viewBox="0 0 24 24" aria-label="Network" />
    </div><nav class="view-tabs" aria-label="App views"><HeaderPlate env={env} tabs />
      <HomeControl env={env} id="home-tab" controlKey="home-tab" className={'view-tab' + (page === 'home' ? ' active' : '')} title={env.translate('Home')} pressed={page === 'home'}>{env.translate('Home')}</HomeControl>
      <HomeControl env={env} id="apps-tab" controlKey="apps-tab" className={'view-tab' + (page === 'apps' ? ' active' : '')} title={env.translate('All apps')} pressed={page === 'apps'}>{env.translate('All apps')}</HomeControl>
    </nav><div class="topbar-right"><div id="custom-clock-root" /><span id="weather" class="weather" hidden /><span id="date" class="date" /><span id="time" class="time" /></div></header>
    <div class="content-viewport" aria-hidden={!active}><div class="content-mask"><main id="rows" ref={env.rows}><div class="home-page-surface" data-page={page}>
      <div style={{ display: page === 'home' ? undefined : 'none' }} hidden={page !== 'home'} id={page === 'home' ? 'grid' : 'home-grid-parked'} class={'app-grid cards-' + size} aria-label="Home apps">{cards(visibleHome, page === 'home')}</div>
      <div style={{ display: page === 'apps' ? undefined : 'none' }} hidden={page !== 'apps'} id={page === 'apps' ? 'grid' : 'apps-grid-parked'} class={'app-grid cards-' + size} aria-label="All apps">{cards(apps.map(app => app.id), page === 'apps')}</div>
      <p id="apps-empty" class="apps-empty" hidden={page === 'home' || apps.length > 0}>{env.translate('No apps found.')}</p>
      <section id="continue-section" class="row-wrap" hidden={page !== 'home' || !settings.continueWatching || !items.length}><h2>{env.translate('Continue Watching')}</h2>
        <div class="continue-viewport"><div id="continue-items" class="row" aria-label="Continue Watching">{items.map(item => <ContinueCard key={item.key} env={env} item={item} />)}</div></div></section>
      <section id="inputs-section" class="row-wrap inputs-wrap" hidden={page !== 'home' || !inputs.length}><h2>{env.translate('Inputs')}</h2><div id="inputs" class="row small">
        {inputs.map(source => {
          const label = env.runtime.inputs.label(source), port = env.runtime.inputs.portName(source);
          const kind = source.type === 'TV' ? 'tv' : /xbox|playstation|ps\d|switch|nintendo|game|console/i.test(label) ? 'game' : /pc|computer|mac|laptop/i.test(label) ? 'pc' : /cable|box|roku|fire|apple|shield|chromecast|blu|dvd|satellite/i.test(label) ? 'box' : 'hdmi';
          return <HomeControl key={port} env={env} controlKey={'input:' + source.type + ':' + source.number} className={'tile' + (source.connected === false && !source.active && !env.runtime.inputs.hasRecognizedDevice?.(source) && !env.runtime.inputs.alwaysVisible?.(source) ? ' off' : '')} title={label}>
            <span dangerouslySetInnerHTML={{ __html: (env.runtime.tiles as unknown as { ICONS: Record<string, string> }).ICONS[kind] }} />
            <div class="name">{label}{label !== port && source.type !== 'TV' ? <div class="sub">{port}</div> : null}</div>
          </HomeControl>;
        })}
      </div></section>
    </div></main></div></div><TileMenu env={env} />
  </>;
};
