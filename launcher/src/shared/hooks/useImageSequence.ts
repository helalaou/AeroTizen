import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';

interface Attempt { token: object; settle(loaded: boolean): void }
const IMAGE_TIMEOUT_MS = 2000;

// The effect owns one pending attempt. Cleanup invalidates callbacks and clears
// its deadline; the component renders the candidate and fallback from state.
export const useImageSequence = (sources: readonly string[], active: boolean) => {
  const key = JSON.stringify(sources);
  const [state, setState] = useState({ key, index: 0, loaded: false });
  const current = state.key === key ? state : { key, index: 0, loaded: false };
  const source = sources[current.index];
  const token = useMemo(() => ({ key, index: current.index, loaded: current.loaded, active }), [key, current.index, current.loaded, active]);
  const attempt = useRef<Attempt | null>(null);
  useLayoutEffect(() => {
    if (!active) {
      // Retry failed sequences from the start next time; keep loaded images cached.
      if (!current.loaded && current.index !== 0) { setState({ key, index: 0, loaded: false }); }
      return;
    }
    if (current.loaded || !source) { return; }
    let live = true;
    const settle = (loaded: boolean) => {
      if (!live) { return; }
      live = false;
      window.clearTimeout(timer);
      setState({ key, index: loaded ? current.index : current.index + 1, loaded });
    };
    const timer = window.setTimeout(() => settle(false), IMAGE_TIMEOUT_MS);
    attempt.current = { token, settle };
    return () => { live = false; window.clearTimeout(timer); attempt.current = null; };
  }, [key, current.index, current.loaded, active, source, token]);
  const settle = (loaded: boolean) => {
    if (attempt.current?.token === token) { attempt.current.settle(loaded); }
  };
  return {
    src: active || current.loaded ? source : undefined,
    loaded: current.loaded,
    onLoad: () => settle(true),
    onError: () => settle(false)
  };
};
