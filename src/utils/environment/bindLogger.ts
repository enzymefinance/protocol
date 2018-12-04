import { LoggerFunction, LogLevels } from './Environment';

/**
 * Levels ERROR, VERBOSE and SILLY are ommited by purpose:
 * - ERRORs should throw
 * - DEBUG is already SILLY VERBOSE
 */
const bindLogger = (logger: LoggerFunction, namespace: string) => ({
  debug: (...msg: any[]) => logger(namespace, LogLevels.DEBUG, ...msg),
  info: (...msg: any[]) => logger(namespace, LogLevels.INFO, ...msg),
  log: (level: LogLevels, ...msg: any[]) => logger(namespace, level, ...msg),
  warn: (...msg: any[]) => logger(namespace, LogLevels.WARN, ...msg),
});

export { bindLogger };
