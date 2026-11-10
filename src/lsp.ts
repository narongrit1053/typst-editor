import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function pathToUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const encodedParts = parts.map((part, index) => {
    if (index === 0 && /^[a-zA-Z]:$/.test(part)) {
      return part;
    }
    return encodeURIComponent(part);
  });
  return "file:///" + encodedParts.join("/");
}

export function uriToPath(uri: string): string {
  if (uri.startsWith("file:///")) {
    const withoutPrefix = uri.slice(8);
    const decoded = decodeURIComponent(withoutPrefix);
    return decoded.replace(/\//g, "\\");
  }
  return uri;
}

export interface Transport {
  send(message: string): void;
  subscribe(handler: (value: string) => void): void;
  unsubscribe(handler: (value: string) => void): void;
}

export interface LspConnection {
  rootPath: string;
  transport: Transport;
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string, params: unknown): void;
  onNotification(method: string, handler: (params: any) => void): void;
  close(): void;
}

export async function connectLsp(rootPath: string, onExit: () => void): Promise<LspConnection> {
  const handlers: ((val: string) => void)[] = [];
  const notificationHandlers = new Map<string, ((params: any) => void)[]>();
  const pendingRequests = new Map<number | string, { resolve: (res: any) => void; reject: (err: any) => void }>();
  let nextRequestId = 1;

  const onMessage = new Channel<string>();
  onMessage.onmessage = (msgStr: string) => {
    try {
      const msg = JSON.parse(msgStr);
      if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id)!;
        pendingRequests.delete(msg.id);
        if (msg.error) {
          reject(msg.error);
        } else {
          resolve(msg.result);
        }
        return;
      } else if (msg.method) {
        const list = notificationHandlers.get(msg.method);
        if (list) {
          for (const cb of list) {
            cb(msg.params);
          }
        }
      }
    } catch {}

    for (const h of handlers) {
      try {
        h(msgStr);
      } catch (e) {
        console.error("LSP transport handler error:", e);
      }
    }
  };

  function rejectPending(reason: string) {
    for (const [, req] of pendingRequests) {
      req.reject(new Error(reason));
    }
    pendingRequests.clear();
  }

  let unlistenExit: UnlistenFn | null = null;
  unlistenExit = await listen("lsp-exit", () => {
    rejectPending("LSP process exited");
    onExit();
  });

  await invoke("lsp_start", { onMessage });

  const transport: Transport = {
    send(message: string) {
      invoke("lsp_send", { message }).catch((err) => {
        console.error("Failed to send LSP message:", err);
      });
    },
    subscribe(handler: (value: string) => void) {
      handlers.push(handler);
    },
    unsubscribe(handler: (value: string) => void) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    },
  };

  const connection: LspConnection = {
    rootPath,
    transport,
    request(method: string, params: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = `lsp-${nextRequestId++}`;
        pendingRequests.set(id, { resolve, reject });
        const body = JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        });
        invoke("lsp_send", { message: body }).catch((err) => {
          pendingRequests.delete(id);
          reject(err);
        });
      });
    },
    notify(method: string, params: unknown) {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      });
      invoke("lsp_send", { message: body }).catch(console.error);
    },
    onNotification(method: string, handler: (params: any) => void) {
      let list = notificationHandlers.get(method);
      if (!list) {
        list = [];
        notificationHandlers.set(method, list);
      }
      list.push(handler);
    },
    close() {
      if (unlistenExit) {
        unlistenExit();
        unlistenExit = null;
      }
      rejectPending("LSP connection closed");
      invoke("lsp_stop").catch(() => {});
    },
  };

  return connection;
}
