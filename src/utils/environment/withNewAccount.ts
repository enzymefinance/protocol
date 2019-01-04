import { default as Web3Accounts } from 'web3-eth-accounts';

import { Environment } from './Environment';
import { withPrivateKeySigner } from './withPrivateKeySigner';

const withNewAccount = async (environment: Environment) => {
  const web3Accounts = new Web3Accounts(environment.eth.currentProvider);

  const account = web3Accounts.create();

  const enhancedEnvironment = await withPrivateKeySigner(
    environment,
    account.privateKey,
  );

  return enhancedEnvironment;
};

export { withNewAccount };
