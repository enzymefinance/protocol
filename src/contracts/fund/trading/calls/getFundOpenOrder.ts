import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';
import { createQuantity } from '@melonproject/token-math/quantity';
import * as web3Utils from 'web3-utils';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const getFundOpenOrder = async (tradingAddress, index, environment) => {
  const tradingContract = getContract(
    Contracts.Trading,
    tradingAddress,
    environment,
  );
  const order = await tradingContract.methods.orders(index).call();
  const makerToken = await getToken(order.makerAsset);
  const takerToken = await getToken(order.takerAsset);
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
