import { matcherHint } from 'jest-matcher-utils';

import { extractRevertReason } from './toBeRevertedWith';

export function toBeReverted(this: jest.MatcherContext, received: any) {
  const reason = extractRevertReason(received);

  if (reason === undefined) {
    throw new Error(`Failed to extract revert reason ${received}`);
  }

  const pass = /^(Error|Panic)\(.*\)$/i.test(reason);
  const message = () => matcherHint('.toBeReverted', reason, undefined, this);

  return { message, pass };
}
