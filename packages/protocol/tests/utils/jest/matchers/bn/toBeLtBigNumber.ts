import type { BigNumberish } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toBeLtBigNumber(this: jest.MatcherContext, received: BigNumberish, expected: BigNumberish) {
  return ensureBigNumbers([received, expected], this.isNot, ([received, expected]) => {
    const pass = received.lt(expected);
    const message = () => matcherHint('.toBeLtBigNumber', `${received}`, `${expected}`, this);

    return { message, pass };
  });
}
