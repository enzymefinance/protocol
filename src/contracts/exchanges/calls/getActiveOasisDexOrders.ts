import { createQuantity } from '@melonproject/token-math/quantity';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import * as web3Utils from 'web3-utils';

const prepareArgs = (_, { targetExchange, sellAsset, buyAsset }) => [
  targetExchange,
  sellAsset,
  buyAsset,
];
const postProcess = async (environment, result, prepared) => {
  const sellToken = await getToken(environment, prepared.txObject[1]);
  const buyToken = await getToken(environment, prepared.txObject[2]);

  const { 0: id, 1: sellQty, 2: buyQty } = result;

  return {
    id: web3Utils.toDecimal(id),
    sell: createQuantity(sellToken, sellQty),
    buy: createQuantity(buyToken, buyQty),
  };
};

const getActiveOasisDexOrders = callFactory(
  'getOrders',
  Contracts.MatchingMarketAccessor,
  {
    postProcess,
    prepareArgs,
  },
);

export { getActiveOasisDexOrders };
