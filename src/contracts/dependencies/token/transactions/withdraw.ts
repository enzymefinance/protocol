import { QuantityInterface } from '@melonproject/token-math';

import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = async (_, { howMuch }: WithdrawArgs) => [
  howMuch.quantity.toString(),
];

const postProcess = async (): Promise<WithdrawResult> => {
  return true;
};

interface WithdrawArgs {
  howMuch: QuantityInterface;
}

type WithdrawResult = boolean;

const withdraw = transactionFactory(
  'withdraw',
  Contracts.Weth,
  undefined,
  prepareArgs,
  postProcess,
);

export { withdraw };
