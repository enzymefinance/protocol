import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export function synthetixRedeemArgs({ synths }: { synths: AddressLike[] }) {
  return encodeArgs(['address[]'], [synths]);
}

export function synthetixTakeOrderArgs({
  minIncomingSusdAmount,
  outgoingAsset,
  outgoingAssetAmount,
}: {
  minIncomingSusdAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'address', 'uint256'], [minIncomingSusdAmount, outgoingAsset, outgoingAssetAmount]);
}
