import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum MapleLiquidityPositionActionId {
  LendV1 = '0',
  LendAndStakeV1 = '1',
  IntendToRedeemV1 = '2',
  RedeemV1 = '3',
  StakeV1 = '4',
  UnstakeV1 = '5',
  UnstakeAndRedeemV1 = '6',
  ClaimInterestV1 = '7',
  ClaimRewardsV1 = '8',
  LendV2 = '9',
  RequestRedeemV2 = '10',
  RedeemV2 = '11',
  CancelRedeemV2 = '12',
}

// V2

export function mapleLiquidityPositionCancelRedeemV2Args({
  pool,
  poolTokenAmount,
}: {
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [pool, poolTokenAmount]);
}

export function mapleLiquidityPositionLendV2Args({
  pool,
  liquidityAssetAmount,
}: {
  pool: AddressLike;
  liquidityAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [pool, liquidityAssetAmount]);
}

export function mapleLiquidityPositionRedeemV2Args({
  pool,
  poolTokenAmount,
}: {
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [pool, poolTokenAmount]);
}

export function mapleLiquidityPositionRequestRedeemV2Args({
  pool,
  poolTokenAmount,
}: {
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [pool, poolTokenAmount]);
}

// V1

export function mapleLiquidityPositionClaimRewardsV1Args({ rewardsContract }: { rewardsContract: AddressLike }) {
  return encodeArgs(['address'], [rewardsContract]);
}
