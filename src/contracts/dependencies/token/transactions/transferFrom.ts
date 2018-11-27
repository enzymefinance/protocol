import { QuantityInterface } from '@melonproject/token-math/quantity';
import { ensure } from '~/utils/guards/ensure';
import { Address } from '~/utils/types';
import { isAddress } from '~/utils/checks/isAddress';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import {
  transactionFactory,
  withContractAddressQuery,
  ImplicitExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const guard = async ({ howMuch, from, to }, contractAddress, environment) => {
  ensureAccountAddress(environment);
  ensure(isAddress(from), `From is not an address. Got: ${from}`, from);
  ensure(isAddress(to), `To is not an address. Got: ${to}`, to);
  ensure(
    isAddress(howMuch.token.address),
    `Token needs to have an address. Got: ${howMuch.token.address}`,
  );
};

const prepareArgs = async ({ howMuch, from, to }) => [
  from.toString(),
  to.toString(),
  howMuch.quantity.toString(),
];

const postProcess = async receipt => {
  return true;
};

interface TransferFromArgs {
  howMuch: QuantityInterface;
  from: Address;
  to: Address;
}

type TransferFromResult = boolean;

const transferFrom: ImplicitExecute<
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
