import type { BigNumberish } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toBeLteBigNumber(this: jest.MatcherContext, received: BigNumberish, expected: BigNumberish) {
  return ensureBigNumbers([received, expected], this.isNot ?? false, ([received, expected]) => {
    const pass = received.lte(expected);
    const message = () => matcherHint('.toBeLteBigNumber', `${received}`, `${expected}`, this);

    return { message, pass };
  });
}
