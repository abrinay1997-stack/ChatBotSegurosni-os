import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "../shared/ports/index.js";

const als = new AsyncLocalStorage<string>();
const CI_RE = /\b\d{1,2}-\d{3,4}-\d{3,4}\b/g;

function redact(obj: unknown): unknown {
  if (typeof obj === "string") return obj.replace(CI_RE, "[REDACTED]");
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      (obj as Record<string, unknown>)[k] = redact(v);
    }
  }
  return obj;
}

export function createLogger(level: string, sink?: (msg: string) => void): Logger {
  const p = pino({
    level,
    hooks: {
      logMethod(args: unknown[], method) {
        const o = redact(args);
        return method.apply(this, o as any);
      },
    },
    transport: sink ? undefined : undefined,
  });
  const base = sink ? wrap(p, sink) : wrapStd(p);
  return base;
}

function wrap(p: pino.Logger, sink: (m: string) => void): Logger {
  const conv = () => als.getStore();
  const mk = (lvl: "info" | "warn" | "error") => (msg: string, meta: Record<string, unknown> = {}) => {
    const redacted = redact({ ...meta }) as Record<string, unknown>;
    sink(JSON.stringify({ level: lvl, msg, conversation_id: conv(), ...redacted }));
  };
  const base: Logger = { info: mk("info"), warn: mk("warn"), error: mk("error"), child(m) { return base; } };
  return base;
}

function wrapStd(p: pino.Logger): Logger {
  return {
    info: (m, meta) => p.info({ conversation_id: als.getStore(), ...meta }, m),
    warn: (m, meta) => p.warn({ conversation_id: als.getStore(), ...meta }, m),
    error: (m, meta) => p.error({ conversation_id: als.getStore(), ...meta }, m),
    child(meta) { return wrapStd(p.child(meta)); },
  };
}

export async function withConversation<T>(id: string, fn: () => Promise<T>): Promise<T> {
  return als.run(id, fn);
}
export function resetContext() {}
