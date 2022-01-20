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

export function curveClaimRewardsArgs({ gaugeToken }: { gaugeToken: AddressLike }) {
  return encodeArgs(['address'], [gaugeToken]);
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
  incomingGaugeToken,
  minIncomingGaugeTokenAmount,
  useUnderlyings,
}: {
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  incomingGaugeToken: AddressLike;
  minIncomingGaugeTokenAmount: BigNumberish;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['address', 'uint256[]', 'address', 'uint256', 'bool'],
    [pool, orderedOutgoingAssetAmounts, incomingGaugeToken, minIncomingGaugeTokenAmount, useUnderlyings],
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
  incomingGaugeToken,
  amount,
}: {
  pool: AddressLike;
  incomingGaugeToken: AddressLike;
  amount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [pool, incomingGaugeToken, amount]);
}

export function curveUnstakeAndRedeemArgs({
  pool,
  outgoingGaugeToken,
  outgoingGaugeTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  pool: AddressLike;
  outgoingGaugeToken: AddressLike;
  outgoingGaugeTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  return encodeArgs(
    ['address', 'address', 'uint256', 'bool', 'uint8', 'bytes'],
    [pool, outgoingGaugeToken, outgoingGaugeTokenAmount, useUnderlyings, redeemType, incomingAssetData],
  );
}

export function curveUnstakeArgs({
  pool,
  outgoingGaugeToken,
  amount,
}: {
  pool: AddressLike;
  outgoingGaugeToken: AddressLike;
  amount: BigNumberish;
}) {
  return encodeArgs(['address', 'address', 'uint256'], [pool, outgoingGaugeToken, amount]);
}

// aave pool

export enum CurveAavePoolAssetIndex {
  AaveDai = '0',
  AaveUsdc = '1',
  AaveUsdt = '2',
}

export function curveAaveLendAndStakeArgs({
  outgoingAaveDaiAmount,
  outgoingAaveUsdcAmount,
  outgoingAaveUsdtAmount,
  minIncomingLiquidityGaugeTokenAmount,
  useUnderlyings,
}: {
  outgoingAaveDaiAmount: BigNumberish;
  outgoingAaveUsdcAmount: BigNumberish;
  outgoingAaveUsdtAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['uint256[3]', 'uint256', 'bool'],
    [
      [outgoingAaveDaiAmount, outgoingAaveUsdcAmount, outgoingAaveUsdtAmount],
      minIncomingLiquidityGaugeTokenAmount,
      useUnderlyings,
    ],
  );
}

export function curveAaveLendArgs({
  outgoingAaveDaiAmount,
  outgoingAaveUsdcAmount,
  outgoingAaveUsdtAmount,
  minIncomingLPTokenAmount,
  useUnderlyings,
}: {
  outgoingAaveDaiAmount: BigNumberish;
  outgoingAaveUsdcAmount: BigNumberish;
  outgoingAaveUsdtAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['uint256[3]', 'uint256', 'bool'],
    [[outgoingAaveDaiAmount, outgoingAaveUsdcAmount, outgoingAaveUsdtAmount], minIncomingLPTokenAmount, useUnderlyings],
  );
}

export function curveAaveStakeArgs({ outgoingLPTokenAmount }: { outgoingLPTokenAmount: BigNumberish }) {
  return encodeArgs(['uint256'], [outgoingLPTokenAmount]);
}

export function curveAaveRedeemArgs({
  outgoingLPTokenAmount,
  minIncomingAaveDaiAmount,
  minIncomingAaveUsdcAmount,
  minIncomingAaveUsdtAmount,
  receiveSingleAsset,
  useUnderlyings,
}: {
  outgoingLPTokenAmount: BigNumberish;
  minIncomingAaveDaiAmount: BigNumberish;
  minIncomingAaveUsdcAmount: BigNumberish;
  minIncomingAaveUsdtAmount: BigNumberish;
  receiveSingleAsset: boolean;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256[3]', 'bool', 'bool'],
    [
      outgoingLPTokenAmount,
      [minIncomingAaveDaiAmount, minIncomingAaveUsdcAmount, minIncomingAaveUsdtAmount],
      receiveSingleAsset,
      useUnderlyings,
    ],
  );
}

export function curveAaveUnstakeAndRedeemArgs({
  outgoingLiquidityGaugeTokenAmount,
  minIncomingAaveDaiAmount,
  minIncomingAaveUsdcAmount,
  minIncomingAaveUsdtAmount,
  receiveSingleAsset,
  useUnderlyings,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingAaveDaiAmount: BigNumberish;
  minIncomingAaveUsdcAmount: BigNumberish;
  minIncomingAaveUsdtAmount: BigNumberish;
  receiveSingleAsset: boolean;
  useUnderlyings: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256[3]', 'bool', 'bool'],
    [
      outgoingLiquidityGaugeTokenAmount,
      [minIncomingAaveDaiAmount, minIncomingAaveUsdcAmount, minIncomingAaveUsdtAmount],
      receiveSingleAsset,
      useUnderlyings,
    ],
  );
}

export function curveAaveUnstakeArgs({
  outgoingLiquidityGaugeTokenAmount,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(['uint256'], [outgoingLiquidityGaugeTokenAmount]);
}

// sETH pool

export function curveSethLendAndStakeArgs({
  outgoingWethAmount,
  outgoingSethAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  outgoingWethAmount: BigNumberish;
  outgoingSethAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256'],
    [outgoingWethAmount, outgoingSethAmount, minIncomingLiquidityGaugeTokenAmount],
  );
}

export function curveSethLendArgs({
  outgoingWethAmount,
  outgoingSethAmount,
  minIncomingLPTokenAmount,
}: {
  outgoingWethAmount: BigNumberish;
  outgoingSethAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256'],
    [outgoingWethAmount, outgoingSethAmount, minIncomingLPTokenAmount],
  );
}

export function curveSethStakeArgs({ outgoingLPTokenAmount }: { outgoingLPTokenAmount: BigNumberish }) {
  return encodeArgs(['uint256'], [outgoingLPTokenAmount]);
}

export function curveSethRedeemArgs({
  outgoingLPTokenAmount,
  minIncomingWethAmount,
  minIncomingSethAmount,
  receiveSingleAsset,
}: {
  outgoingLPTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingSethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'bool'],
    [outgoingLPTokenAmount, minIncomingWethAmount, minIncomingSethAmount, receiveSingleAsset],
  );
}

export function curveSethUnstakeAndRedeemArgs({
  outgoingLiquidityGaugeTokenAmount,
  minIncomingWethAmount,
  minIncomingSethAmount,
  receiveSingleAsset,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingSethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'bool'],
    [outgoingLiquidityGaugeTokenAmount, minIncomingWethAmount, minIncomingSethAmount, receiveSingleAsset],
  );
}

