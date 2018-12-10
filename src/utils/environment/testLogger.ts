import * as R from 'ramda';
import * as winston from 'winston';
import { CurriedLogger } from './Environment';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(info => {
  return `${info.timestamp} ${info.level} ${info.message}`;
});

const logger = winston.createLogger({
  format: combine(timestamp(), myFormat),
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: `./logs/test-${process.pid}.log`,
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
