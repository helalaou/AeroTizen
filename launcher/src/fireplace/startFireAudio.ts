type AudioWindow = Pick<typeof window, "setTimeout" | "clearTimeout"> & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

const closeAudio = (context: AudioContext) => {
  try {
    void context.close().catch(() => undefined);
  } catch {
    // Older TV audio implementations can throw during teardown.
  }
};

const playFire = (context: AudioContext, browser: AudioWindow, volume: number) => {
  const master = context.createGain();
  master.gain.value = volume;

  // Soft roar: brown noise through a low-pass filter.
  const roarBuffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const roarSamples = roarBuffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < roarSamples.length; i++) {
    const white = Math.random() * 2 - 1;
    previous = (previous + 0.02 * white) / 1.02;
    roarSamples[i] = previous * 3.2;
  }
  const roar = context.createBufferSource();
  roar.buffer = roarBuffer;
  roar.loop = true;
  const lowPass = context.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 420;
  const roarGain = context.createGain();
  roarGain.gain.value = 0.55;
  roar.connect(lowPass);
  lowPass.connect(roarGain);
  roarGain.connect(master);

  // Crackles: short filtered noise bursts at random intervals.
  const burst = context.createBuffer(1, context.sampleRate * 0.05, context.sampleRate);
  const burstSamples = burst.getChannelData(0);
  for (let i = 0; i < burstSamples.length; i++) {
    burstSamples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / burstSamples.length, 6);
  }
  let timer: number;
  const crackle = () => {
    const source = context.createBufferSource();
    source.buffer = burst;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1500 + Math.random() * 4500;
    filter.Q.value = 1.5;
    const gain = context.createGain();
    gain.gain.value = 0.15 + Math.random() * (Math.random() < 0.12 ? 1.2 : 0.45);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    timer = browser.setTimeout(crackle, 40 + Math.random() * (Math.random() < 0.3 ? 900 : 220));
  };
  master.connect(context.destination);
  roar.start();
  crackle();
  return {
    setVolume(next: number) {
      master.gain.value = next;
    },
    stop() {
      browser.clearTimeout(timer);
      master.disconnect();
      closeAudio(context);
    },
  };
};

export const startFireAudio = (browser: AudioWindow, volume: number) => {
  const Audio = browser.AudioContext || browser.webkitAudioContext;
  if (!Audio) {
    return;
  }
  let context: AudioContext | undefined;
  try {
    context = new Audio();
    return playFire(context, browser, volume);
  } catch {
    if (context) {
      closeAudio(context);
    }
    // Keep the visual fireplace available when Web Audio cannot start.
    return;
  }
};
