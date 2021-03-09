import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
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
  minPoolTokenAmount,
}: {
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountADesired: BigNumberish;
  amountBDesired: BigNumberish;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
  minPoolTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address[2]', 'uint256[2]', 'uint256[2]', 'uint256'],
    [[tokenA, tokenB], [amountADesired, amountBDesired], [amountAMin, amountBMin], minPoolTokenAmount],
  );
}

export function uniswapV2RedeemArgs({
  poolTokenAmount,
  tokenA,
  tokenB,
  amountAMin,
  amountBMin,
}: {
  poolTokenAmount: BigNumberish;
  tokenA: AddressLike;
  tokenB: AddressLike;
  amountAMin: BigNumberish;
  amountBMin: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'address[2]', 'uint256[2]'],
    [poolTokenAmount, [tokenA, tokenB], [amountAMin, amountBMin]],
  );
}
