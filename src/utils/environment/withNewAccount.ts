import { default as Web3Accounts } from 'web3-eth-accounts';

import { Environment } from './Environment';

const withNewAccount = (environment: Environment) => {
  const web3Accounts = new Web3Accounts(environment.eth.currentProvider);

  const account = web3Accounts.create();

  const signer = unsignedTransaction =>
    account.signTransaction(unsignedTransaction).then(t => t.rawTransaction);

  const withWallet = {
    ...environment,
    wallet: {
      address: account.address,
      sign: signer,
    },
  };

  return withWallet;
};

export { withNewAccount };
