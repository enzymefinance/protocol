import { matcherHint } from 'jest-matcher-utils';

export function toBeReverted(this: jest.MatcherContext, received: any) {
  const error = received?.message;
  const isReverted = error?.search('revert') >= 0;
  const isThrown = error?.search('invalid opcode') >= 0;
  const isError = error?.search('code=') >= 0;

  const pass = isReverted || isThrown || isError;
  const message = () => matcherHint('.toBeReverted', undefined, error, this);

  return { message, pass };
}
