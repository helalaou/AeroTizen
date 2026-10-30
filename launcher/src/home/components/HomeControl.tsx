import type { ComponentChildren } from 'preact';
import { useCallback, useRef } from 'preact/hooks';
import { useStore } from '../../shared/hooks/useStore';
import type { HomeEnvironment } from '../types';

export const HomeControl = ({ env, controlKey, children, className = '', id, title, dataId, dataKey, onActivate, style, pressed, registered = true, preserveSelection = false }: {
  env: HomeEnvironment; controlKey: string; children: ComponentChildren; className?: string; id?: string;
  title: string; dataId?: string; dataKey?: string; onActivate?(): void; style?: Record<string, string>; pressed?: boolean; registered?: boolean; preserveSelection?: boolean;
}) => {
  const state = useStore(env.state), focused = registered && state.active && state.selected === controlKey;
  const own = useRef<HTMLDivElement | null>(null);
  const register = useCallback((node: HTMLDivElement | null) => {
    if (own.current && env.nodes.get(controlKey) === own.current) {env.nodes.delete(controlKey);}
    own.current = node;
    if (node && registered) {env.nodes.set(controlKey, node);}
  }, [env, controlKey, registered]);
  return <div ref={register} id={id} class={className + (focused ? ' focused' : '')}
    role="button" aria-label={title} title={title} tabIndex={focused ? 0 : -1}
    data-id={dataId} data-key={dataKey} aria-pressed={pressed} style={style}
    onClick={() => { if (!preserveSelection) { env.select(controlKey); } if (onActivate) {onActivate();} else {env.activate(controlKey);} }}>
    {children}
  </div>;
};
