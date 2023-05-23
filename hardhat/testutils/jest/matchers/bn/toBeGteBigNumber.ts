import type { BigNumberish } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toBeGteBigNumber(this: jest.MatcherContext, received: BigNumberish, expected: BigNumberish) {
  return ensureBigNumbers([received, expected], this.isNot ?? false, ([received, expected]) => {
    const pass = received.gte(expected);
    const message = () => matcherHint('.toBeGteBigNumber', `${received}`, `${expected}`, this);

    return { message, pass };
  });
}
