// import * as Ganache from "ganache-cli";

import constructEnvironment from './constructEnvironment';
import setGlobalEnvironment from './setGlobalEnvironment';
import getGlobalEnvironment from './getGlobalEnvironment';

const debug = require('~/utils/getDebug').default(__filename);

const getGanache = () => {
  debug('Setting ganache up');
  const Ganache = require('ganache-cli');
  const provider = Ganache.provider();
  debug('Setup ganache finished');
  return provider;
};

const initTestEnvironment = async () => {
  if (getGlobalEnvironment().eth) {
    debug('Environment already initialized.');
    return;
  }

  const environment = constructEnvironment({
    // Pass in Ganache.provider but only if process.env.JSON_RPC_ENDPOINT is not set
    provider: !process.env.JSON_RPC_ENDPOINT && getGanache(),
  });
  const accounts = await environment.eth.getAccounts();
  const enhancedEnvironment = {
    ...environment,
    wallet: { address: accounts[0] },
  };
  setGlobalEnvironment(enhancedEnvironment);
};

export default initTestEnvironment;
