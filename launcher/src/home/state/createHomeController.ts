import { focusControl } from '../../shared/navigation/focusControl';
import { createStore } from '../../shared/state/createStore';
import type { HomeEnvironment, HomeState, Page } from '../types';

// Remote transactions publish state synchronously; Preact owns every rendered node.
// No app/service commands are reimplemented here.
export const createHomeController = (env: Omit<HomeEnvironment, 'bridge' | 'state' | 'select' | 'activate' | 'showPage' | 'choose' | 'dismiss' | 'menuChoices'>,
  transaction: (action: () => void) => void) => {
  const { runtime: A, settings, inventory, nodes } = env;
  const state = createStore<HomeState>({ page: 'home', selected: '', active: true, moving: null, draft: null, menu: null });
  let timer: number | undefined, enterDown = false, scroll = 0, started = false;
  const cancelPress = () => {
    if (timer !== undefined) { window.clearTimeout(timer); }
    timer = undefined; enterDown = false;
  };
  const update = (patch: Partial<HomeState>) => transaction(() => {
    const before = state.getSnapshot();
    if (Object.keys(patch).some(key => before[key as keyof HomeState] !== patch[key as keyof HomeState])) { state.set({ ...before, ...patch }); }
  });
  const homeIds = () => {
    const saved = state.getSnapshot().draft || (settings.getSnapshot().home.length || A.settings.home !== null ? settings.getSnapshot().home : [A.config.FIREPLACE_ID]);
    // Movement must address the same visible IDs as the grid, not stale saved apps.
    return saved.filter(id => id === A.config.FIREPLACE_ID || !inventory.getSnapshot().ready || A.apps.byId(id));
  };
  const ids = () => state.getSnapshot().page === 'home' ? homeIds().filter(id => id === A.config.FIREPLACE_ID || !inventory.getSnapshot().ready || A.apps.byId(id)) : inventory.getSnapshot().apps.map(app => app.id);
  const sourceKey = (source: { type: string; number?: number }) => 'input:' + source.type + ':' + source.number;
  const rows = (): string[][] => {
    const columns = env.columns(settings.getSnapshot()), all = ids(), result = [['gear', 'samsung-home-shortcut', 'home-tab', 'apps-tab']];
    for (let i = 0; i < all.length; i += columns) {result.push(all.slice(i, i + columns).map(id => 'app:' + id));}
    if (state.getSnapshot().page === 'home') {
      if (settings.getSnapshot().continueWatching && inventory.getSnapshot().items.length) {result.push(inventory.getSnapshot().items.map(item => 'continue:' + item.key));}
      const sources = inventory.getSnapshot().inputs;
      if (sources.length) {result.push(sources.map(sourceKey));}
    }
    return result;
  };
  const focus = () => {
    if (document.hidden || A.settingsUi?.isOpen()) { update({ active: false }); return; }
    const pending = state.getSnapshot();
    if (pending.moving && !ids().includes(pending.moving)) {
      update({ moving: null, draft: null }); A.hideToast(); cancelPress();
    }
    if (pending.menu && !ids().includes(pending.menu.id)) { update({ menu: null }); cancelPress(); }
    const list = rows(), old = state.getSnapshot().selected;
    const selected = !started && list[1]?.[0] ? list[1][0] : list.some(row => row.includes(old)) ? old : list[1]?.[0] || 'home-tab';
    if (list[1]?.length) { started = true; }
    if (old !== selected) { cancelPress(); }
    update({ selected, active: true });
    const node = nodes.get(selected), main = env.rows.current;
    if (!node || !main || A.settingsUi?.isOpen()) {return;}
    focusControl(node);
    const listNode = node.parentElement;
    if (selected.startsWith('continue:') && listNode) {
      const viewport = listNode.parentElement;
      if (viewport) {
        const previous = Number(listNode.dataset.offset || 0);
        const offset = Math.max(0, Math.min(Math.max(previous, node.offsetLeft + node.offsetWidth - listNode.clientWidth), node.offsetLeft));
        listNode.dataset.offset = String(offset);
        listNode.style.transform = 'translate3d(' + (-offset) + 'px,0,0)';
      }
    }
    const rect = node.getBoundingClientRect(), top = main.getBoundingClientRect().top;
    const origin = main.parentElement?.getBoundingClientRect().top || 0;
    const y = rect.top - top + origin, bottom = rect.bottom - top + origin;
    if (list[0].includes(selected) || list[1]?.includes(selected)) {scroll = 0;}
    else if (bottom - scroll > 1000) {scroll = bottom - 1000;}
    else if (y - scroll < origin + 128) {scroll = Math.max(0, y - origin - 128);}
    main.closest('.content-viewport')?.classList.toggle('is-scrolled', scroll > 0);
    main.style.transform = 'translate3d(0,' + (-scroll) + 'px,0)';
  };
  const select = (selected: string) => {
    if (state.getSnapshot().selected !== selected) { cancelPress(); }
    update({ selected }); focus();
  };
  const endMove = () => {
    const draft = state.getSnapshot().draft;
    if (draft) { settings.update({ home: [...homeIds()] }); }
    update({ moving: null, draft: null }); A.hideToast();
  };
  const dismiss = () => { update({ menu: null }); focus(); };
  const showPage = (page: Page) => {
    cancelPress();
    endMove(); scroll = 0;
    update({ page, menu: null, selected: page === 'home' ? 'home-tab' : 'apps-tab' }); focus();
  };
  const activate = (key: string) => {
    if (key === 'gear') { endMove(); A.settingsUi.open(); }
    else if (key === 'samsung-home-shortcut') { if (A.homewatch.openSamsungHome) { A.homewatch.openSamsungHome(); } else { A.homewatch.useSamsungHome(); } }
    else if (key === 'home-tab' || key === 'apps-tab') {showPage(key === 'home-tab' ? 'home' : 'apps');}
    else if (key.startsWith('app:')) {
      const id = key.slice(4), app = A.apps.byId(id);
      if (id === A.config.FIREPLACE_ID) {A.apps.playFireplace();}
      else if (app) {A.apps.launch(app);}
    } else if (key.startsWith('continue:')) {
      const item = inventory.getSnapshot().items.find(item => item.key === key.slice(9));
      if (item) {A.continueWatching.open(item);}
    } else {
      const source = inventory.getSnapshot().inputs.find(source => sourceKey(source) === key);
      if (source) {A.inputs.show(source);}
    }
  };
  const menuChoices = () => state.getSnapshot().page === 'home' ? [{ action: 'move', label: 'Move' }, { action: 'remove', label: 'Remove from Home' }] :
    [{ action: homeIds().includes(state.getSnapshot().menu?.id || '') ? 'remove' : 'add', label: homeIds().includes(state.getSnapshot().menu?.id || '') ? 'Remove from Home' : 'Add to Home' }];
  const choose = (index: number) => {
    const menu = state.getSnapshot().menu, choice = menuChoices()[index];
    if (!menu || !choice) {return;}
    update({ menu: null });
    if (choice.action === 'move') { update({ moving: menu.id, draft: [...homeIds()] }); A.toast(env.translate('Use the arrows to move it, OK to drop')); return; }
    const before = ids(), at = before.indexOf(menu.id), home = [...homeIds()];
    settings.update({ home: choice.action === 'add' ? [...home, menu.id] : home.filter(id => id !== menu.id) });
    if (state.getSnapshot().page === 'home') {
      const after = ids();
      update({ selected: after.length ? 'app:' + after[Math.min(Math.max(at, 0), after.length - 1)] :
        inventory.getSnapshot().inputs.length ? sourceKey(inventory.getSnapshot().inputs[0]) : 'home-tab' });
    }
    focus();
  };
  const K = A.config.KEY;
  const keydown = (code: number, event: Pick<KeyboardEvent, 'preventDefault'>) => transaction(() => {
    const current = state.getSnapshot();
    const delta = code === K.LEFT || code === K.UP ? -1 : 1;
    if (![K.LEFT, K.RIGHT, K.UP, K.DOWN, K.BACK, K.ESC, K.ENTER].includes(code)) {return;}
    event.preventDefault();
    if (current.menu) {
      if (code === K.BACK || code === K.ESC) {dismiss();}
      else if (code === K.ENTER) { if (!enterDown) { enterDown = true; choose(current.menu.selected); } }
      else {update({ menu: { ...current.menu, selected: Math.max(0, Math.min(menuChoices().length - 1, current.menu.selected + delta)) } });}
      return;
    }
    if (current.moving) {
      if (code === K.ENTER || code === K.BACK || code === K.ESC) { if (code !== K.ENTER || !enterDown) { enterDown = code === K.ENTER; endMove(); } return; }
      const home = [...homeIds()], from = home.indexOf(current.moving), step = code === K.UP || code === K.DOWN ? env.columns(settings.getSnapshot()) : 1;
      const to = Math.max(0, Math.min(home.length - 1, from + delta * step));
      home.splice(from, 1); home.splice(to, 0, current.moving); update({ draft: home }); focus(); return;
    }
    if (code === K.ENTER) {
      if (enterDown) {return;}
      enterDown = true;
      const selected = current.selected;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (enterDown && selected.startsWith('app:')) {update({ menu: { id: selected.slice(4), selected: 0 } });}
      }, A.config.LONG_PRESS_MS);
      return;
    }
    if (code === K.BACK || code === K.ESC) { if (current.page !== 'home') {showPage('home');} return; }
    const all = rows(); let row = all.findIndex(items => items.includes(current.selected));
    if (row < 0) { focus(); return; }
    let column = all[row].indexOf(current.selected);
    if (code === K.LEFT || code === K.RIGHT) {column += delta;}
    else {
      const target = row + delta;
      if (target < 0 || target >= all.length) {return;}
      if (row === 0) { column = 0; }
      if (target === 0) { column = all[0].indexOf(current.page === 'home' ? 'home-tab' : 'apps-tab'); }
      else if (current.selected.startsWith('continue:') || all[target][0]?.startsWith('continue:')) {
        const from = nodes.get(current.selected)?.getBoundingClientRect();
        if (from) {
          let distance = Infinity;
          const viewport = document.getElementById('continue-items')?.parentElement?.getBoundingClientRect();
          all[target].forEach((key, i) => {
            const rect = nodes.get(key)?.getBoundingClientRect();
            if (!rect || key.startsWith('continue:') && viewport && (rect.right <= viewport.left || rect.left >= viewport.right)) {return;}
            const d = Math.abs(rect.left + rect.right - from.left - from.right);
            if (d < distance) { distance = d; column = i; }
          });
        }
      }
      row = target;
    }
    select(all[row][Math.max(0, Math.min(all[row].length - 1, column))]);
  });
  const keyup = (code: number) => {
    if (code !== K.ENTER) {return;}
    enterDown = false;
    if (timer === undefined) {return;}
    window.clearTimeout(timer); timer = undefined;
    if (!state.getSnapshot().menu && !state.getSnapshot().moving) {activate(state.getSnapshot().selected);}
  };
  const bridge = { render: focus, buildRows: focus, refreshApps: focus, focus,
    blur() { cancelPress(); update({ active: false, menu: null }); }, keydown, keyup };
  return { ...env, state, bridge, select, activate, showPage, choose, dismiss, menuChoices };
};
