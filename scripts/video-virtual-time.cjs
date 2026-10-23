// Video capture only (T34): a virtual clock for the page, loaded as the capture window's
// preload (contextIsolation off, so it runs in the page's world before any page script).
// It never ships: only scripts/video-electron.mjs loads it.
//
// performance.now, Date, setTimeout/setInterval and requestAnimationFrame all run on a
// virtual clock that only moves when the capture script calls window.__vt.advance(ms).
// CSS animations and transitions are paused and seeked to it. So the real game (React,
// three.js, the playback director's timers, the UI's CSS motion) advances exactly one
// video frame per captured frame, whatever the machine's load.
/* eslint-disable no-undef */
(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const RealDate = window.Date;
  const epoch = RealDate.now();
  let now = 0; // virtual ms since the page started

  // --- Clock --------------------------------------------------------------------
  performance.now = () => now;
  class VirtualDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(epoch + now);
      else super(...args);
    }
    static now() {
      return epoch + now;
    }
  }
  window.Date = VirtualDate;

  // --- Timers -------------------------------------------------------------------
  let nextId = 1;
  const timers = new Map(); // id -> { due, fn, args, interval }
  const addTimer = (fn, delay, args, interval) => {
    const id = nextId++;
    const ms = Math.max(0, Number(delay) || 0);
    timers.set(id, { due: now + ms, fn, args, interval: interval ? Math.max(1, ms) : 0 });
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => addTimer(fn, delay, args, false);
  window.setInterval = (fn, delay, ...args) => addTimer(fn, delay, args, true);
  window.clearTimeout = window.clearInterval = (id) => {
    timers.delete(id);
  };

  // --- Animation frames ---------------------------------------------------------
  let frameCallbacks = new Map();
  window.requestAnimationFrame = (fn) => {
    const id = nextId++;
    frameCallbacks.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frameCallbacks.delete(id);
  };

  // --- CSS animations and transitions -------------------------------------------
  const born = new WeakMap(); // Animation -> virtual time it was first seen at its start
  const seekCss = () => {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, now - (Number(a.currentTime) || 0));
      try {
        if (a.playState !== "paused") a.pause();
        a.currentTime = now - born.get(a);
      } catch {
        // A finished or cancelled animation: leave it.
      }
    }
  };

  const runDueTimers = (target) => {
    for (let guard = 0; guard < 100000; guard += 1) {
      let first = null;
      for (const [id, t] of timers) if (t.due <= target && (!first || t.due < first[1].due || (t.due === first[1].due && id < first[0]))) first = [id, t];
      if (!first) return;
      const [id, t] = first;
      now = Math.max(now, t.due);
      if (t.interval) t.due += t.interval;
      else timers.delete(id);
      try {
        typeof t.fn === "function" ? t.fn(...t.args) : (0, eval)(String(t.fn));
      } catch (error) {
        console.error(error);
      }
    }
  };

  /** Two real frames, so the compositor presents what the virtual frame drew. */
  const presented = () => new Promise((resolve) => realRaf(() => realRaf(() => resolve())));
  /** Real time for loads (fetch, decode, image) to land, between virtual steps. */
  const realPause = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

  window.__vt = {
    get now() {
      return now;
    },
    /** Moves the clock by `ms`: due timers fire in order, then one animation frame runs. */
    async advance(ms, { present = true } = {}) {
      const target = now + ms;
      runDueTimers(target);
      now = target;
      const callbacks = frameCallbacks;
      frameCallbacks = new Map();
      for (const fn of callbacks.values()) {
        try {
          fn(now);
        } catch (error) {
          console.error(error);
        }
      }
      // Microtasks and React's MessageChannel work settle before the frame is presented.
      await realPause(0);
      seekCss();
      if (present) await presented();
      return now;
    },
    realPause,
  };
})();
