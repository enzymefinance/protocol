import { default as Web3Accounts } from 'web3-eth-accounts';

import { Environment } from './Environment';
import { withPrivateKeySigner } from './withPrivateKeySigner';
import { getLogCurried } from './getLogCurried';

const getLog = getLogCurried('melon:protocol:environment:withNewAccount');

const withNewAccount = async (environment: Environment) => {
  const log = getLog(environment);

  const web3Accounts = new Web3Accounts(environment.eth.currentProvider);

  const account = web3Accounts.create();

  const enhancedEnvironment = await withPrivateKeySigner(
    environment,
    account.privateKey,
  );

  if (process.env.NODE_ENV !== 'production') {
    log.info('New account created with privateKey:', account.privateKey);
  }

  return enhancedEnvironment;
};

export { withNewAccount };
