import { constructEnvironment, setGlobalEnvironment } from './';

const debug = require('~/utils/getDebug').default(__filename);

const getGanache = () => {
  debug('Setting Ganache up');
  // tslint:disable-next-line:variable-name
  const Ganache = require('@melonproject/ganache-cli');
  const provider = Ganache.provider();
  debug('Ganache setup finished');
  return provider;
};

export const initTestEnvironment = async () => {
  const environment = constructEnvironment({
    // Pass in Ganache.provider but only if
    // process.env.JSON_RPC_ENDPOINT is not set
    endpoint: process.env.JSON_RPC_ENDPOINT,
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
