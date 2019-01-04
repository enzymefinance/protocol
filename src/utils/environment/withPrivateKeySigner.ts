import {
  Web3ProviderEngine,
  PrivateKeyWalletSubprovider,
  Provider,
} from '@0x/subproviders';

import { default as Web3Accounts } from 'web3-eth-accounts';

import { Environment } from './Environment';
import { Web3Subprovider } from './Web3Subprovider';

const withPrivateKeySigner = async (
  environment: Environment,
  privateKey: string,
) => {
  const providerEngine = new Web3ProviderEngine();
  providerEngine.addProvider(
    new PrivateKeyWalletSubprovider(privateKey.replace('0x', '')),
  );
  providerEngine.addProvider(
    new Web3Subprovider(environment.eth.currentProvider),
  );
  providerEngine.start();
  const provider: Provider = providerEngine;

  const web3Accounts = new Web3Accounts(provider);

  const { address } = web3Accounts.privateKeyToAccount(privateKey);

  const signTransaction = unsignedTransaction =>
    web3Accounts
      .signTransaction(unsignedTransaction, privateKey)
      .then(t => t.rawTransaction);

  const withWallet = {
    ...environment,
    provider,
    wallet: {
      address,
      signTransaction,
    },
  };

  return withWallet;
};

export { withPrivateKeySigner };
