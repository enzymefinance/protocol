import { orderHashUtils } from '@0x/order-utils';
import { Contracts, Exchanges } from '~/Contracts';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';

const prepareArgs = async (
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
