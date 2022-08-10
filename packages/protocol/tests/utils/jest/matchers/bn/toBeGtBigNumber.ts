import type { BigNumberish } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toBeGtBigNumber(this: jest.MatcherContext, received: BigNumberish, expected: BigNumberish) {
  return ensureBigNumbers([received, expected], this.isNot, ([received, expected]) => {
    const pass = received.gt(expected);
    const message = () => matcherHint('.toBeGtBigNumber', `${received}`, `${expected}`, this);

    return { message, pass };
  });
}
