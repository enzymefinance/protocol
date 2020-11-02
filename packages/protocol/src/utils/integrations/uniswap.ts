import { BigNumberish } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import { encodeArgs } from '../encoding';

export function uniswapV2TakeOrderArgs({
  path,
  outgoingAssetAmount,
  minIncomingAssetAmount,
}: {
  path: AddressLike[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address[]', 'uint256', 'uint256'], [path, outgoingAssetAmount, minIncomingAssetAmount]);
}

export function uniswapV2LendArgs({
  tokenA,
  tokenB,
  amountADesired,
  amountBDesired,
  amountAMin,
  amountBMin,
  incomingAsset,
  minIncomingAssetAmount,
}: {
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountADesired: BigNumberish;
  amountBDesired: BigNumberish;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address[2]', 'uint256[2]', 'uint256[2]', 'address', 'uint256'],
    [
      [tokenA, tokenB],
      [amountADesired, amountBDesired],
      [amountAMin, amountBMin],
      incomingAsset,
      minIncomingAssetAmount,
    ],
  );
}

export function uniswapV2RedeemArgs({
  outgoingAsset,
  liquidity,
  tokenA,
  tokenB,
  amountAMin,
  amountBMin,
}: {
  outgoingAsset: AddressLike;
  liquidity: BigNumberish;
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'address[2]', 'uint256[2]'],
    [outgoingAsset, liquidity, [tokenA, tokenB], [amountAMin, amountBMin]],
  );
}
