import { render } from "preact";

const TOAST_DURATION_MS = 2500;

export const mountToast = (host: HTMLElement) => {
  let timer: number | undefined;
  const renderMessage = (message: string | null) => {
    render(
      <div id="toast" class="toast" hidden={message === null}>
        {message}
      </div>,
      host,
    );
  };
  const hideToast = () => {
    window.clearTimeout(timer);
    timer = undefined;
    renderMessage(null);
  };
  const toast = (message: string) => {
    window.clearTimeout(timer);
    renderMessage(message);
    timer = window.setTimeout(hideToast, TOAST_DURATION_MS);
  };

  renderMessage(null);
  return {
    bridge: { toast, hideToast },
    dispose() {
      window.clearTimeout(timer);
      render(null, host);
    },
  };
};
