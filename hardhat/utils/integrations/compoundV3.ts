import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export function compoundV3ClaimRewardsArgs({ cTokens }: { cTokens: AddressLike[] }) {
  return encodeArgs(['address[]'], [cTokens]);
}

export function compoundV3LendArgs({
  cToken,
  outgoingAssetAmount,
}: {
  cToken: AddressLike;
  outgoingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [cToken, outgoingAssetAmount]);
}

export function compoundV3RedeemArgs({
  cToken,
  outgoingAssetAmount,
}: {
  cToken: AddressLike;
  outgoingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [cToken, outgoingAssetAmount]);
}
