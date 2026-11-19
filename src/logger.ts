import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logging must never crash the host app. When the launcher exits, or a CI
 * harness closes its pipes, writes to stdout/stderr raise EPIPE; without an
 * 'error' listener Node rethrows it as an uncaught exception, which Electron
 * surfaces as a "JS Uncaught Exception" dialog. Install a sink once and wrap
 * every write.
 */
let streamsGuarded = false;
function guardStreams(): void {
  if (streamsGuarded) return;
  streamsGuarded = true;
  const swallow = (): void => {
    // The reader is gone. The file log below still carries the line.
  };
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', swallow);
  }
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
    return arg.toString();
  }
  if (typeof arg === 'undefined') return 'undefined';
  if (typeof arg === 'symbol') return arg.description ?? '[symbol]';
  if (typeof arg === 'function') return arg.name ? `[function ${arg.name}]` : '[function]';
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return '[unserializable]';
    }
  }
  return '[unknown]';
}

export class Logger {
  private level: LogLevel;
  private logToFile: boolean;
  private logPath: string;

  constructor(level: LogLevel = 'info', logToFile = true) {
    this.level = level;
    this.logToFile = logToFile;
    this.logPath = join(homedir(), '.config', 'freebuff-ads-remover', 'extension.log');
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setLogToFile(enabled: boolean): void {
    this.logToFile = enabled;
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    const parts = args.map(formatArg);
    const line = parts.length > 0 ? `${formatted} ${parts.join(' ')}` : formatted;

    guardStreams();
    try {
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
    } catch {
      // EPIPE / closed stream: never let a log line take the app down.
    }

    if (this.logToFile) {
      this.writeToFile(line);
    }
  }

  private writeToFile(line: string): void {
    try {
      const dir = join(homedir(), '.config', 'freebuff-ads-remover');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(this.logPath, line + '\n', 'utf-8');
    } catch {
    // Silently fail — logging must never crash the app
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}
