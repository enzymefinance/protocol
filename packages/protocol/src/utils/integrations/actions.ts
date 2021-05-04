import { AddressLike } from '@enzymefinance/ethers';
import { BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export enum IntegrationManagerActionId {
  CallOnIntegration,
  AddTrackedAssetsToVault,
  RemoveTrackedAssetsFromVault,
}

export function addTrackedAssetsToVaultArgs({
  assets,
  setAsPersistentlyTracked,
}: {
  assets: AddressLike[];
  setAsPersistentlyTracked: boolean[];
}) {
  return encodeArgs(['address[]', 'bool[]'], [assets, setAsPersistentlyTracked]);
}

export function callOnIntegrationArgs({
  adapter,
  selector,
  encodedCallArgs,
}: {
  adapter: AddressLike;
  selector: BytesLike;
  encodedCallArgs: BytesLike;
}) {
  return encodeArgs(['address', 'bytes4', 'bytes'], [adapter, selector, encodedCallArgs]);
}

export function removeTrackedAssetsFromVaultArgs({ assets }: { assets: AddressLike[] }) {
  return encodeArgs(['address[]'], [assets]);
}
