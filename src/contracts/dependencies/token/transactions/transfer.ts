import { QuantityInterface } from '@melonproject/token-math/quantity';

import { ensure } from '~/utils/guards';
import { Address } from '~/utils/types';
import { isAddress } from '~/utils/checks';
import { ensureAccountAddress } from '~/utils/environment';

import {
  transactionFactory,
  withContractAddressQuery,
  ImplicitExecute,
  Contract,
} from '~/utils/solidity';

// export const guards = async (
// contractAddress: string,
// { to, tokens },
// environment,
// ) => {
// ensureAccountAddress(environment);
// const currentBalance = await balanceOf(
// contractAddress,
// { address: environment.wallet.address },
// environment,
// );

// // const balanceAfter = quantity.subtract(currentBalance, )
// };

const guard = async ({ howMuch, to }, environment) => {
  ensure(isAddress(to), `To is not an address. Got: ${to}`, to);
  ensure(
    isAddress(howMuch.token.address),
    `Token needs to have an address. Got: ${howMuch.token.address}`,
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

const transfer: ImplicitExecute<
  TransferArgs,
  TransferResult
> = withContractAddressQuery(
  ['howMuch', 'token', 'address'],
  transactionFactory(
    'transfer',
    Contract.StandardToken,
    guard,
    prepareArgs,
    postProcess,
  ),
);

export { transfer };
