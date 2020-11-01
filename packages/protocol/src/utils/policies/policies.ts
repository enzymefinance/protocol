import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function adapterBlacklistArgs(adapters: AddressLike[]) {
  return encodeArgs(['address[]'], [adapters]);
}

export function adapterWhitelistArgs(adapters: AddressLike[]) {
  return encodeArgs(['address[]'], [adapters]);
}

export function assetBlacklistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export function assetWhitelistArgs(assets: AddressLike[]) {
  return encodeArgs(['address[]'], [assets]);
}

export function buySharesPriceFeedToleranceArgs(tolerance: BigNumberish) {
  return encodeArgs(['uint256'], [tolerance]);
}

export function investorWhitelistArgs({
  investorsToAdd = [],
  investorsToRemove = [],
}: {
  investorsToAdd?: AddressLike[];
  investorsToRemove?: AddressLike[];
} = {}) {
  return encodeArgs(
    ['address[]', 'address[]'],
    [investorsToAdd, investorsToRemove],
  );
}

export function maxConcentrationArgs(maxConcentration: BigNumberish) {
  return encodeArgs(['uint256'], [maxConcentration]);
}
