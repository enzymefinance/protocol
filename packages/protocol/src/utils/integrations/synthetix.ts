import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export function synthetixRedeemArgs({ synths }: { synths: AddressLike[] }) {
  return encodeArgs(['address[]'], [synths]);
}

export function synthetixTakeOrderArgs({
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
