import { AddressLike } from '@enzymefinance/ethers';
import { BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export enum IntegrationManagerActionId {
  CallOnIntegration,
  AddZeroBalanceTrackedAssets,
  RemoveZeroBalanceTrackedAssets,
}

export function addZeroBalanceTrackedAssetsArgs({ assets }: { assets: AddressLike[] }) {
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

export function removeZeroBalanceTrackedAssetsArgs({ assets }: { assets: AddressLike[] }) {
  return encodeArgs(['address[]'], [assets]);
}
