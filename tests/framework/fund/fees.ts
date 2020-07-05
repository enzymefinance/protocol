import { ethers } from 'ethers';
import { fixtures } from '~/framework';
import { resolveAddress } from '~/framework/utils';
import { AddressLike } from '~/framework/types';

export interface FeeParams {
  address: AddressLike;
  rate: ethers.BigNumberish;
  period: ethers.BigNumberish;
}

export async function managementFee(
  rate: number = 0.1,
  period: number = 30,
  address: AddressLike = fixtures.ManagementFee,
): Promise<FeeParams> {
  return {
    address: await resolveAddress(address),
    rate: ethers.utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}

export async function performanceFee(
  rate: number = 0.1,
  period: number = 30,
  address: AddressLike = fixtures.PerformanceFee,
): Promise<FeeParams> {
  return {
    address: await resolveAddress(address),
    rate: ethers.utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}
