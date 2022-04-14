import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum MapleLiquidityPositionActionId {
  Lend = '0',
  LendAndStake = '1',
  IntendToRedeem = '2',
  Redeem = '3',
  Stake = '4',
  Unstake = '5',
  UnstakeAndRedeem = '6',
  ClaimInterest = '7',
  ClaimRewards = '8',
}

export function mapleLiquidityPositionClaimInterestArgs({ pool }: { pool: AddressLike }) {
  return encodeArgs(['address'], [pool]);
}

export function mapleLiquidityPositionClaimRewardsArgs({ rewardsContract }: { rewardsContract: AddressLike }) {
  return encodeArgs(['address'], [rewardsContract]);
}

export function mapleLiquidityPositionIntendToRedeemArgs({ pool }: { pool: AddressLike }) {
  return encodeArgs(['address'], [pool]);
}

export function mapleLiquidityPositionLendArgs({
  liquidityAsset,
  pool,
  liquidityAssetAmount,
}: {
  liquidityAsset: AddressLike;
  pool: AddressLike;
  liquidityAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [liquidityAsset, pool, liquidityAssetAmount]);
}

export function mapleLiquidityPositionLendAndStakeArgs({
  liquidityAsset,
  pool,
  rewardsContract,
  liquidityAssetAmount,
}: {
  liquidityAsset: AddressLike;
  pool: AddressLike;
  rewardsContract: AddressLike;
  liquidityAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'address', 'address', 'uint256'],
    [liquidityAsset, pool, rewardsContract, liquidityAssetAmount],
  );
}

export function mapleLiquidityPositionRedeemArgs({
  pool,
  liquidityAssetAmount,
}: {
  pool: AddressLike;
  liquidityAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [pool, liquidityAssetAmount]);
}

export function mapleLiquidityPositionStakeArgs({
  rewardsContract,
  pool,
  poolTokenAmount,
}: {
  rewardsContract: AddressLike;
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [rewardsContract, pool, poolTokenAmount]);
}

export function mapleLiquidityPositionUnstakeArgs({
  rewardsContract,
  poolTokenAmount,
}: {
  rewardsContract: AddressLike;
  poolTokenAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [rewardsContract, poolTokenAmount]);
}

export function mapleLiquidityPositionUnstakeAndRedeemArgs({
  pool,
  rewardsContract,
  poolTokenAmount,
}: {
  pool: AddressLike;
  rewardsContract: AddressLike;
  poolTokenAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [pool, rewardsContract, poolTokenAmount]);
}
