// About 20 frames a second: the motion is slow, and that is a third less GPU work than 30.
const FRAME_INTERVAL_MS = 1000 / 20;
// requestAnimationFrame timestamps jitter by a few milliseconds: without this slack a 60 Hz display would skip to
// 15 frames a second.
const FRAME_SLACK_MS = 3;
const MAX_STEP_MS = 100;

export const createStageClock = () => {
  let last = 0;
  return {
    tick(now: number) {
      if (last && now - last < FRAME_INTERVAL_MS - FRAME_SLACK_MS) {
        return null;
      }
      const step = last ? Math.min(now - last, MAX_STEP_MS) : 0;
      last = now;
      return step;
    },
    reset() {
      last = 0;
    },
  };
};
