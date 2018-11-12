import { QuantityInterface } from '@melonproject/token-math/quantity';

import { Address } from '~/utils/types';
import { isAddress } from '~/utils/checks';
import { ensure } from '~/utils/guards';
import { ensureAccountAddress } from '~/utils/environment';

import {
  transactionFactory,
  withContractAddressQuery,
  ImplicitExecute,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const guard = async ({ howMuch, spender }, contractAddress, environment) => {
  ensureAccountAddress(environment);
  ensure(
    isAddress(spender),
    `Spender is not an address. Got: ${spender}`,
    spender,
  );
  ensure(
    isAddress(howMuch.token.address),
    `Spend token needs to have an address. Got: ${howMuch.address}`,
    spender,
  );
};

const prepareArgs = async ({ howMuch, spender }) => [
  spender.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async receipt => {
  return true;
};

interface ApproveArgs {
  howMuch: QuantityInterface;
  spender: Address;
}

type ApproveResult = boolean;

const approve: ImplicitExecute<
  ApproveArgs,
  ApproveResult
> = withContractAddressQuery(
  ['howMuch', 'token', 'address'],
  transactionFactory(
    'approve',
    Contracts.StandardToken,
    guard,
    prepareArgs,
    postProcess,
  ),
);

export { approve };
