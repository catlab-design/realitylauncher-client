import { describe, expect, it } from "bun:test";
import { createLaunchWatchdog, type WatchdogTimers } from "./launchWatchdog";

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: WatchdogTimers = {
    set: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance };
}

describe("createLaunchWatchdog", () => {
  it("trips after the stall time without progress", () => {
    const { timers, advance } = fakeTimers();
    let calls = 0;
    const dog = createLaunchWatchdog(() => calls++, 1000, timers);
    advance(999);
    expect(calls).toBe(0);
    advance(1);
    expect(calls).toBe(1);
    expect(dog.stalled).toBe(true);
  });

  it("restarts the wait on progress", () => {
    const { timers, advance } = fakeTimers();
    let calls = 0;
    const dog = createLaunchWatchdog(() => calls++, 1000, timers);
    for (let i = 0; i < 10; i++) {
      advance(900);
      dog.touch();
    }
    expect(calls).toBe(0);
    advance(1000);
    expect(calls).toBe(1);
  });

  it("never trips once stopped", () => {
    const { timers, advance } = fakeTimers();
    let calls = 0;
    const dog = createLaunchWatchdog(() => calls++, 1000, timers);
    dog.stop();
    dog.touch();
    advance(5000);
    expect(calls).toBe(0);
    expect(dog.stalled).toBe(false);
  });

  it("trips only once", () => {
    const { timers, advance } = fakeTimers();
    let calls = 0;
    const dog = createLaunchWatchdog(() => calls++, 1000, timers);
    advance(1000);
    dog.touch();
    advance(5000);
    expect(calls).toBe(1);
  });
});
