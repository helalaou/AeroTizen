import "./devContinueWatching";
import "./index";

if (new URLSearchParams(location.search).get("mockHdmi") === "5" && !("tizen" in window)) {
  const runtime = window.AeroTizen;
  const { inputs } = runtime;
  const port = 5;

  inputs.learnIpControl = () => {
    if (inputs.sources.some((source) => source.type === "HDMI" && source.number === port)) {
      return Promise.resolve({ status: "known", port });
    }
    inputs.setIpControlPorts([port], (number) => {
      const label = inputs.label({ type: "HDMI", number });
      runtime.toast(runtime.translate("inputs.wouldSwitch", { input: label }));
    });
    return Promise.resolve({ status: "added", port });
  };
}

// The legacy boot script must run after the Home and Settings controllers are registered.
// Keep it a classic script so development has the same global APIs as the widget.
const boot = document.createElement("script");
boot.src = "/js/main.js";
document.body.appendChild(boot);
