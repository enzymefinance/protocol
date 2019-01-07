import { SignedOrder } from '@0x/types';
import { orderHashUtils } from '@0x/order-utils';

import { Contracts, Exchanges } from '~/Contracts';
import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { NULL_ADDRESS } from './take0xOrder';

interface CancelEthfinexOrderArgs {
  signedOrder: SignedOrder;
}

const prepareArgs: PrepareArgsFunction<CancelEthfinexOrderArgs> = async (
  environment,
  { signedOrder },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.Ethfinex,
  });

  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);

  const args = [
    exchangeIndex,
    FunctionSignatures.cancelOrder,
    [
      NULL_ADDRESS,
      NULL_ADDRESS,
      NULL_ADDRESS,
      NULL_ADDRESS,
      NULL_ADDRESS,
      NULL_ADDRESS,
    ],
    [0, 0, 0, 0, 0, 0, 0, 0],
    orderHashHex,
    '0x0',
    '0x0',
    '0x0',
  ];

  return args;
};

const cancelEthfinexOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  undefined,
  prepareArgs,
);

export { cancelEthfinexOrder };
