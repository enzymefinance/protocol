import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { encodeArgs } from '../encoding';

export enum BalancerV2SwapKind {
  GIVEN_IN = 0,
  GIVEN_OUT,
}

export enum BalancerV2StablePoolJoinKind {
  INIT = 0,
  EXACT_TOKENS_IN_FOR_BPT_OUT,
  TOKEN_IN_FOR_EXACT_BPT_OUT,
  ALL_TOKENS_IN_FOR_EXACT_BPT_OUT,
}

export enum BalancerV2StablePoolExitKind {
  EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0,
  EXACT_BPT_IN_FOR_TOKENS_OUT,
  BPT_IN_FOR_EXACT_TOKENS_OUT,
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

export interface BalancerV2BatchSwapStep {
  poolId: BytesLike;
  assetInIndex: BigNumberish;
  assetOutIndex: BigNumberish;
  amount: BigNumberish;
  userData: BytesLike;
}

export interface BalancerV2PoolBalanceChange {
  assets: AddressLike[];
  limits: BigNumberish[];
  userData: BytesLike;
  useInternalBalance: boolean;
}

export const balancerV2BatchSwapStepTuple = utils.ParamType.fromString(
  `tuple(bytes32 poolId, uint256 assetInIndex, uint256 assetOutIndex, uint256 amount, bytes userData)`,
);

export const balancerV2BatchSwapStepTupleArray = `${balancerV2BatchSwapStepTuple.format('full')}[]`;

export const balancerV2PoolBalanceChangeTuple = utils.ParamType.fromString(
  `tuple(address[] assets, uint256[] limits, bytes userData, bool useInternalBalance)`,
);

export function balancerV2GetPoolFromId(id: BytesLike) {
  return utils.hexlify(BigNumber.from(id).shr(12 * 8));
}

// Individual actions

export function balancerV2ClaimRewardsArgs({ stakingToken }: { stakingToken: AddressLike }) {
  return encodeArgs(['address'], [stakingToken]);
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

export function balancerV2LendAndStakeArgs({
  stakingToken,
  poolId,
  minIncomingBptAmount,
  spendAssets,
  spendAssetAmounts,
  request,
}: {
  stakingToken: AddressLike;
  poolId: BytesLike;
  minIncomingBptAmount: BigNumberish;
  spendAssets: AddressLike[];
  spendAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
}) {
  return encodeArgs(
    ['address', 'bytes32', 'uint256', 'address[]', 'uint256[]', balancerV2PoolBalanceChangeTuple],
    [stakingToken, poolId, minIncomingBptAmount, spendAssets, spendAssetAmounts, request],
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

export function balancerV2StakeArgs({
  stakingToken,
  bptAmount,
}: {
  stakingToken: AddressLike;
  bptAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [stakingToken, bptAmount]);
}

export function balancerV2TakeOrderArgs({
  swapKind,
  swaps,
  assets,
  limits,
  stakingTokens,
}: {
  swapKind: BalancerV2SwapKind;
  swaps: BalancerV2BatchSwapStep[];
  assets: AddressLike[];
  limits: BigNumberish[];
  stakingTokens: AddressLike[];
}) {
  return encodeArgs(
    ['uint8', balancerV2BatchSwapStepTupleArray, 'address[]', 'int256[]', 'address[]'],
    [swapKind, swaps, assets, limits, stakingTokens],
  );
}

export function balancerV2UnstakeArgs({
  stakingToken,
  bptAmount,
}: {
  stakingToken: AddressLike;
  bptAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [stakingToken, bptAmount]);
}

export function balancerV2UnstakeAndRedeemArgs({
  stakingToken,
  poolId,
  bptAmount,
  incomingAssets,
  minIncomingAssetAmounts,
  request,
}: {
  stakingToken: AddressLike;
  poolId: BytesLike;
  bptAmount: BigNumberish;
  incomingAssets: AddressLike[];
  minIncomingAssetAmounts: BigNumberish[];
  request: BalancerV2PoolBalanceChange;
}) {
  return encodeArgs(
    ['address', 'bytes32', 'uint256', 'address[]', 'uint256[]', balancerV2PoolBalanceChangeTuple],
    [stakingToken, poolId, bptAmount, incomingAssets, minIncomingAssetAmounts, request],
  );
}

// Weighted pools

// exits

export function balancerV2WeightedPoolsUserDataBptInForExactTokensOut({
  amountsOut,
  maxBPTAmountIn,
}: {
  amountsOut: BigNumberish[];
  maxBPTAmountIn: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256[]', 'uint256'],
    [BalancerV2WeightedPoolExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT, amountsOut, maxBPTAmountIn],
  );
}

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

// joins

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

// exits

export function balancerV2StablePoolsUserDataExactBptInForOneTokenOut({
  bptAmountIn,
  tokenIndex,
}: {
  bptAmountIn: BigNumberish;
  tokenIndex: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256', 'uint256'],
    [BalancerV2StablePoolExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptAmountIn, tokenIndex],
  );
}

export function balancerV2StablePoolsUserDataExactBptInForTokensOut({ bptAmountIn }: { bptAmountIn: BigNumberish }) {
  return encodeArgs(['uint8', 'uint256'], [BalancerV2StablePoolExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT, bptAmountIn]);
}

// joins

export function balancerV2StablePoolsUserDataExactTokensInForBptOut({
  amountsIn,
  bptOut,
}: {
  amountsIn: BigNumberish[];
  bptOut: BigNumberish;
}) {
  return encodeArgs(
    ['uint8', 'uint256[]', 'uint256'],
    [BalancerV2StablePoolJoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amountsIn, bptOut],
  );
}

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
