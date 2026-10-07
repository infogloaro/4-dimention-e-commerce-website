import { getContext } from "./context";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const SENSITIVE =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|signature|card|cvv|otp|hash|set-cookie/i;

/** Deep-redacts anything that looks like a credential before it can reach a log sink. */
export function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  // Read env directly: the logger must never throw because of configuration.
  const configured = (process.env.LOG_LEVEL as Level | "silent" | undefined) ?? "info";
  if (process.env.NODE_ENV === "test" && !process.env.LOG_LEVEL) return;
  if (ORDER[level] < (ORDER[configured] ?? ORDER.info)) return;
  const ctx = getContext();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: ctx?.requestId,
    actorId: ctx?.actorId ?? undefined,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => emit("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};
