import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, utils } from 'ethers';
import { encodeArgs } from '../encoding';
import { sighash } from '../sighash';

export const curveMinterMintSelector = sighash(utils.FunctionFragment.fromString('mint(address)'));

export const curveMinterMintManySelector = sighash(utils.FunctionFragment.fromString('mint_many(address[8])'));

export const curveMinterToggleApproveMintSelector = sighash(
  utils.FunctionFragment.fromString('toggle_approve_mint(address)'),
);

export function curveApproveAssetsArgs({ assets, amounts }: { assets: AddressLike[]; amounts: BigNumberish[] }) {
  return encodeArgs(['address[]', 'uint256[]'], [assets, amounts]);
}

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

// aave pool

export enum CurveAavePoolAssetIndex {
  AaveDai,
  AaveUsdc,
  AaveUsdt,
}

export function curveAaveClaimRewardsAndReinvestArgs({
  useFullBalances,
  minIncomingLiquidityGaugeTokenAmount,
  intermediaryUnderlyingAssetIndex,
}: {
  useFullBalances: boolean;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
  intermediaryUnderlyingAssetIndex: CurveAavePoolAssetIndex;
}) {
  return encodeArgs(
    ['bool', 'uint256', 'uint8'],
    [useFullBalances, minIncomingLiquidityGaugeTokenAmount, intermediaryUnderlyingAssetIndex],
  );
}

export function curveAaveClaimRewardsAndSwapArgs({
  useFullBalances,
  incomingAsset,
  minIncomingAssetAmount,
}: {
  useFullBalances: boolean;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['bool', 'address', 'uint256'], [useFullBalances, incomingAsset, minIncomingAssetAmount]);
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

// eurs pool

export function curveEursLendAndStakeArgs({
  outgoingEursAmount,
  outgoingSeurAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  outgoingEursAmount: BigNumberish;
  outgoingSeurAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256'],
    [outgoingEursAmount, outgoingSeurAmount, minIncomingLiquidityGaugeTokenAmount],
  );
}

export function curveEursLendArgs({
  outgoingEursAmount,
  outgoingSeurAmount,
  minIncomingLPTokenAmount,
}: {
  outgoingEursAmount: BigNumberish;
  outgoingSeurAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256'],
    [outgoingEursAmount, outgoingSeurAmount, minIncomingLPTokenAmount],
  );
}

export function curveEursStakeArgs({ outgoingLPTokenAmount }: { outgoingLPTokenAmount: BigNumberish }) {
  return encodeArgs(['uint256'], [outgoingLPTokenAmount]);
}

export function curveEursRedeemArgs({
  outgoingLPTokenAmount,
  minIncomingEursAmount,
  minIncomingSeurAmount,
  receiveSingleAsset,
}: {
  outgoingLPTokenAmount: BigNumberish;
  minIncomingEursAmount: BigNumberish;
  minIncomingSeurAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'bool'],
    [outgoingLPTokenAmount, minIncomingEursAmount, minIncomingSeurAmount, receiveSingleAsset],
  );
}

export function curveEursUnstakeAndRedeemArgs({
  outgoingLiquidityGaugeTokenAmount,
  minIncomingEursAmount,
  minIncomingSeurAmount,
  receiveSingleAsset,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingEursAmount: BigNumberish;
  minIncomingSeurAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'bool'],
    [outgoingLiquidityGaugeTokenAmount, minIncomingEursAmount, minIncomingSeurAmount, receiveSingleAsset],
  );
}

export function curveEursUnstakeArgs({
  outgoingLiquidityGaugeTokenAmount,
}: {
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(['uint256'], [outgoingLiquidityGaugeTokenAmount]);
}

// sETH pool

export function curveSethClaimRewardsAndReinvestArgs({
  useFullBalances,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  useFullBalances: boolean;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(['bool', 'uint256'], [useFullBalances, minIncomingLiquidityGaugeTokenAmount]);
}

export function curveSethClaimRewardsAndSwapArgs({
  useFullBalances,
  incomingAsset,
  minIncomingAssetAmount,
}: {
  useFullBalances: boolean;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['bool', 'address', 'uint256'], [useFullBalances, incomingAsset, minIncomingAssetAmount]);
}

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

export function curveStethClaimRewardsAndReinvestArgs({
  useFullBalances,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  useFullBalances: boolean;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  return encodeArgs(['bool', 'uint256'], [useFullBalances, minIncomingLiquidityGaugeTokenAmount]);
}

export function curveStethClaimRewardsAndSwapArgs({
  useFullBalances,
  incomingAsset,
  minIncomingAssetAmount,
}: {
  useFullBalances: boolean;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['bool', 'address', 'uint256'], [useFullBalances, incomingAsset, minIncomingAssetAmount]);
}

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
