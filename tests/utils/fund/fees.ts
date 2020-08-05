import { BigNumberish, utils } from 'ethers';

export interface FeeParams {
  address: string;
  rate: BigNumberish;
  period: BigNumberish;
}

export function managementFee(
  rate: number = 0.1,
  period: number = 30,
  address: string,
): FeeParams {
  return {
    address: utils.getAddress(address),
    rate: utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}

export function performanceFee(
  rate: number = 0.1,
  period: number = 30,
  address: string,
): FeeParams {
  return {
    address: utils.getAddress(address),
    rate: utils.parseEther(`${rate}`),
    period: 60 * 60 * 24 * period,
  };
}
