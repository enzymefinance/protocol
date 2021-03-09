import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, utils } from 'ethers';
import { encodeArgs } from '../encoding';
import { sighash } from '../sighash';

export const curveMinterMintSelector = sighash(utils.FunctionFragment.fromString('mint(address)'));

export const curveMinterMintManySelector = sighash(utils.FunctionFragment.fromString('mint_many(address[8])'));

export const curveMinterToggleApproveMintSelector = sighash(
  utils.FunctionFragment.fromString('toggle_approve_mint(address)'),
);

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
