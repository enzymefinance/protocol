import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function kyberTakeOrderArgs({
  incomingAsset,
  minIncomingAssetAmount,
  outgoingAsset,
  outgoingAssetAmount,
}: {
  incomingAsset: AddressLike;
  minIncomingAssetAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'address', 'uint256'],
    [incomingAsset, minIncomingAssetAmount, outgoingAsset, outgoingAssetAmount],
  );
}
