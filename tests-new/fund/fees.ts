import { ethers } from 'ethers';

export interface FeeParams {
  address: string;
  rate: ethers.BigNumberish;
  period: ethers.BigNumberish;
}

export function managementFee(
  rate: number = 0.1,
  period: number = 30,
  address: string,
): FeeParams {
  return {
    address: ethers.utils.getAddress(address),
    rate: ethers.utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}

export function performanceFee(
  rate: number = 0.1,
  period: number = 30,
  address: string,
): FeeParams {
  return {
    address: ethers.utils.getAddress(address),
    rate: ethers.utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}
