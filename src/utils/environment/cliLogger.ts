import * as R from 'ramda';
import * as winston from 'winston';
import { CurriedLogger, LogLevels } from './Environment';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(info => {
  return `${info.timestamp} ${info.level} ${info.message}`;
});

const logger = winston.createLogger({
  format: combine(timestamp(), myFormat),
  level: LogLevels.DEBUG,
  transports: [
    new winston.transports.File({
      filename: `./logs/cli-${process.pid}.log`,
    }),
    new winston.transports.File({
      filename: './logs/cli-latest.log',
    }),
    new winston.transports.Console({
      level: LogLevels.INFO,
    }),
  ],
});

logger.debug(
  ['melon:protocol:logger', 'init cliLogger', ...process.argv].join(' '),
);

const cliLogger: CurriedLogger = R.curryN(3, (namespace, level, ...msgs) => {
  const message = [
    `${namespace}:`,
    ...msgs.map(msg => JSON.stringify(msg, null, 2)),
  ].join(' ');
  logger.log(level, message);
  require('debug')(namespace)(level, ...msgs);
});

export { cliLogger };
