import { LoggerFunction } from './Environment';

const testLogger: LoggerFunction = (namespace, level, ...msg) => {
  console.log(namespace, level, ...msg);
};

export { testLogger };
