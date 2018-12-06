import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

import { ensure } from '~/utils/guards/ensure';
import { isAddress } from '~/utils/checks/isAddress';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import {
  WithAddressQueryExecute,
  withContractAddressQuery,
} from '~/utils/solidity/withContractAddressQuery';

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

const increaseApproval: WithAddressQueryExecute<
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
