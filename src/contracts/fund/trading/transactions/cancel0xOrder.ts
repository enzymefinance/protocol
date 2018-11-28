import { SignedOrder, orderHashUtils } from '0x.js';

import { Contracts, Exchanges } from '~/Contracts';
import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { NULL_ADDRESS } from './take0xOrder';

interface Cancel0xOrderArgs {
  signedOrder: SignedOrder;
}

const prepareArgs: PrepareArgsFunction<Cancel0xOrderArgs> = async (
  { signedOrder },
  contractAddress,
  environment,
) => {
  const exchangeIndex = await getExchangeIndex(
    contractAddress,
    {
      exchange: Exchanges.ZeroEx,
    },
    environment,
  );

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

const cancel0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  undefined,
  prepareArgs,
);

export { cancel0xOrder };
