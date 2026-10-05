import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';

const LEVELS_BY_INCREASING_VERBOSITY: readonly LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
];

export function enabledLogLevels(logLevel: AppConfig['logLevel']): LogLevel[] {
  const position = LEVELS_BY_INCREASING_VERBOSITY.indexOf(logLevel);
  return LEVELS_BY_INCREASING_VERBOSITY.slice(0, position + 1);
}

export function createLogger(config: AppConfig): ConsoleLogger {
  return new ConsoleLogger({
    json: config.environment === 'production',
    logLevels: enabledLogLevels(config.logLevel),
  });
}
