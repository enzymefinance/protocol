import { default as Web3Accounts } from 'web3-eth-accounts';

import { Environment } from './Environment';

export interface KeystoreItem {
  id: string;
  version: number;
  crypto: object;
  address: string;
  name?: string;
  meta?: string;
}

export interface WithKeystoreSignerArgs {
  keystore: KeystoreItem;
  password: string;
}

const withKeystoreSigner = (
  environment: Environment,
  { keystore, password }: WithKeystoreSignerArgs,
) => {
  const web3Accounts = new Web3Accounts(environment.eth.currentProvider);

  const account = web3Accounts.decrypt(keystore, password);
  const sign = async unsignedTransaction => {
    const signedTransaction = await account.signTransaction(
      unsignedTransaction,
    );
    return signedTransaction.rawTransaction;
  };

  const enhancedEnvironment = {
    ...environment,
    wallet: {
      address: account.address,
      sign,
    },
  };

  return enhancedEnvironment;
};

export { withKeystoreSigner };
