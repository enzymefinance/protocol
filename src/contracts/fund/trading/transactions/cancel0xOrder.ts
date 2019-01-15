import { SignedOrder } from '@0x/types';
import { orderHashUtils } from '@0x/order-utils';

import { Contracts, Exchanges } from '~/Contracts';
import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';

interface Cancel0xOrderArgs {
  signedOrder: SignedOrder;
}

const prepareArgs: PrepareArgsFunction<Cancel0xOrderArgs> = async (
  environment,
  { signedOrder },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.ZeroEx,
  });

  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);

  const args = [
    exchangeIndex,
    FunctionSignatures.cancelOrder,
    [
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
    ],
    [0, 0, 0, 0, 0, 0, 0, 0],
    orderHashHex,
    '0x0',
    '0x0',
    '0x0',
  ];

  return args;
};

const cancel0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  undefined,
  prepareArgs,
);

export { cancel0xOrder };
