import pino from "pino";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

let logger: pino.Logger;

export interface LoggerConfig {
  debug: boolean;
  logDir?: string;
}

export function initLogger(config: LoggerConfig): pino.Logger {
  const { debug, logDir } = config;

  if (debug) {
    // Ensure log directory exists
    const dir = logDir || join(process.cwd(), ".acp-proxy");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Format: acp-proxy-2026-01-24_22-30-45.log
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    const logFile = join(dir, `acp-proxy-${timestamp}.log`);

    // Create logger with file transport for debug mode
    logger = pino(
      {
        level: "trace",
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.destination({
        dest: logFile,
        sync: false,
      })
    );

    // Also log to console in debug mode
    console.log(`📝 Debug logging enabled: ${logFile}`);
  } else {
    // Normal mode: info level to stdout
    logger = pino({
      level: "info",
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: "pino/file",
        options: { destination: 1 }, // stdout
      },
    });
  }

  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    // Default logger if not initialized
    logger = pino({ level: "info" });
  }
  return logger;
}

export const log = {
  trace: (msg: string, obj?: object) => getLogger().trace(obj, msg),
  debug: (msg: string, obj?: object) => getLogger().debug(obj, msg),
  info: (msg: string, obj?: object) => getLogger().info(obj, msg),
  warn: (msg: string, obj?: object) => getLogger().warn(obj, msg),
  error: (msg: string, obj?: object) => getLogger().error(obj, msg),
  fatal: (msg: string, obj?: object) => getLogger().fatal(obj, msg),
};

