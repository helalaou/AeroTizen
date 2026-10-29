import type { ComponentChildren } from 'preact';
import { useStore } from '../../shared/hooks/useStore';
import { RemoteControl } from '../components/RemoteControl';
import { useSettingsEnvironment } from '../hooks/useSettingsEnvironment';
import { FocusPlate } from './FocusPlate';
import { categories } from './categories';
import type { Category } from './categories';

// Categories and remote behaviour are shared by both appearance themes.
export const SettingsDrawer = ({ panes }: { panes: Record<Category, ComponentChildren> }) => {
  const { glass, glassMenu, glassContent, glassScroll, bridge, services } = useSettingsEnvironment();
  const state = useStore(glass);
  const text = services.translate;
  return <div class="aero-settings-frame">
    <aside class="aero-settings-sidebar"><div class="aero-settings-head"><div class="aero-settings-kicker">AEROTIZEN</div><h2>{text('Settings')}</h2></div>
      <div class="aero-settings-menu" ref={glassMenu}><FocusPlate container={glassMenu} sidebar />
        {categories.map(category => <RemoteControl key={category.id} class={'aero-section-entry' + (state.category === category.id ? ' aero-current-section' : '')}
          focusKey={'section:' + category.id} role="button" aria-label={text(category.title)} aria-expanded={state.category === category.id && state.expanded}
          onClick={() => glass.set({ category: category.id, expanded: true })}>
          <span class="aero-section-icon" aria-hidden="true">{category.icon}</span><span class="aero-section-label"><strong>{text(category.title)}</strong><small>{text(category.hint)}</small></span><span class="aero-section-chevron" aria-hidden="true">›</span>
        </RemoteControl>)}
      </div><div class="aero-settings-help">{text('↑↓ Section   → Open   ← Back')}</div>
    </aside>
    <div class="aero-settings-main" ref={glassContent}><div class="aero-settings-content-head"><span class="aero-settings-content-kicker">{text('CUSTOMISATION')}</span><h2 class="aero-settings-active-title">{text(categories.find(category => category.id === state.category)?.title || '')}</h2>
      <RemoteControl class="aero-settings-close" focusKey="settings-close" role="button" aria-label={text('Close settings')} onClick={bridge.close}>×</RemoteControl></div>
      <div class="aero-settings-scroll" ref={glassScroll}><FocusPlate container={glassScroll} />
        {categories.map(category => <section key={category.id} class="aero-section-pane" data-section-pane={category.id} hidden={category.id !== state.category}>{panes[category.id]}</section>)}
      </div>
    </div>
  </div>;
};
