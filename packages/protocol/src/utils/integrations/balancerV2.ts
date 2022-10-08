import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { encodeArgs } from '../encoding';

export enum BalancerV2StablePoolJoinKind {
  INIT = 0,
  EXACT_TOKENS_IN_FOR_BPT_OUT,
  TOKEN_IN_FOR_EXACT_BPT_OUT,
  ALL_TOKENS_IN_FOR_EXACT_BPT_OUT,
  ADD_TOKEN,
}

export enum BalancerV2WeightedPoolJoinKind {
  INIT = 0,
  EXACT_TOKENS_IN_FOR_BPT_OUT,
  TOKEN_IN_FOR_EXACT_BPT_OUT,
  ALL_TOKENS_IN_FOR_EXACT_BPT_OUT,
  ADD_TOKEN,
}

export enum BalancerV2WeightedPoolExitKind {
  EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0,
  EXACT_BPT_IN_FOR_TOKENS_OUT,
  BPT_IN_FOR_EXACT_TOKENS_OUT,
  REMOVE_TOKEN,
}

export interface BalancerV2PoolBalanceChange {
  assets: AddressLike[];
  limits: BigNumberish[];
  userData: BytesLike;
  useInternalBalance: boolean;
}

export const balancerV2PoolBalanceChangeTuple = utils.ParamType.fromString(
  `tuple(address[] assets, uint256[] limits, bytes userData, bool useInternalBalance)`,
);

export function balancerV2GetPoolFromId(id: BytesLike) {
  return utils.hexlify(BigNumber.from(id).shr(12 * 8));
}

export function balancerV2LendArgs({
  poolId,
  minIncomingBptAmount,
  spendAssets,
  spendAssetAmounts,
  request,
}: {
  poolId: BytesLike;
  minIncomingBptAmount: BigNumberish;
  spendAssets: AddressLike[];
  spendAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
}) {
  return encodeArgs(
    ['bytes32', 'uint256', 'address[]', 'uint256[]', balancerV2PoolBalanceChangeTuple],
    [poolId, minIncomingBptAmount, spendAssets, spendAssetAmounts, request],
  );
}

export function balancerV2RedeemArgs({
  poolId,
  bptAmount,
  incomingAssets,
  minIncomingAssetAmounts,
  request,
}: {
  poolId: BytesLike;
  bptAmount: BigNumberish;
  incomingAssets: AddressLike[];
  minIncomingAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
}) {
  return encodeArgs(
    ['bytes32', 'uint256', 'address[]', 'uint256[]', balancerV2PoolBalanceChangeTuple],
    [poolId, bptAmount, incomingAssets, minIncomingAssetAmounts, request],
  );
}

// Weighted pools

export function balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut({
  bptAmountIn,
  tokenIndex,
}: {
  bptAmountIn: BigNumberish;
  tokenIndex: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256', 'uint256'],
    [BalancerV2WeightedPoolExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptAmountIn, tokenIndex],
  );
}

export function balancerV2WeightedPoolsUserDataExactBptInForTokensOut({ bptAmountIn }: { bptAmountIn: BigNumberish }) {
  return encodeArgs(['uint8', 'uint256'], [BalancerV2WeightedPoolExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT, bptAmountIn]);
}

export function balancerV2WeightedPoolsUserDataExactTokensInForBptOut({
  amountsIn,
  bptOut,
}: {
  amountsIn: BigNumberish[];
  bptOut: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256[]', 'uint256'],
    [BalancerV2WeightedPoolJoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amountsIn, bptOut],
  );
}

export function balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
  bptAmountOut,
  tokenIndex,
}: {
  bptAmountOut: BigNumberish;
  tokenIndex: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256', 'uint256'],
    [BalancerV2WeightedPoolJoinKind.TOKEN_IN_FOR_EXACT_BPT_OUT, bptAmountOut, tokenIndex],
  );
}

// Stable pools

export function balancerV2StablePoolsUserDataTokenInForExactBptOut({
  bptAmountOut,
  tokenIndex,
}: {
  bptAmountOut: BigNumberish;
  tokenIndex: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256', 'uint256'],
    [BalancerV2StablePoolJoinKind.TOKEN_IN_FOR_EXACT_BPT_OUT, bptAmountOut, tokenIndex],
  );
}
