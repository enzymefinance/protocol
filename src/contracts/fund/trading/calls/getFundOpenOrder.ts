import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math/quantity';
import * as web3Utils from 'web3-utils';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const getFundOpenOrder = async (environment, tradingAddress, index) => {
  const tradingContract = getContract(
    environment,
    Contracts.Trading,
    tradingAddress,
  );
  const order = await tradingContract.methods.orders(index).call();
  const makerToken = await getToken(environment, order.makerAsset);
  const takerToken = await getToken(environment, order.takerAsset);
  return {
    exchangeAddress: order.exchangeAddress,
    id: web3Utils.toDecimal(order.orderId),
    updateType: order.updateType,
    makerAsset: order.makerAsset,
    takerAsset: order.takerAsset,
    makerQuantity: createQuantity(makerToken, order.makerQuantity),
    takerQuantity: createQuantity(takerToken, order.takerQuantity),
    timestamp: order.timestamp,
    fillTakerQuantity: order.fillTakerQuantity,
  };
};

export { getFundOpenOrder };
