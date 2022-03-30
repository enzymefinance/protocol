import { matcherHint } from 'jest-matcher-utils';

export function toBeProperAddress(this: jest.MatcherContext, received: string) {
  const pass = new RegExp('^0x[0-9-a-fA-F]{40}$').test(received);
  const message = () => matcherHint('.toBeProperAddress', received, undefined, this);

  return { message, pass };
}
