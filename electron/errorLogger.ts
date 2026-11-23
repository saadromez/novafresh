import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface AppErrorEntry {
  id: string;
  timestamp: string;
  source: string;
  message: string;
  stack?: string;
}

const DEV_PASSWORD = 'Lunatech@2026';
const MAX_LOGS = 300;
const errorBuffer: AppErrorEntry[] = [];
let logFilePath = '';

export function initErrorLogger() {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFilePath = path.join(logsDir, 'app-errors.log');

    // Preload recent errors from disk
    if (fs.existsSync(logFilePath)) {
      const content = fs.readFileSync(logFilePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines.slice(-MAX_LOGS)) {
        try {
          const parsed = JSON.parse(line);
          errorBuffer.push(parsed);
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[ErrorLogger] Failed to init log file:', err);
  }

  process.on('uncaughtException', (err: Error) => {
    recordAppError('Main Process (Uncaught)', err.message, err.stack);
  });

  process.on('unhandledRejection', (reason: any) => {
    const msg = reason?.message || String(reason);
    const stack = reason?.stack;
    recordAppError('Main Process (Unhandled Rejection)', msg, stack);
  });
}

export function recordAppError(source: string, message: string, stack?: string) {
  const now = new Date();
  const timestamp = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  const entry: AppErrorEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp,
    source: source || 'System',
    message: String(message || 'Unknown error'),
    stack: stack ? String(stack) : undefined
  };

  errorBuffer.unshift(entry);
  if (errorBuffer.length > MAX_LOGS) {
    errorBuffer.pop();
  }

  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (_) {}
  }

  console.error(`[AppError] [${entry.source}] ${entry.message}`);
}

export function getAppErrorLogs(): AppErrorEntry[] {
  return [...errorBuffer];
}

export function clearAppErrorLogs() {
  errorBuffer.length = 0;
  if (logFilePath) {
    try {
      fs.writeFileSync(logFilePath, '', 'utf8');
    } catch (_) {}
  }
}

export function getLogFilePath(): string {
  return logFilePath;
}

export function verifyDevPassword(password: string): boolean {
  return String(password || '').trim() === DEV_PASSWORD;
}
