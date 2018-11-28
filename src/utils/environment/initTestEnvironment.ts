import { constructEnvironment } from './constructEnvironment';
import { setGlobalEnvironment } from './globalEnvironment';

const debug = require('debug')('melon:protocol:utils:environment');

const getGanache = () => {
  debug('Setting Ganache up');
  // tslint:disable-next-line:variable-name
  const Ganache = require('@melonproject/ganache-cli');
  const provider = Ganache.provider({
    gasLimit: '0x7a1200',
    // tslint:disable-next-line:object-literal-sort-keys
    default_balance_ether: 10000000000000,
  });
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
