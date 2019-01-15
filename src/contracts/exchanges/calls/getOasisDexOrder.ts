import { createQuantity } from '@melonproject/token-math';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import * as web3Utils from 'web3-utils';

const prepareArgs = (_, { id }) => [id];
const postProcess = async (environment, result, prepared) => {
  const sellToken = await getToken(environment, result['1']);
  const buyToken = await getToken(environment, result['3']);
  return {
    id: web3Utils.toDecimal(prepared.txObject.arguments[0]),
    sell: createQuantity(sellToken, result['0']),
    buy: createQuantity(buyToken, result['2']),
  };
};

const getOasisDexOrder = callFactory('getOffer', Contracts.MatchingMarket, {
  postProcess,
  prepareArgs,
});

export { getOasisDexOrder };