export function curveSethUnstakeArgs({
  outgoingLiquidityGaugeTokenAmount,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(['uint256'], [outgoingLiquidityGaugeTokenAmount]);
}

// stETH pool

export function curveStethLendAndStakeArgs({
  outgoingWethAmount,
  outgoingStethAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  outgoingWethAmount: BigNumberish;
  outgoingStethAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256'],
    [outgoingWethAmount, outgoingStethAmount, minIncomingLiquidityGaugeTokenAmount],
  );
}

export function curveStethLendArgs({
  outgoingWethAmount,
  outgoingStethAmount,
  minIncomingLPTokenAmount,
}: {
  outgoingWethAmount: BigNumberish;
  outgoingStethAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256'],
    [outgoingWethAmount, outgoingStethAmount, minIncomingLPTokenAmount],
  );
}

export function curveStethStakeArgs({ outgoingLPTokenAmount }: { outgoingLPTokenAmount: BigNumberish }) {
  return encodeArgs(['uint256'], [outgoingLPTokenAmount]);
}

export function curveStethRedeemArgs({
  outgoingLPTokenAmount,
  minIncomingWethAmount,
  minIncomingStethAmount,
  receiveSingleAsset,
}: {
  outgoingLPTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingStethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'bool'],
    [outgoingLPTokenAmount, minIncomingWethAmount, minIncomingStethAmount, receiveSingleAsset],
  );
}

export function curveStethUnstakeAndRedeemArgs({
  outgoingLiquidityGaugeTokenAmount,
  minIncomingWethAmount,
  minIncomingStethAmount,
  receiveSingleAsset,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingStethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'bool'],
    [outgoingLiquidityGaugeTokenAmount, minIncomingWethAmount, minIncomingStethAmount, receiveSingleAsset],
  );
}

export function curveStethUnstakeArgs({
  outgoingLiquidityGaugeTokenAmount,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(['uint256'], [outgoingLiquidityGaugeTokenAmount]);
}
