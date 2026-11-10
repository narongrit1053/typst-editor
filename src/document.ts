export function detectEol(text: string): "\r\n" | "\n" {
  const crlfIndex = text.indexOf("\r\n");
  const lfIndex = text.indexOf("\n");
  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex <= lfIndex)) {
    return "\r\n";
  }
  return "\n";
}

export function withEol(text: string, eol: "\r\n" | "\n"): string {
  return text.replace(/\r\n|\r|\n/g, eol);
}

export interface SaverOptions {
  getText: () => string;
  write: (text: string) => Promise<void>;
  onState: (state: "saved" | "dirty" | "saving" | "error", err?: string) => void;
  delayMs?: number;
}

export interface Saver {
  touch(): void;
  saveNow(): Promise<void>;
  isDirty(): boolean;
}

export function createSaver(opts: SaverOptions): Saver {
  const delay = opts.delayMs ?? 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let inFlight = false;
  let queuedDuringInFlight = false;

  async function performWrite(): Promise<void> {
    if (inFlight) {
      queuedDuringInFlight = true;
      return;
    }

    inFlight = true;
    queuedDuringInFlight = false;
    opts.onState("saving");

    try {
      const text = opts.getText();
      await opts.write(text);
      inFlight = false;
      if (queuedDuringInFlight) {
        queuedDuringInFlight = false;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        await performWrite();
      } else {
        dirty = false;
        opts.onState("saved");
      }
    } catch (e: any) {
      inFlight = false;
      dirty = true;
      opts.onState("error", e?.message || String(e));
    }
  }

  return {
    touch() {
      dirty = true;
      if (inFlight) {
        queuedDuringInFlight = true;
      }
      opts.onState("dirty");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        performWrite().catch(() => {});
      }, delay);
    },

    async saveNow(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!dirty && !inFlight) {
        return;
      }
      await performWrite();
    },

    isDirty() {
      return dirty;
    },
  };
}
