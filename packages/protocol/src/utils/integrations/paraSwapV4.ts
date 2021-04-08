import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike, utils } from 'ethers';
import { encodeArgs } from '../encoding';

export interface ParaSwapV4Route {
  exchange: AddressLike;
  targetExchange: AddressLike;
  percent: BigNumberish;
  payload: BytesLike;
  networkFee: BigNumberish;
}

export interface ParaSwapV4Path {
  to: AddressLike;
  totalNetworkFee: BigNumberish;
  routes: ParaSwapV4Route[];
}

export interface ParaSwapV4TakeOrder {
  minIncomingAssetAmount: BigNumberish;
  expectedIncomingAssetAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
  paths: ParaSwapV4Path[];
}

export const paraSwapRouteTuple = utils.ParamType.fromString(
  'tuple(address exchange, address targetExchange, uint256 percent, bytes payload, uint256 networkFee)',
);
export const paraSwapRouteTupleArray = `${paraSwapRouteTuple.format('full')}[]`;

export const paraSwapPathTuple = utils.ParamType.fromString(
  `tuple(address to, uint256 totalNetworkFee, ${paraSwapRouteTupleArray} routes)`,
);
export const paraSwapPathTupleArray = `${paraSwapPathTuple.format('full')}[]`;

export function paraSwapV4TakeOrderArgs({
  minIncomingAssetAmount,
  expectedIncomingAssetAmount, // Passed as a courtesy to ParaSwap for analytics
  outgoingAsset,
  outgoingAssetAmount,
  paths,
}: ParaSwapV4TakeOrder) {
  return encodeArgs(
    ['uint256', 'uint256', 'address', 'uint256', paraSwapPathTupleArray],
    [minIncomingAssetAmount, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount, paths],
  );
}
