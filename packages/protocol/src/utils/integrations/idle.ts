import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function idleApproveAssetsArgs({
  idleToken,
  assets,
  amounts,
}: {
  idleToken: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address', 'address[]', 'uint256[]'], [idleToken, assets, amounts]);
}

export function idleClaimRewardsArgs({ idleToken }: { idleToken: AddressLike }) {
  return encodeArgs(['address'], [idleToken]);
}

export function idleClaimRewardsAndReinvestArgs({
  idleToken,
  minIncomingIdleTokenAmount,
  useFullBalances,
}: {
  idleToken: AddressLike;
  minIncomingIdleTokenAmount: BigNumberish;
  useFullBalances: boolean;
}) {
  return encodeArgs(['address', 'uint256', 'bool'], [idleToken, minIncomingIdleTokenAmount, useFullBalances]);
}

export function idleClaimRewardsAndSwapArgs({
  idleToken,
  incomingAsset,
  minIncomingAssetAmount,
  useFullBalances,
}: {
  idleToken: AddressLike;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
  useFullBalances: boolean;
}) {
  return encodeArgs(
    ['address', 'address', 'uint256', 'bool'],
    [idleToken, incomingAsset, minIncomingAssetAmount, useFullBalances],
  );
}

export function idleLendArgs({
  idleToken,
  outgoingUnderlyingAmount,
  minIncomingIdleTokenAmount,
}: {
  idleToken: AddressLike;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingIdleTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [idleToken, outgoingUnderlyingAmount, minIncomingIdleTokenAmount],
  );
}

export function idleRedeemArgs({
  idleToken,
  outgoingIdleTokenAmount,
  minIncomingUnderlyingAmount,
}: {
  idleToken: AddressLike;
  outgoingIdleTokenAmount: BigNumberish;
  minIncomingUnderlyingAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [idleToken, outgoingIdleTokenAmount, minIncomingUnderlyingAmount],
  );
}
