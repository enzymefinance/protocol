import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

import { isAddress } from '~/utils/checks/isAddress';
import { ensure } from '~/utils/guards/ensure';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensureSufficientBalance } from '../guards/ensureSufficientBalance';
import {
  WithAddressQueryExecute,
  withContractAddressQuery,
} from '~/utils/solidity/withContractAddressQuery';

const guard = async (environment, { howMuch, spender }) => {
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
    environment,
    howMuch,
    environment.wallet.address,
  );
};

const prepareArgs = async (_, { howMuch, spender }) => [
  spender.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async () => {
  return true;
};

interface ApproveArgs {
  howMuch: QuantityInterface;
  spender: Address;
}

type ApproveResult = boolean;

const approve: WithAddressQueryExecute<
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
