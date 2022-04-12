import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum MapleLiquidityPositionActionId {
  Lend = '0',
  IntendToRedeem = '1',
  Redeem = '2',
  Stake = '3',
  Unstake = '4',
  ClaimInterest = '5',
  ClaimRewards = '6',
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

export function mapleLiquidityPositionRedeemArgs({
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
