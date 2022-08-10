import { resolveArguments } from '@enzymefinance/ethers';
import type { utils } from 'ethers';
import { diff } from 'jest-diff';
import { matcherHint } from 'jest-matcher-utils';

import { resolveParamMatchers } from '../helpers';
import { forceFail } from '../utils';

export function toMatchEventArgs(this: jest.MatcherContext, received: utils.LogDescription, expected?: any) {
  const invert = this.isNot;
  let receivedParams: any;
  let expectedMatchers: any;

  const types = received.eventFragment.inputs;

  try {
    receivedParams = resolveArguments(types, received.args);
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
    ? () => matcherHint('.toMatchEventArgs', undefined, undefined, this)
    : () => {
        const suffix = diff(receivedParams, expectedMatchers);

        return `${matcherHint('.toMatchEventArgs', undefined, undefined, this)}\n\n${suffix}`;
      };

  return { message, pass };
}
