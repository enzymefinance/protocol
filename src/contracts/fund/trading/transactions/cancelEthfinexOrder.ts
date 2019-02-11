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

interface CancelEthfinexOrderArgs {
  signedOrder?: SignedOrder;
  orderHashHex?: string;
}

const prepareArgs: PrepareArgsFunction<CancelEthfinexOrderArgs> = async (
  environment,
  { signedOrder, orderHashHex: givenOrderHashHex },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.Ethfinex,
  });

  const orderHashHex =
    givenOrderHashHex || orderHashUtils.getOrderHashHex(signedOrder);

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

const cancelEthfinexOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  undefined,
  prepareArgs,
);

export { cancelEthfinexOrder };
