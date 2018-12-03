import { Environment } from './Environment';
import { UnsignedRawTransaction } from '../solidity/transactionFactory';
import { ensureAccountAddress } from './ensureAccountAddress';
import { ensure } from '../guards/ensure';

const sign = async (
  unsignedTransaction: UnsignedRawTransaction,
  environment: Environment,
) => {
  ensureAccountAddress(environment);

  ensure(
    typeof environment.wallet.sign === 'function',
    'No signer configured on environment',
  );

  return environment.wallet.sign(
    unsignedTransaction,
    environment.wallet.address,
  );
};

export { sign };
