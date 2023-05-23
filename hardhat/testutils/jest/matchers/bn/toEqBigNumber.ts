import type { BigNumberish } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toEqBigNumber(this: jest.MatcherContext, received: BigNumberish, expected: BigNumberish) {
  return ensureBigNumbers([received, expected], this.isNot ?? false, ([received, expected]) => {
    const pass = received.eq(expected);
    const message = () => matcherHint('.toEqBigNumber', `${received}`, `${expected}`, this);

    return { message, pass };
  });
}
