import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum UniswapV3LiquidityPositionActionId {
  Mint = '0',
  AddLiquidity = '1',
  RemoveLiquidity = '2',
  Collect = '3',
  Purge = '4',
}

export function uniswapV3LiquidityPositionAddLiquidityArgs({
  nftId,
  amount0Desired,
  amount1Desired,
  amount0Min,
  amount1Min,
}: {
  nftId: BigNumberish;
  amount0Desired: BigNumberish;
  amount1Desired: BigNumberish;
  amount0Min: BigNumberish;
  amount1Min: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
    [nftId, amount0Desired, amount1Desired, amount0Min, amount1Min],
  );
}

export function uniswapV3LiquidityPositionCollectArgs({ nftId }: { nftId: BigNumberish }) {
  return encodeArgs(['uint256'], [nftId]);
}

export function uniswapV3LiquidityPositionInitArgs({ token0, token1 }: { token0: AddressLike; token1: AddressLike }) {
  return encodeArgs(['address', 'address'], [token0, token1]);
}

export function uniswapV3LiquidityPositionMintArgs({
  fee,
  tickLower,
  tickUpper,
  amount0Desired,
  amount1Desired,
  amount0Min,
  amount1Min,
}: {
  fee: BigNumberish;
  tickLower: BigNumberish;
  tickUpper: BigNumberish;
  amount0Desired: BigNumberish;
  amount1Desired: BigNumberish;
  amount0Min: BigNumberish;
  amount1Min: BigNumberish;
}) {
  return encodeArgs(
    ['uint24', 'int24', 'int24', 'uint256', 'uint256', 'uint256', 'uint256'],
    [fee, tickLower, tickUpper, amount0Desired, amount1Desired, amount0Min, amount1Min],
  );
}

export function uniswapV3LiquidityPositionPurgeArgs({
  nftId,
  liquidity,
  amount0Min,
  amount1Min,
}: {
  nftId: BigNumberish;
  liquidity: BigNumberish;
  amount0Min: BigNumberish;
  amount1Min: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint128', 'uint256', 'uint256'], [nftId, liquidity, amount0Min, amount1Min]);
}

export function uniswapV3LiquidityPositionRemoveLiquidityArgs({
  nftId,
  liquidity,
  amount0Min,
  amount1Min,
}: {
  nftId: BigNumberish;
  liquidity: BigNumberish;
  amount0Min: BigNumberish;
  amount1Min: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint128', 'uint256', 'uint256'], [nftId, liquidity, amount0Min, amount1Min]);
}
