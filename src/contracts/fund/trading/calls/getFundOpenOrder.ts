import { createQuantity } from '@melonproject/token-math';

import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
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
    fillTakerQuantity: order.fillTakerQuantity,
    id: order.orderId.toString(),
    makerAsset: order.makerAsset,
    makerQuantity: createQuantity(makerToken, order.makerQuantity),
    takerAsset: order.takerAsset,
    takerQuantity: createQuantity(takerToken, order.takerQuantity),
    timestamp: order.timestamp,
    updateType: order.updateType,
  };
};

export { getFundOpenOrder };
