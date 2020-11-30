import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, BytesLike, utils } from 'ethers';
import { encodeArgs } from '../encoding';

export interface ParaswapRoute {
  exchange: AddressLike;
  targetExchange: AddressLike;
  percent: BigNumberish;
  payload: BytesLike;
  networkFee: BigNumberish;
}

export interface ParaswapPath {
  to: AddressLike;
  totalNetworkFee: BigNumberish;
  routes: ParaswapRoute[];
}

export interface ParaswapTakeOrder {
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
  expectedIncomingAssetAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
  paths: ParaswapPath[];
}

export const paraswapRouteTuple = utils.ParamType.fromString(
  'tuple(address exchange, address targetExchange, uint256 percent, bytes payload, uint256 networkFee)',
);
export const paraswapRouteTupleArray = `${paraswapRouteTuple.format('full')}[]`;

export const paraswapPathTuple = utils.ParamType.fromString(
  `tuple(address to, uint256 totalNetworkFee, ${paraswapRouteTupleArray} routes)`,
);
export const paraswapPathTupleArray = `${paraswapPathTuple.format('full')}[]`;

export function paraswapTakeOrderArgs({
  incomingAsset,
  minIncomingAssetAmount,
  expectedIncomingAssetAmount, // Passed as a courtesy to Paraswap for analytics
  outgoingAsset,
  outgoingAssetAmount,
  paths,
}: ParaswapTakeOrder) {
  return encodeArgs(
    ['address', 'uint256', 'uint256', 'address', 'uint256', paraswapPathTupleArray],
    [incomingAsset, minIncomingAssetAmount, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount, paths],
  );
}
