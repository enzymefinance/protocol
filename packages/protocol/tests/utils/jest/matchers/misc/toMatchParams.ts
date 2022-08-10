import { resolveArguments } from '@enzymefinance/ethers';
import type { utils } from 'ethers';
import { diff } from 'jest-diff';
import { matcherHint } from 'jest-matcher-utils';

import { resolveParamMatchers } from '../helpers';
import { forceFail } from '../utils';

export function toMatchParams(
  this: jest.MatcherContext,
  received: any,
  types: utils.ParamType | utils.ParamType[],
  expected: any,
) {
  const invert = this.isNot;
  let receivedParams: any;
  let expectedMatchers: any;

  const printed = Array.isArray(types) ? types.map((type) => type.format('full')).join(', ') : types.format('full');

  try {
    receivedParams = resolveArguments(types, received);
  } catch (e) {
    return forceFail(`Failed to resolve received arguments: ${e}`, invert);
  }

  try {
    expectedMatchers = resolveParamMatchers(types, expected);
  } catch (e) {
    return forceFail(`Failed to resolve received arguments: ${e}`, invert);
  }

  const pass = this.equals(receivedParams, expectedMatchers);
  const message = pass
    ? () => matcherHint('.toMatchParams', printed, undefined, this)
    : () => `${matcherHint('.toMatchParams', printed, undefined, this)}\n\n${diff(receivedParams, expectedMatchers)}`;

  return { message, pass };
}
