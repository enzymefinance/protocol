import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

import { ensure } from '~/utils/guards/ensure';
import { isAddress } from '~/utils/checks/isAddress';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import {
  withContractAddressQuery,
  WithAddressQueryExecute,
} from '~/utils/solidity/withContractAddressQuery';

const guard = async (environment, { howMuch, from, to }, contractAddress) => {
  ensureAccountAddress(environment);
  ensure(isAddress(from), `From is not an address. Got: ${from}`, from);
  ensure(isAddress(to), `To is not an address. Got: ${to}`, to);
  ensure(
    isAddress(howMuch.token.address),
    `Token needs to have an address. Got: ${howMuch.token.address}`,
  );
};

const prepareArgs = async (_, { howMuch, from, to }) => [
  from.toString(),
  to.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async () => {
  return true;
};

interface TransferFromArgs {
  howMuch: QuantityInterface;
  from: Address;
  to: Address;
}

type TransferFromResult = boolean;

const transferFrom: WithAddressQueryExecute<
  TransferFromArgs,
  TransferFromResult
> = withContractAddressQuery(
  ['howMuch', 'token', 'address'],
  transactionFactory(
    'transferFrom',
    Contracts.StandardToken,
    guard,
    prepareArgs,
    postProcess,
  ),
);

export { transferFrom };
