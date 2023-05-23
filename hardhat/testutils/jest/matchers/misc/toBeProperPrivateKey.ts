import { matcherHint } from 'jest-matcher-utils';

export function toBeProperPrivateKey(this: jest.MatcherContext, received: string) {
  const pass = new RegExp('^0x[0-9-a-fA-F]{64}$').test(received);
  const message = () => matcherHint('.toBeProperPrivateKey', received, undefined, this);

  return { message, pass };
}
