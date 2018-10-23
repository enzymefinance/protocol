import { QuantityInterface } from '@melonproject/token-math/quantity';

import { Address } from '~/utils/types';
import {
  transactionFactory,
  withContractAddressQuery,
  ImplicitExecute,
  Contract,
} from '~/utils/solidity';
import { isAddress } from '~/utils/checks';
import { ensure } from '~/utils/guards';

const guard = async ({ howMuch, spender }, environment) => {
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
    Contract.StandardToken,
    guard,
    prepareArgs,
    postProcess,
  ),
);

export { approve };
