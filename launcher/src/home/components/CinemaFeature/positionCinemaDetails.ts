export const positionCinemaDetails = (details: HTMLElement, track: HTMLElement, viewport: HTMLElement) => {
  const layer = details.parentElement;
  const header = layer?.parentElement?.querySelector("[data-home-header]");
  const shortcuts = header?.querySelector("[data-header-shortcuts]");
  const tabs = header?.querySelector("[data-header-tabs]");
  const section = track.closest("section");
  const view = details.ownerDocument.defaultView;
  if (!layer || !header || !shortcuts || !tabs || !section || !view) {
    return;
  }

  let frame: number | undefined;
  const update = () => {
    frame = undefined;
    const controlsBottom = Math.max(shortcuts.getBoundingClientRect().bottom, tabs.getBoundingClientRect().bottom);
    const rowTop = section.getBoundingClientRect().top;
    const centre = (controlsBottom + rowTop) / 2 - layer.getBoundingClientRect().top;
    details.style.setProperty("top", centre + "px");
  };
  const schedule = () => {
    if (frame === undefined) {
      frame = view.requestAnimationFrame(update);
    }
  };

  // eslint-disable-next-line compat/compat -- The mutation observer and resize listener cover Chromium 63.
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : undefined;
  const mutations = !resize ? new MutationObserver(schedule) : undefined;
  if (resize) {
    [header, shortcuts, tabs, section].forEach((node) => resize.observe(node));
  } else {
    mutations?.observe(header, {
      attributes: true,
      attributeFilter: ["data-expanded"],
      childList: true,
      subtree: true,
    });
    mutations?.observe(section, { childList: true });
    mutations?.observe(track, { attributes: true, attributeFilter: ["data-cover-art"] });
    view.addEventListener("resize", schedule);
    details.ownerDocument.fonts?.addEventListener("loadingdone", schedule);
  }
  viewport.addEventListener("scroll", schedule, { passive: true });
  update();

  return () => {
    if (frame !== undefined) {
      view.cancelAnimationFrame(frame);
    }
    viewport.removeEventListener("scroll", schedule);
    resize?.disconnect();
    mutations?.disconnect();
    view.removeEventListener("resize", schedule);
    details.ownerDocument.fonts?.removeEventListener("loadingdone", schedule);
  };
};
