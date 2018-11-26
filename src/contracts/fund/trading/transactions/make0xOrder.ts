import { PrepareArgsFunction, transactionFactory } from '~/utils/solidity';
import { Create0xOrderArgs } from '~/contracts/exchanges';
import { Contracts } from '~/Contracts';

const prepareArgs: PrepareArgsFunction<Create0xOrderArgs> = async (
  { makerQuantity, takerQuantity },
  contractAddress,
  environment,
) => {};

const make0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  undefined,
  prepareArgs,
);

export { make0xOrder };
