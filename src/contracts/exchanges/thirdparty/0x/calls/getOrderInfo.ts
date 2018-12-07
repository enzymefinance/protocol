import { assetDataUtils } from '@0x/order-utils';
import { OrderStatus } from '@0x/contract-wrappers';
import { SignedOrder } from '@0x/types';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';

import { stringifyStruct } from '~/utils/solidity/stringifyStruct';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

interface OrderInfo {
  status: OrderStatus;
  hash: string;
  takerFilled: QuantityInterface;
}

const prepareArgs = ({ signedOrder }: { signedOrder: SignedOrder }) => {
  return [stringifyStruct(signedOrder)];
};

const postProcess = async (result, { params }): Promise<OrderInfo> => {
  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    params.signedOrder.takerAssetData,
  ).tokenAddress;
  const takerToken = await getToken(takerTokenAddress);

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
