import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

import { forceFail } from '../utils';

export type MatcherCallback = (values: BigNumber[]) => jest.CustomMatcherResult;

export function ensureBigNumbers(values: BigNumberish[], invert: boolean, callback: MatcherCallback) {
  const converted = values.map((item) => convertToBigNumberMaybe(item));

  if (converted.some((item) => item === undefined)) {
    return forceFail('The received value is not numberish', invert);
  }

  return callback(converted.filter((value) => BigNumber.isBigNumber(value)) as BigNumber[]);
}

function convertToBigNumberMaybe(value: unknown): BigNumber | undefined {
  try {
    return BigNumber.from(value);
  } catch {
    return undefined;
  }
}
