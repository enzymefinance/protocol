import { matcherHint } from 'jest-matcher-utils';

export function toBeRevertedWith(this: jest.MatcherContext, received: any, match: RegExp | string) {
  const error = received.message;
  const isReverted = error && error.search('revert') >= 0;
  const isThrown = error && error.search('invalid opcode') >= 0;
  const isError = error && error.search('code=') >= 0;
  // eslint-disable-next-line eqeqeq
  const isMatch = error && error.match(match) != null;

  const pass = (isReverted || isThrown || isError) && isMatch;
  const message = () => matcherHint('.toBeRevertedWith', error, `${match}`, this);

  return { message, pass };
}
