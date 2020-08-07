import { utils, BigNumberish } from 'ethers';

export interface FeeParams {
  address: string;
  encoding: (string | utils.ParamType)[];
  settings: any[];
}

export async function dummyFee(
  address: string
): Promise<FeeParams> {
  return {
    address: utils.getAddress(address),
    encoding: [],
    settings: [],
  };
}

export async function managementFee(
  address: string,
  rate: BigNumberish
): Promise<FeeParams> {
  return {
    address: utils.getAddress(address),
    encoding: ['uint256'],
    settings: [rate],
  };
}

export async function performanceFee(
  address: string,
  rate: BigNumberish,
  period: BigNumberish,
): Promise<FeeParams> {
  return {
    address: utils.getAddress(address),
    encoding: ['uint256', 'uint256'],
    settings: [rate, period],
  };
}
