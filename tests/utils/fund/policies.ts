import { utils } from 'ethers';

export interface PolicyParams {
  address: string;
  encoding: (string | utils.ParamType)[];
  settings: any[];
}

export async function assetBlacklistPolicy(
  blacklist: string[],
  address: string,
): Promise<PolicyParams> {
  return {
    address: utils.getAddress(address),
    encoding: ['address[]'],
    settings: [blacklist.map((item) => utils.getAddress(item))],
  };
}

export function assetWhitelistPolicy(
  whitelist: string[],
  address: string,
): PolicyParams {
  return {
    address: utils.getAddress(address),
    encoding: ['address[]'],
    settings: [whitelist.map((item) => utils.getAddress(item))],
  };
}

export function userWhitelistPolicy(
  whitelist: string[],
  address: string,
): PolicyParams {
  return {
    address: utils.getAddress(address),
    encoding: ['address[]'],
    settings: [whitelist.map((item) => utils.getAddress(item))],
  };
}
