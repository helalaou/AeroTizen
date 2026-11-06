export const clampHorizontalOffset = (offset: number, viewportWidth: number, contentWidth: number) =>
  Math.max(0, Math.min(offset, contentWidth - viewportWidth));

// Logical offsets increase from the start of the row in either writing direction.
export const revealHorizontalItem = (track: HTMLElement, item: HTMLElement, previous: number, rtl: boolean) => {
  const start = rtl ? track.clientWidth - item.offsetLeft - item.offsetWidth : item.offsetLeft;
  const end = start + item.offsetWidth;
  return clampHorizontalOffset(
    Math.min(Math.max(previous, end - track.clientWidth), start),
    track.clientWidth,
    track.scrollWidth,
  );
};
