import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';

// The component renders the image. This hook owns retry state and its timer.
export const useImageSequence = (sources: readonly string[], active: boolean) => {
  const key = sources.join('\n');
  const [state, setState] = useState({ key, index: 0, loaded: false });
  const current = state.key === key ? state : { key, index: 0, loaded: false };
  const source = sources[current.index];
  const token = useMemo(() => ({}), [key, current.index, current.loaded, active]);
  const attempt = useRef(token);
  attempt.current = token;
  const enabled = useRef(active);
  enabled.current = active;
  const mounted = useRef(true);
  const settle = (loaded: boolean) => {
    if (!mounted.current || !enabled.current || attempt.current !== token) { return; }
    attempt.current = {};
    setState({ key, index: loaded ? current.index : current.index + 1, loaded });
  };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    if (!active || current.loaded || !source) { return; }
    const timer = window.setTimeout(() => settle(false), 2000);
    return () => window.clearTimeout(timer);
  }, [key, current.index, current.loaded, active, source]);
  return {
    src: active || current.loaded ? source : undefined,
    loaded: current.loaded,
    onLoad: () => settle(true),
    onError: () => settle(false)
  };
};
