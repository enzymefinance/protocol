import { AddressLike } from '@enzymefinance/ethers';
import { BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export enum IntegrationManagerActionId {
  CallOnIntegration = '0',
  AddTrackedAssetsToVault = '1',
  RemoveTrackedAssetsFromVault = '2',
}

export function addTrackedAssetsToVaultArgs({ assets }: { assets: AddressLike[] }) {
  return encodeArgs(['address[]'], [assets]);
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
