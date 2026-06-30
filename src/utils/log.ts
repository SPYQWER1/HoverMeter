import {
  debug,
  error,
  info,
  trace,
  warn,
} from "@tauri-apps/plugin-log";

function stringify(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function forwardConsole(
  fnName: "log" | "debug" | "info" | "warn" | "error",
  logger: (message: string) => Promise<void>,
) {
  const original = console[fnName];
  console[fnName] = (...args: unknown[]) => {
    original(...args);
    logger(stringify(args)).catch(() => {
      // Ignore forwarding errors to avoid infinite loops.
    });
  };
}

export function initLogging(): void {
  // Forward all console methods to the Tauri log plugin so they are written
  // to the log file alongside Rust logs.
  forwardConsole("log", trace);
  forwardConsole("debug", debug);
  forwardConsole("info", info);
  forwardConsole("warn", warn);
  forwardConsole("error", error);

}
