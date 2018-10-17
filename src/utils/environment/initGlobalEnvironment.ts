import { constructEnvironment, setGlobalEnvironment } from './';

export const initGlobalEnvironment = (args = {}): void => {
  const environment = constructEnvironment(args);
  setGlobalEnvironment(environment);
};
