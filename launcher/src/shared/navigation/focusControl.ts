let supportsPreventScroll: boolean | undefined;

// Browser focus is an imperative action; styling remains rendered from state.
// Keep an active text field inside the selected control on its native keyboard.
export const focusControl = (node: HTMLElement | null) => {
  if (!node || node.contains(node.ownerDocument.activeElement)) {
    return;
  }
  if (supportsPreventScroll) {
    node.focus({ preventScroll: true });
    return;
  }

  // Chromium 63 ignores the options, so retain scroll positions until after focus.
  const offsets: { ancestor: Element; left: number; top: number }[] = [];
  for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
    offsets.push({ ancestor, left: ancestor.scrollLeft, top: ancestor.scrollTop });
  }
  if (supportsPreventScroll === undefined) {
    supportsPreventScroll = false;
    node.focus({
      get preventScroll() {
        supportsPreventScroll = true;
        return true;
      },
    });
  } else {
    node.focus();
  }
  if (!supportsPreventScroll) {
    for (const { ancestor, left, top } of offsets) {
      if (ancestor.scrollLeft !== left) {
        ancestor.scrollLeft = left;
      }
      if (ancestor.scrollTop !== top) {
        ancestor.scrollTop = top;
      }
    }
  }
};
