import { matcherHint } from 'jest-matcher-utils';

import { isTransactionReceipt } from '../../utils';

export function toBeReceipt(this: jest.MatcherContext, received: any) {
  const pass = isTransactionReceipt(received);
  const message = () => matcherHint('.toBeReceipt', undefined, undefined, this);

  return { message, pass };
}
