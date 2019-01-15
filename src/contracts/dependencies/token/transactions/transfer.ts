import { QuantityInterface, Address } from '@melonproject/token-math';

import { ensure } from '~/utils/guards/ensure';
import { isAddress } from '~/utils/checks/isAddress';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

import { ensureSufficientBalance } from '../guards/ensureSufficientBalance';
import {
  withContractAddressQuery,
  WithAddressQueryExecute,
} from '~/utils/solidity/withContractAddressQuery';

const guard = async (environment, { howMuch, to }, contractAddress) => {
  ensureAccountAddress(environment);
  ensure(isAddress(to), `To is not an address. Got: ${to}`, to);
  ensure(
    isAddress(howMuch.token.address),
    `Token needs to have an address. Got: ${howMuch.token.address}`,
  );

  await ensureSufficientBalance(
    environment,
    howMuch,
    environment.wallet.address,
  );
};

const prepareArgs = async (_, { howMuch, to }) => [
  to.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async () => {
  return true;
};

interface TransferArgs {
  howMuch: QuantityInterface;
  to: Address;
}

type TransferResult = boolean;

const transfer: WithAddressQueryExecute<
  TransferArgs,
  TransferResult
> = withContractAddressQuery(
  ['howMuch', 'token', 'address'],
  transactionFactory(
    'transfer',
    Contracts.StandardToken,
    guard,
    prepareArgs,
    postProcess,
  ),
);

export { transfer };
