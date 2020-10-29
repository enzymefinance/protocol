import { BigNumberish } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import { encodeArgs } from '../utils/common';

// Note: arguments are valid for both Lend and Redeem functions
export async function compoundArgs({
  outgoingAsset,
  incomingAsset,
  outgoingAssetAmount,
  minIncomingAssetAmount,
}: {
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'address', 'uint256'],
    [outgoingAsset, outgoingAssetAmount, incomingAsset, minIncomingAssetAmount],
  );
}
