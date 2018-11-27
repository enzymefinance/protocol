import { QuantityInterface } from '@melonproject/token-math/quantity';

import { Address } from '~/utils/types';
import { isAddress } from '~/utils/checks/isAddress';
import { ensure } from '~/utils/guards/ensure';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import {
  transactionFactory,
  withContractAddressQuery,
  ImplicitExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensureSufficientBalance } from '../guards/ensureSufficientBalance';

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
  await ensureSufficientBalance(
    howMuch,
    environment.wallet.address,
    environment,
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
