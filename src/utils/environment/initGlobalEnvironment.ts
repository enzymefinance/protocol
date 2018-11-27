import { constructEnvironment } from './constructEnvironment';
import { setGlobalEnvironment } from './globalEnvironment';

export const initGlobalEnvironment = (args = {}): void => {
  const environment = constructEnvironment(args);
  setGlobalEnvironment(environment);
};
