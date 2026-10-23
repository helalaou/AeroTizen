import { h, Fragment } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

// Keep the existing artwork loader alive. Copying innerHTML loses its asynchronous
// image callbacks. This bridge also gives Home and Settings the same fallback art.
function AppTile({ app, selected, actions, tiles, fireplaceId }) {
  const host = useRef(null);
  const tile = useRef(null);

  useLayoutEffect(() => {
    const node = app.id === fireplaceId ? tiles.card(app.name, tiles.ICONS.flame) : tiles.app(app);
    if (app.id === fireplaceId) {
      node.classList.add('fire');
    }
    node.dataset.key = 'app:' + app.id;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', app.name);
    node.onclick = () => actions.toggleApp(app.id);
    host.current.appendChild(node);
    tile.current = node;
    return () => {
      node.onclick = null;
      node.remove();
    };
  }, [app.id, app.name, app.icon, app.storeId, actions, tiles, fireplaceId]);

  useLayoutEffect(() => {
    tile.current.classList.toggle('on', selected);
    tile.current.setAttribute('aria-pressed', String(selected));
  });

  return <div ref={host} />;
}

export function AppMenu({ home, apps, actions, tiles, fireplaceId }) {
  return (
    <>
      <h3>Show in app menu</h3>
      <p class="hint">Press OK to show or hide a tile on the home screen. On the home screen, hold OK on a tile to move it.</p>
      <div id="all-apps" class="grid">
        <div class="tile addapps" data-key="add" role="button" onClick={actions.openStore}>
          <span dangerouslySetInnerHTML={{ __html: tiles.ICONS.plus }} />
          <div class="name">Add apps<div class="sub">Samsung app store</div></div>
        </div>
        {[{ id: fireplaceId, name: 'Fireplace' }].concat(apps).map(app => (
          <AppTile key={app.id} app={app} selected={home.indexOf(app.id) >= 0}
            actions={actions} tiles={tiles} fireplaceId={fireplaceId} />
        ))}
      </div>
    </>
  );
}
