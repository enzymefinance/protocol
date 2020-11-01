import { AddressLike } from '@crestproject/crestproject';
import { encodeArgs } from '../encoding';

export function addTrackedAssetsArgs(incomingAssets: AddressLike[]) {
  return encodeArgs(['address[]'], [incomingAssets]);
}
