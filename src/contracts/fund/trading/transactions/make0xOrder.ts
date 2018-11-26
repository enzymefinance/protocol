import { PrepareArgsFunction, transactionFactory } from '~/utils/solidity';
import { CreateOrderArgs } from '~/contracts/exchanges';
import { Contracts } from '~/Contracts';

const prepareArgs: PrepareArgsFunction<CreateOrderArgs> = async (
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
