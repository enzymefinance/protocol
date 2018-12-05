import * as winston from 'winston';
import { LoggerFunction } from './Environment';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(info => {
  return `${info.timestamp} ${info.level} ${info.message}`;
});

const logger = winston.createLogger({
  format: combine(timestamp(), myFormat),
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: `./logs/${new Date().toISOString()}.log`,
    }),
  ],
});

logger.debug(['melon:protocol:logger', 'init', ...process.argv].join(' '));

const testLogger: LoggerFunction = (namespace, level, ...msgs) => {
  const message = [
    `${namespace}:`,
    ...msgs.map(msg => JSON.stringify(msg, null, 2)),
  ].join(' ');
  logger.log(level, message);
  require('debug')(namespace)(level, ...msgs);
};

export { testLogger };
