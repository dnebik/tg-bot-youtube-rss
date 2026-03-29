import { AxiosError } from "axios";

type LogLevel = "debug" | "info" | "warn" | "error";

function timestamp(): string {
  return new Date().toISOString();
}

function format(
  level: LogLevel,
  context: string,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}] [${context}]`;
  if (meta && Object.keys(meta).length > 0) {
    const cleaned = Object.fromEntries(
      Object.entries(meta).filter(([, v]) => v !== undefined),
    );
    return `${prefix} ${message} ${JSON.stringify(cleaned)}`;
  }
  return `${prefix} ${message}`;
}

export function createLogger(context: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) =>
      console.debug(format("debug", context, msg, meta)),
    info: (msg: string, meta?: Record<string, unknown>) =>
      console.log(format("info", context, msg, meta)),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      console.warn(format("warn", context, msg, meta)),
    error: (msg: string, meta?: Record<string, unknown>) =>
      console.error(format("error", context, msg, meta)),
  };
}

export function extractAxiosErrorDetails(
  error: unknown,
): Record<string, unknown> {
  if (error instanceof AxiosError) {
    return {
      message: error.message,
      code: error.code,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      method: error.config?.method?.toUpperCase(),
      status: error.response?.status,
      statusText: error.response?.statusText,
      proxy: error.config?.proxy
        ? `${error.config.proxy.host}:${error.config.proxy.port}`
        : "none",
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}