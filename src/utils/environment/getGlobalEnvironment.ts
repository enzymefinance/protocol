import { Environment } from './';
import { globalEnvironment } from './setGlobalEnvironment';

// To ensure the global env is not changed accidentally, we return a copy here
export const getGlobalEnvironment = (): Environment => ({
  ...globalEnvironment,
});
