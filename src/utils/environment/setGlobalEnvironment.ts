import Environment from './Environment';

export let globalEnvironment: Environment;

const setGlobalEnvironment = (environment: Environment) => {
  if (!!globalEnvironment)
    console.warn(
      'Overwriting the global environment can lead unpredictable outcomes',
    );
  globalEnvironment = { ...environment };
};

export default setGlobalEnvironment;
