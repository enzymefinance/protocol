import { matcherHint } from 'jest-matcher-utils';

export function toBeProperHex(this: jest.MatcherContext, received: string, length?: number) {
  // eslint-disable-next-line eqeqeq
  const repeat = length == null ? '*' : `{${length}}`;
  const pass = new RegExp(`^0x[0-9-a-fA-F]${repeat}$`).test(received);
  const message = () =>
    // eslint-disable-next-line eqeqeq
    matcherHint('.toBeProperHex', received, length == null ? undefined : `of length ${length}`, this);

  return { message, pass };
}
