import { Environment } from '.';

let globalEnvironment: Environment;

// To ensure the global env is not changed accidentally, we return a copy here
export const getGlobalEnvironment = (): Environment => {
  if (!globalEnvironment) {
    throw new Error('Global environment not set.');
  }
  return { ...globalEnvironment };
};

export const setGlobalEnvironment = (environment: Environment) => {
  if (!!globalEnvironment) {
    throw new Error('You can not overwrite the global environment.');
  }
  globalEnvironment = Object.freeze({ ...environment });
};
