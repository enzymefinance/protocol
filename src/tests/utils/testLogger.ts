import * as R from 'ramda';
import * as winston from 'winston';
import { CurriedLogger, LogLevels } from '../../utils/environment/Environment';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(info => {
  return `${info.timestamp} ${info.level} ${info.message}`;
});

const logger = winston.createLogger({
  format: combine(timestamp(), myFormat),
  level: LogLevels.DEBUG,
  transports: [
    new winston.transports.File({
      filename: `./logs/test-${process.pid}.log`,
    }),
    new winston.transports.File({
      filename: './logs/test-latest.log',
    }),
  ],
});

logger.debug(['melon:protocol:logger', 'init', ...process.argv].join(' '));

const testLogger: CurriedLogger = R.curryN(3, (namespace, level, ...msgs) => {
  const message = [
    `${namespace}:`,
    ...msgs.map(msg => JSON.stringify(msg, null, 2)),
  ].join(' ');
  logger.log(level, message);
  require('debug')(namespace)(level, ...msgs);
});

export { testLogger };
