import { CallFunction, resolveArguments, SendFunction } from '@enzymefinance/ethers';
import type { utils } from 'ethers';
import { diff } from 'jest-diff';
import { matcherHint } from 'jest-matcher-utils';

import { forceFail } from '../../utils';
import { resolveFunctionFragment, resolveParamMatchers } from '../helpers';

export function toMatchFunctionOutput(
  this: jest.MatcherContext,
  received: any,
  fragment: CallFunction<any> | SendFunction<any> | utils.FunctionFragment | string,
  expected?: any,
) {
  const invert = this.isNot;
  let resolvedFragment: utils.FunctionFragment;
  let receivedParams: any;
  let expectedMatchers: any;

  try {
    if (SendFunction.isSendFunction(fragment) || CallFunction.isCallFunction(fragment)) {
      resolvedFragment = fragment.fragment;
    } else {
      resolvedFragment = resolveFunctionFragment(fragment);
    }
  } catch (e) {
    return forceFail(`Failed to resolve function fragment: ${e}`, invert);
  }

  if (!resolvedFragment.outputs) {
    const formatted = resolvedFragment.format('full');

    return forceFail(`The function fragment does not have any output signature: ${formatted}`, invert);
  }

  const types = resolvedFragment.outputs;

  try {
    const params = types.length === 1 ? types[0] : types;

    receivedParams = resolveArguments(params, received);
  } catch (e) {
    return forceFail(`Failed to resolve received arguments: ${e}`, invert);
  }

  try {
    const params = types.length === 1 ? types[0] : types;

    expectedMatchers = resolveParamMatchers(params, expected);
  } catch (e) {
    return forceFail(`Failed to resolve expected matchers: ${e}`, invert);
  }

  const pass = this.equals(receivedParams, expectedMatchers);
  const message = pass
    ? () => matcherHint('.toMatchFunctionOutput', undefined, undefined, this)
    : () => {
        const suffix = diff(receivedParams, expectedMatchers);

        return `${matcherHint('.toMatchFunctionOutput', undefined, undefined, this)}\n\n${suffix}`;
      };

  return { message, pass };
}
