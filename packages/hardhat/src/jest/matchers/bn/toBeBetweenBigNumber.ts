import type { BigNumberish } from 'ethers';
import { matcherHint } from 'jest-matcher-utils';

import { ensureBigNumbers } from './utils';

export function toBeBetweenBigNumber(
  this: jest.MatcherContext,
  received: BigNumberish,
  min: BigNumberish,
  max: BigNumberish,
) {
  return ensureBigNumbers([received, min, max], this.isNot, ([received, min, max]) => {
    const pass = received.gte(min) && received.lte(max);
    const message = () => matcherHint('.toBeBetweenBigNumber', `${received}`, `>= ${min} && <= ${max}`, this);

    return { message, pass };
  });
}
