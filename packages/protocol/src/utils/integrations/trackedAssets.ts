import { AddressLike } from '@enzymefinance/ethers';
import { encodeArgs } from '../encoding';

export function addTrackedAssetsArgs(incomingAssets: AddressLike[]) {
  return encodeArgs(['address[]'], [incomingAssets]);
}
