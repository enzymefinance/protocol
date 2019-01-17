import { assetDataUtils } from '@0x/order-utils';
import { OrderStatus } from '@0x/contract-wrappers';
import { SignedOrder } from '@0x/types';
import { QuantityInterface, createQuantity } from '@melonproject/token-math';

import { stringifyStruct } from '~/utils/solidity/stringifyStruct';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

interface OrderInfo {
  status: OrderStatus;
  hash: string;
  takerFilled: QuantityInterface;
}

const prepareArgs = (_, { signedOrder }: { signedOrder: SignedOrder }) => {
  return [stringifyStruct(signedOrder)];
};

const postProcess = async (
  environment,
  result,
  { params },
): Promise<OrderInfo> => {
  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    params.signedOrder.takerAssetData,
  ).tokenAddress;
  const takerToken = await getToken(environment, takerTokenAddress);

  const info = {
    hash: result.orderHash,
    status: result.orderStatus,
    takerFilled: createQuantity(takerToken, result.orderTakerAssetFilledAmount),
  };
  return info;
};

const getOrderInfo = callFactory('getOrderInfo', Contracts.ZeroExExchange, {
  postProcess,
  prepareArgs,
});

export { getOrderInfo };
