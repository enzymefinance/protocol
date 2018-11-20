import { Contracts } from '~/Contracts';
import { callFactory, stringifyStruct } from '~/utils/solidity';
import { SignedOrder } from '@0x/types';
import { OrderStatus, assetDataUtils } from '0x.js';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { getToken } from '~/contracts/dependencies/token';

interface OrderInfo {
  status: OrderStatus;
  hash: string;
  takerFilled: QuantityInterface;
}

const prepareArgs = ({ signedOrder }: { signedOrder: SignedOrder }) => [
  stringifyStruct(signedOrder),
];

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
  console.log(info);
  return info;
};

const get0xOrderInfo = callFactory('getOrderInfo', Contracts.ZeroExExchange, {
  postProcess,
  prepareArgs,
});

export { get0xOrderInfo };
