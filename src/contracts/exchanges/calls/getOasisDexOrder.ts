import { createQuantity, Address } from '@melonproject/token-math';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import * as web3Utils from 'web3-utils';

const prepareArgs = (_, { id }) => [id];
const postProcess = async (environment, result, prepared) => {
  const sellToken = await getToken(environment, result['1']);
  const buyToken = await getToken(environment, result['3']);

  return {
    buy: createQuantity(buyToken, result['2']),
    id: web3Utils.toDecimal(prepared.txObject.arguments[0]),
    owner: new Address(result.owner),
    sell: createQuantity(sellToken, result['0']),
    timestamp: result.timestamp,
  };
};

const getOasisDexOrder = callFactory('offers', Contracts.MatchingMarket, {
  postProcess,
  prepareArgs,
});

export { getOasisDexOrder };
