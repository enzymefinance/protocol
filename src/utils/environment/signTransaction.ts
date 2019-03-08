import { Environment } from './Environment';
import { UnsignedRawTransaction } from '../solidity/transactionFactory';
import { ensureAccountAddress } from './ensureAccountAddress';
import { ensure } from '../guards/ensure';

const signTransaction = async (
  environment: Environment,
  unsignedTransaction: UnsignedRawTransaction,
) => {
  ensureAccountAddress(environment);

  ensure(
    typeof environment.wallet.signTransaction === 'function',
    'No signer configured on environment',
  );

  return environment.wallet.signTransaction(
    unsignedTransaction,
    environment.wallet.address,
  );
};

export { signTransaction };
