import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';

import { encodeArgs } from '../encoding';

// exchanges

export function curveTakeOrderArgs({
  pool,
  outgoingAsset,
  outgoingAssetAmount,
  incomingAsset,
  minIncomingAssetAmount,
}: {
  pool: AddressLike;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'address', 'uint256', 'address', 'uint256'],
    [pool, outgoingAsset, outgoingAssetAmount, incomingAsset, minIncomingAssetAmount],
  );
}

// combined liquidity

export enum CurveRedeemType {
  Standard = '0',
  OneCoin = '1',
}

export function curveClaimRewardsArgs({ stakingToken }: { stakingToken: AddressLike }) {
  return encodeArgs(['address'], [stakingToken]);
}

export function curveIncomingAssetsDataRedeemOneCoinArgs({
  incomingAssetPoolIndex,
  minIncomingAssetAmount,
}: {
  incomingAssetPoolIndex: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [incomingAssetPoolIndex, minIncomingAssetAmount]);
}

export function curveIncomingAssetsDataRedeemStandardArgs({
  orderedMinIncomingAssetAmounts,
}: {
  orderedMinIncomingAssetAmounts: BigNumberish[];
}) {
  return encodeArgs(['uint256[]'], [orderedMinIncomingAssetAmounts]);
}

export function curveLendAndStakeArgs({
  pool,
  orderedOutgoingAssetAmounts,
  incomingStakingToken,
  minIncomingStakingTokenAmount,
  useUnderlyings,
}: {
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  incomingStakingToken: AddressLike;
  minIncomingStakingTokenAmount: BigNumberish;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['address', 'uint256[]', 'address', 'uint256', 'bool'],
    [pool, orderedOutgoingAssetAmounts, incomingStakingToken, minIncomingStakingTokenAmount, useUnderlyings],
  );
}

export function curveLendArgs({
  pool,
  orderedOutgoingAssetAmounts,
  minIncomingLpTokenAmount,
  useUnderlyings,
}: {
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  minIncomingLpTokenAmount: BigNumberish;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['address', 'uint256[]', 'uint256', 'bool'],
    [pool, orderedOutgoingAssetAmounts, minIncomingLpTokenAmount, useUnderlyings],
  );
}

export function curveRedeemArgs({
  pool,
  outgoingLpTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  pool: AddressLike;
  outgoingLpTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  return encodeArgs(
    ['address', 'uint256', 'bool', 'uint8', 'bytes'],
    [pool, outgoingLpTokenAmount, useUnderlyings, redeemType, incomingAssetData],
  );
}

export function curveStakeArgs({
  pool,
  incomingStakingToken,
  amount,
}: {
  pool: AddressLike;
  incomingStakingToken: AddressLike;
  amount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [pool, incomingStakingToken, amount]);
}

export function curveUnstakeAndRedeemArgs({
  pool,
  outgoingStakingToken,
  outgoingStakingTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  pool: AddressLike;
  outgoingStakingToken: AddressLike;
  outgoingStakingTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  return encodeArgs(
    ['address', 'address', 'uint256', 'bool', 'uint8', 'bytes'],
    [pool, outgoingStakingToken, outgoingStakingTokenAmount, useUnderlyings, redeemType, incomingAssetData],
  );
}

export function curveUnstakeArgs({
  pool,
  outgoingStakingToken,
  amount,
}: {
  pool: AddressLike;
  outgoingStakingToken: AddressLike;
  amount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [pool, outgoingStakingToken, amount]);
}
