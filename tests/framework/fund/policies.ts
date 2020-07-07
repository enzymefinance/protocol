import { ethers } from 'ethers';
import { fixtures } from '~/framework';
import { resolveAddress } from '~/framework/utils';
import { AddressLike } from '~/framework/types';

export interface PolicyParams {
  address: AddressLike;
  encoding: (string | ethers.utils.ParamType)[];
  settings: any[];
}

export async function assetBlacklistPolicy(
  blacklist: AddressLike[],
  address: AddressLike = fixtures.AssetBlacklist,
): Promise<PolicyParams> {
  return {
    address: await resolveAddress(address),
    encoding: ['address[]'],
    settings: [
      await Promise.all(blacklist.map((item) => resolveAddress(item))),
    ],
  };
}

export async function assetWhitelistPolicy(
  whitelist: AddressLike[],
  address: AddressLike = fixtures.AssetWhitelist,
): Promise<PolicyParams> {
  return {
    address: await resolveAddress(address),
    encoding: ['address[]'],
    settings: [
      await Promise.all(whitelist.map((item) => resolveAddress(item))),
    ],
  };
}

export async function userWhitelistPolicy(
  whitelist: AddressLike[],
  address: AddressLike = fixtures.UserWhitelist,
): Promise<PolicyParams> {
  return {
    address: await resolveAddress(address),
    encoding: ['address[]'],
    settings: [
      await Promise.all(whitelist.map((item) => resolveAddress(item))),
    ],
  };
}
