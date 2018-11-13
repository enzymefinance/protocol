import { QuantityInterface } from '@melonproject/token-math/quantity';

import { ensure } from '~/utils/guards';
import { Address } from '~/utils/types';
import { isAddress } from '~/utils/checks';

import {
  transactionFactory,
  withContractAddressQuery,
  ImplicitExecute,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const guard = async ({ howMuch, spender }, environment) => {
  ensure(
    isAddress(spender),
    `Spender is not an address. Got: ${spender}`,
    spender,
  );
  ensure(
    isAddress(howMuch.token.address),
    `Token needs to have an address. Got: ${howMuch.token.address}`,
  );
};

const prepareArgs = async ({ howMuch, spender }) => [
  spender.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async receipt => {
  return true;
};

interface IncreaseApprovalArgs {
  howMuch: QuantityInterface;
  spender: Address;
}

type IncreaseApprovalResult = boolean;

const increaseApproval: ImplicitExecute<
  IncreaseApprovalArgs,
  IncreaseApprovalResult
> = withContractAddressQuery(
  ['howMuch', 'token', 'address'],
  transactionFactory(
    'increaseApproval',
    Contracts.StandardToken,
    guard,
    prepareArgs,
    postProcess,
  ),
);

export { increaseApproval };
