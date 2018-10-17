import { Environment } from './Environment';

export let globalEnvironment: Environment;

export const setGlobalEnvironment = (environment: Environment) => {
  if (!!globalEnvironment) {
    console.warn(
      'Overwriting the global environment can lead unpredictable outcomes',
    );
  }
  globalEnvironment = Object.freeze({ ...environment });
};
