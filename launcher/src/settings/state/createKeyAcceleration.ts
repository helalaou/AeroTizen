// Owns a single held direction. Keyup, blur and focus changes restore fine control.
const HOLD_ACCELERATION = { pauseMs: 750, mediumAfterMs: 600, fastAfterMs: 1500, mediumStep: 5, fastStep: 10 };

export const createKeyAcceleration = (now: () => number = Date.now) => {
  let held: { code: number; target: string; since: number; last: number } | null = null;
  return {
    reset() {
      held = null;
    },
    step(code: number, target: string): number {
      const time = now();
      if (!held || held.code !== code || held.target !== target || time - held.last > HOLD_ACCELERATION.pauseMs) {
        held = { code, target, since: time, last: time };
      }
      const duration = time - held.since;
      held.last = time;
      if (duration >= HOLD_ACCELERATION.fastAfterMs) {
        return HOLD_ACCELERATION.fastStep;
      }
      return duration >= HOLD_ACCELERATION.mediumAfterMs ? HOLD_ACCELERATION.mediumStep : 1;
    },
  };
};
