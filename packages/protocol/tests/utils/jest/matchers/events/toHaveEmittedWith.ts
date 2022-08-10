import type { ContractReceipt } from '@enzymefinance/ethers';
import { extractEvent, resolveArguments } from '@enzymefinance/ethers';
import type { utils } from 'ethers';
import { diff } from 'jest-diff';
import { matcherHint } from 'jest-matcher-utils';

import { resolveEventFragment, resolveParamMatchers } from '../helpers';
import { forceFail } from '../utils';

export function toHaveEmittedWith(
  this: jest.MatcherContext,
  receipt: ContractReceipt,
  event: utils.EventFragment | string,
  expected: any,
): jest.CustomMatcherResult {
  const invert = this.isNot;
  let resolvedFragment: utils.EventFragment;
  let expectedMatchers: any;

  try {
    resolvedFragment = resolveEventFragment(receipt.function.contract, event);
  } catch (e) {
    return forceFail(`Failed to resolve event fragment: ${e}`, invert);
  }

  const types = resolvedFragment.inputs;

  try {
    expectedMatchers = resolveParamMatchers(types, expected);
  } catch (e) {
    return forceFail(`Failed to resolve expected matchers: ${e}`, invert);
  }

  const events = extractEvent(receipt, resolvedFragment);
  const args = events.map((event) => {
    return resolveArguments(types, event.args);
  });

  const matcher = expect.arrayContaining([expectedMatchers]);
  const pass = this.equals(args, matcher);
  const signature = resolvedFragment.format('full');

  const message = pass
    ? () => matcherHint('.toHaveEmittedWith', signature, undefined, this)
    : () => {
        const suffix = diff(args[args.length - 1], expectedMatchers);

        return `${matcherHint('.toHaveEmittedWith', signature, undefined, this)}\n\n${suffix}`;
      };

  return { message, pass };
}
