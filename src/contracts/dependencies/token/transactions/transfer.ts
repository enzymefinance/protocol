import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

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

const guard = async ({ howMuch, to }, contractAddress, environment) => {
  ensureAccountAddress(environment);
  ensure(isAddress(to), `To is not an address. Got: ${to}`, to);
  ensure(
    isAddress(howMuch.token.address),
    `Token needs to have an address. Got: ${howMuch.token.address}`,
  );

  await ensureSufficientBalance(
    howMuch,
    environment.wallet.address,
    environment,
  );
};

const prepareArgs = async ({ howMuch, to }) => [
  to.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async receipt => {
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
