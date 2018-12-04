import { LoggerFunction } from './Environment';

const testLogger: LoggerFunction = (namespace, level, ...msg) => {
  require('debug')(namespace)(...msg);
};

export { testLogger };
