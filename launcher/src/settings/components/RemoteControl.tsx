import { useCallback, useContext, useLayoutEffect, useRef } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import type { JSX } from 'preact';
import { focusControl } from '../../shared/navigation/focusControl';
import { FocusedControlContext } from '../context';
import { useSettingsEnvironment } from '../hooks/useSettingsEnvironment';

interface Props extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'ref'> {
  focusKey: string;
  class?: string;
}

// Focus is rendered from state. Refs supply nodes for measurement and browser focus.
export const RemoteControl = ({ focusKey, class: className = '', onClick, onFocusCapture, ...props }: Props) => {
  const { navigation } = useSettingsEnvironment();
  const focused = useContext(FocusedControlContext) === focusKey;
  const ref = useRef<HTMLDivElement>(null);
  const register = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    navigation.register(focusKey, node);
  }, [navigation, focusKey]);
  useLayoutEffect(() => {
    if (focused) { focusControl(ref.current); }
  }, [focused]);
  const select = () => flushSync(() => navigation.select(focusKey));
  return <div {...props} ref={register} data-key={focusKey} tabIndex={focused ? 0 : -1}
    onClick={event => { select(); onClick?.(event); }}
    onFocusCapture={event => { select(); onFocusCapture?.(event); }}
    class={className + (focused ? ' focused' : '')} />;
};
