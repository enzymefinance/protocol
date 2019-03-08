import { Environment } from './Environment';
import { ensure } from '../guards/ensure';

const withUnlockedSigner = async (environment: Environment) => {
  const accounts = await environment.eth.getAccounts();

  ensure(accounts.length > 0, 'No unlocked accounts found');

  const signTransaction = (unsignedTransaction, from = accounts[0]) =>
    environment.eth
      .signTransaction(unsignedTransaction, from.toLowerCase())
      .then(t => t.raw);

  const withWallet = {
    ...environment,
    wallet: {
      address: accounts[0],
      signTransaction,
    },
  };

  return withWallet;
};

export { withUnlockedSigner };
