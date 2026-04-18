import pino from "pino";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

let rootLogger: pino.Logger;

export interface LoggerConfig {
  debug: boolean;
  logDir?: string;
}

/** Pretty-print config for console output */
const PRETTY_CONFIG = {
  colorize: true,
  translateTime: "SYS:HH:MM:ss.l",
  ignore: "pid,hostname",
} as const;

export function initLogger(config: LoggerConfig): pino.Logger {
  const { debug, logDir } = config;

  if (debug) {
    const dir = logDir || join(process.cwd(), ".acp-proxy");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, "_")
      .replace(/:/g, "-")
      .replace(/\..+/, "");
    const logFile = join(dir, `acp-proxy-${timestamp}.log`);

    // Debug mode: JSON to file + pretty to console (multistream)
    rootLogger = pino(
      {
        level: "trace",
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.transport({
        targets: [
          { target: "pino/file", options: { destination: logFile } },
          { target: "pino-pretty", options: { ...PRETTY_CONFIG, destination: 1 } },
        ],
      }),
    );

    console.log(`📝 Debug logging enabled: ${logFile}`);
  } else {
    rootLogger = pino(
      { level: "info", timestamp: pino.stdTimeFunctions.isoTime },
      pino.transport({
        target: "pino-pretty",
        options: { ...PRETTY_CONFIG, destination: 1 },
      }),
    );
  }

  return rootLogger;
}

/** Get the root logger (auto-creates a default one if not initialized). */
export function getLogger(): pino.Logger {
  if (!rootLogger) {
    rootLogger = pino(
      { level: "info" },
      pino.transport({
        target: "pino-pretty",
        options: { ...PRETTY_CONFIG, destination: 1 },
      }),
    );
  }
  return rootLogger;
}

/**
 * Create a child logger scoped to a module.
 * Usage: `const log = createLogger("agent"); log.info({ pid }, "spawned")`
 */
export function createLogger(module: string): pino.Logger {
  return getLogger().child({ module });
}
