import { afterEach, describe, expect, it, vi } from "vitest";
import { createPollWaker } from "../src/utils/time.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createPollWaker", () => {
  it("wake resolves a pending wait immediately", async () => {
    vi.useFakeTimers();
    const waker = createPollWaker();
    let resolved = false;
    const pending = waker.wait(10_000).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    waker.wake();
    await pending;
    expect(resolved).toBe(true);
  });

  it("wait resolves after the requested delay without wake", async () => {
    vi.useFakeTimers();
    const waker = createPollWaker();
    let resolved = false;
    const pending = waker.wait(50).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(49);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toBe(true);
  });
});
