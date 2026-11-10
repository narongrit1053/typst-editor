import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectEol, withEol, createSaver } from "./document";

describe("detectEol and withEol", () => {
  it("detects CRLF or LF properly", () => {
    expect(detectEol("a\r\nb\n")).toBe("\r\n");
    expect(detectEol("a\nb")).toBe("\n");
    expect(detectEol("no breaks")).toBe("\n");
  });

  it("normalises line breaks to target eol", () => {
    expect(withEol("a\nb\r\nc", "\r\n")).toBe("a\r\nb\r\nc");
    expect(withEol("a\r\nb\r\nc", "\n")).toBe("a\nb\nc");
  });
});

describe("createSaver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces writes 1000ms after the last touch", async () => {
    let currentText = "v0";
    const written: string[] = [];
    const states: string[] = [];

    const saver = createSaver({
      getText: () => currentText,
      write: async (t) => {
        written.push(t);
      },
      onState: (s) => states.push(s),
      delayMs: 1000,
    });

    currentText = "v1";
    saver.touch();
    vi.advanceTimersByTime(300);

    currentText = "v2";
    saver.touch();
    vi.advanceTimersByTime(300);

    currentText = "v3";
    saver.touch();
    vi.advanceTimersByTime(999);

    expect(written).toEqual([]);
    expect(saver.isDirty()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(written).toEqual(["v3"]);
    expect(saver.isDirty()).toBe(false);
    expect(states).toContain("saved");
  });

  it("handles overlapping writes by queueing exactly one more write with the latest text", async () => {
    let currentText = "v1";
    const written: string[] = [];
    let resolveWrite1!: () => void;

    const saver = createSaver({
      getText: () => currentText,
      write: (t) => {
        written.push(t);
        if (t === "v1") {
          return new Promise<void>((resolve) => {
            resolveWrite1 = resolve;
          });
        }
        return Promise.resolve();
      },
      onState: () => {},
      delayMs: 1000,
    });

    saver.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toEqual(["v1"]);

    // While write1 is in flight, touch with v2, then v3
    currentText = "v2";
    saver.touch();
    currentText = "v3";
    saver.touch();

    // Now resolve write1
    resolveWrite1();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    // Exactly one more write follows with latest text "v3"
    expect(written).toEqual(["v1", "v3"]);
    expect(saver.isDirty()).toBe(false);
  });

  it("leaves isDirty true and state error on rejected write, and retries on saveNow", async () => {
    let shouldFail = true;
    let currentText = "text";
    const states: string[] = [];

    const saver = createSaver({
      getText: () => currentText,
      write: async () => {
        if (shouldFail) {
          throw new Error("Disk read-only");
        }
      },
      onState: (s) => states.push(s),
      delayMs: 1000,
    });

    saver.touch();
    await vi.advanceTimersByTimeAsync(1000);

    expect(states[states.length - 1]).toBe("error");
    expect(saver.isDirty()).toBe(true);

    shouldFail = false;
    await saver.saveNow();

    expect(states[states.length - 1]).toBe("saved");
    expect(saver.isDirty()).toBe(false);
  });

  it("performs no write on saveNow if not dirty", async () => {
    const written: string[] = [];
    const saver = createSaver({
      getText: () => "clean",
      write: async (t) => {
        written.push(t);
      },
      onState: () => {},
    });

    await saver.saveNow();
    expect(written).toEqual([]);
    expect(saver.isDirty()).toBe(false);
  });
});
