import { ethers } from 'ethers';

export interface PolicyParams {
  address: string;
  encoding: (string | ethers.utils.ParamType)[];
  settings: any[];
}

export async function assetBlacklistPolicy(
  blacklist: string[],
  address: string,
): Promise<PolicyParams> {
  return {
    address: ethers.utils.getAddress(address),
    encoding: ['address[]'],
    settings: [blacklist.map((item) => ethers.utils.getAddress(item))],
  };
}

export function assetWhitelistPolicy(
  whitelist: string[],
  address: string,
): PolicyParams {
  return {
    address: ethers.utils.getAddress(address),
    encoding: ['address[]'],
    settings: [whitelist.map((item) => ethers.utils.getAddress(item))],
  };
}

export function userWhitelistPolicy(
  whitelist: string[],
  address: string,
): PolicyParams {
  return {
    address: ethers.utils.getAddress(address),
    encoding: ['address[]'],
    settings: [whitelist.map((item) => ethers.utils.getAddress(item))],
  };
}
