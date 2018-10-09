import constructEnvironment from './constructEnvironment';
import setGlobalEnvironment from './setGlobalEnvironment';

const initGlobalEnvironment = (args = {}): void => {
  const environment = constructEnvironment(args);
  setGlobalEnvironment(environment);
};

export default initGlobalEnvironment;
