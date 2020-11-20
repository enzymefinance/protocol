import { BigNumberish, Signer, utils } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import { ISynthetixAddressResolver } from '../../contracts';
import { encodeArgs } from '../encoding';

export async function synthetixResolveAddress({
  addressResolver,
  name,
  signer,
}: {
  addressResolver: AddressLike;
  name: string;
  signer: Signer;
}) {
  const synthetixAddressResolver: ISynthetixAddressResolver = new ISynthetixAddressResolver(addressResolver, signer);
  return synthetixAddressResolver.requireAndGetAddress(utils.formatBytes32String(name), `Missing ${name}`);
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
