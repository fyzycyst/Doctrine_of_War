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
  // Animation -> the virtual time it started. A new one starts now: its own currentTime when
  // first seen is real milliseconds since the browser made it, which would leak real time in.
  const born = new WeakMap();
  const seekCss = () => {
    if (!document.getAnimations) return;
    // Flush style first: a CSS transition only exists once style is recalculated, and one born
    // after this seek would run on real time until the next frame.
    void document.documentElement.offsetHeight;
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, now);
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

  // While the scene loads the clock holds (advance with `hold`): each pending timer fires once
  // per frame (React's Suspense reveal and the loaders wait on timers) but no time passes, so
  // nothing that moves with time runs early. Playback waits on this until the harness releases it
  // (src/app/captureStore.ts, playbackHold), so the battle starts at the same instant every run.
  window.__holdPlayback = new Promise((resolve) => {
    window.__releasePlayback = resolve;
  });
  const runPendingTimers = () => {
    const pending = [...timers].sort(([a, x], [b, y]) => x.due - y.due || a - b);
    for (const [id, t] of pending) {
      if (!timers.has(id)) continue; // cleared by an earlier one
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
  /** One trip through the MessageChannel queue, behind any work React's scheduler posted there. */
  const messageTurn = () =>
    new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(0);
    });
  /** Real time for loads (fetch, decode, image) to land, between virtual steps. */
  const realPause = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

  window.__vt = {
    get now() {
      return now;
    },
    /**
     * Moves the clock by `ms`: due timers fire in order, then one animation frame runs. With
     * `hold`, the clock stays put and every pending timer fires once instead (loading only).
     */
    async advance(ms, { present = true, hold = false } = {}) {
      const target = now + ms;
      if (hold) runPendingTimers();
      else runDueTimers(target);
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
      // Microtasks and React's MessageChannel work settle before the frame is presented: a few
      // round trips, so a commit (a callout mounting) never lands after its frame was seeked.
      for (let i = 0; i < 3; i += 1) {
        await messageTurn();
        await realPause(0);
      }
      seekCss();
      if (present) await presented();
      return now;
    },
    realPause,
  };
})();
