// Browser focus is an imperative action; styling remains rendered from state.
// Keep an active text field inside the selected control on its native keyboard.
export const focusControl = (node: HTMLElement | null) => {
  if (node && !node.contains(document.activeElement)) { node.focus({ preventScroll: true }); }
};
