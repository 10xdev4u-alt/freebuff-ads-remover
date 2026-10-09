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
    const parts = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)));
    const line = parts.length > 0 ? `${formatted} ${parts.join(' ')}` : formatted;

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
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
