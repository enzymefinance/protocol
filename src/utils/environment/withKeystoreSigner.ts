import { default as Web3Accounts } from 'web3-eth-accounts';

import { Environment } from './Environment';
import { withPrivateKeySigner } from './withPrivateKeySigner';

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

const withKeystoreSigner = async (
  environment: Environment,
  { keystore, password }: WithKeystoreSignerArgs,
) => {
  const web3Accounts = new Web3Accounts(environment.eth.currentProvider);
  const account = web3Accounts.decrypt(keystore, password);

  const enhancedEnvironment = await withPrivateKeySigner(
    environment,
    account.privateKey,
  );

  return enhancedEnvironment;
};

export { withKeystoreSigner };
