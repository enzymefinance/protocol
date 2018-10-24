import {
  constructEnvironment,
  setGlobalEnvironment,
  getGlobalEnvironment,
} from './';

const debug = require('~/utils/getDebug').default(__filename);

const getGanache = () => {
  debug('Setting Ganache up');
  // tslint:disable-next-line:variable-name
  const Ganache = require('ganache-cli');
  const provider = Ganache.provider();
  debug('Ganache setup finished');
  return provider;
};

export const initTestEnvironment = async () => {
  if (getGlobalEnvironment().eth) {
    debug('Environment already initialized.');
    return;
  }

  const environment = constructEnvironment({
    // Pass in Ganache.provider but only if
    // process.env.JSON_RPC_ENDPOINT is not set
    provider: !process.env.JSON_RPC_ENDPOINT && getGanache(),
  });
  const accounts = await environment.eth.getAccounts();
  const enhancedEnvironment = {
    ...environment,
    wallet: { address: accounts[0] },
  };
  setGlobalEnvironment(enhancedEnvironment);
  return enhancedEnvironment;
};
