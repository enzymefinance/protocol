import { BigNumberish } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import { encodeArgs } from '../encoding';

export function compoundArgs({
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
