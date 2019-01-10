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
  const sellToken = await getToken(environment, prepared.params.sellAsset);
  const buyToken = await getToken(environment, prepared.params.buyAsset);

  const { 0: ids, 1: sellQtys, 2: buyQtys } = result;
  return Object.keys(ids).map(key => ({
    id: web3Utils.toDecimal(ids[key]),
    sell: createQuantity(sellToken, sellQtys[key]),
    buy: createQuantity(buyToken, buyQtys[key]),
  }));
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
