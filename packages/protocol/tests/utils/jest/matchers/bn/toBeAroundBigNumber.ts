import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toBeAroundBigNumber(
  this: jest.MatcherContext,
  received: BigNumberish,
  expected: BigNumberish,
  tolerance: BigNumberish = 0.1,
) {
  return ensureBigNumbers([received, expected], this.isNot, ([received, expected]) => {
    if (BigNumber.isBigNumber(tolerance) || Number.isInteger(tolerance)) {
      return toBeAroundBigNumberAbsolute.call(this, received, expected, BigNumber.from(tolerance));
    }

    const relativeTolerance = parseInt(`${parseFloat(`${tolerance}`) * 100}`, 10);

    if (isNaN(relativeTolerance)) {
      throw new Error('Invalid relative tolerance value');
    }

    const relativeToleranceBn = BigNumber.from(relativeTolerance);

    if (!(relativeToleranceBn.lt(100) && relativeToleranceBn.gte(0))) {
      throw new Error('Invalid relative tolerance value');
    }

    return toBeAroundBigNumberRelative.call(this, received, expected, relativeToleranceBn);
  });
}

function toBeAroundBigNumberRelative(
  this: jest.MatcherContext,
  received: BigNumber,
  expected: BigNumber,
  tolerance: BigNumber,
) {
  const buffer = expected.mul(tolerance).div(100);
  const min = expected.sub(buffer);
  const max = expected.add(buffer);

  const pass = received.lte(max) && received.gte(min);
  const message = () =>
    matcherHint('.toBeAroundBigNumber', `${received}`, `${expected} [tolerance: ${tolerance}%]`, this);

  return { message, pass };
}

function toBeAroundBigNumberAbsolute(
  this: jest.MatcherContext,
  received: BigNumber,
  expected: BigNumber,
  tolerance: BigNumber,
) {
  const min = expected.sub(tolerance);
  const max = expected.add(tolerance);

  const pass = received.lte(max) && received.gte(min);
  const message = () =>
    matcherHint('.toBeAroundBigNumber', `${received}`, `${expected} [tolerance: ${tolerance}]`, this);

  return { message, pass };
}
