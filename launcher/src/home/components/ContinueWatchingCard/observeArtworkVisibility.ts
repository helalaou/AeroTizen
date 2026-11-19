const listeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

export const observeArtworkVisibility = (element: Element, show: (visible: boolean) => void): (() => void) => {
  if (typeof IntersectionObserver !== "function") {
    show(true);
    return () => {};
  }
  observer ??= new IntersectionObserver((entries) => {
    entries.forEach((entry) => listeners.get(entry.target)?.(entry.isIntersecting));
  });
  listeners.set(element, show);
  observer.observe(element);
  return () => {
    listeners.delete(element);
    observer?.unobserve(element);
    if (!listeners.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
};
