import type { ContractReceipt } from '@enzymefinance/ethers';
import { extractEvent } from '@enzymefinance/ethers';
import { utils } from 'ethers';
import { matcherHint, printExpected, printReceived } from 'jest-matcher-utils';

export function toHaveEmitted(
  this: jest.MatcherContext,
  receipt: ContractReceipt,
  event: utils.EventFragment | string,
): jest.CustomMatcherResult {
  const abi = receipt.function.contract.abi;
  const fragment = utils.EventFragment.isEventFragment(event) ? event : abi.getEvent(event);

  const matches = extractEvent(receipt, fragment);
  const signature = fragment.format('full');
  const pass = !!matches.length;
  const message = pass
    ? () =>
        `${matcherHint('.toHaveEmitted', undefined, undefined, this)}\n\n` +
        `Expected event not to have been emitted\n` +
        `  ${printExpected(signature)}\n` +
        `Actual:\n` +
        `  ${printReceived(`Event was emitted ${matches.length} times`)}`
    : () =>
        `${matcherHint('.toHaveEmitted', undefined, undefined, this)}\n\n` +
        `Expected event to have been emitted\n` +
        `  ${printExpected(signature)}\n` +
        `Actual:\n` +
        `  ${printReceived(`Event was emitted ${matches.length} times`)}`;

  return { message, pass };
}
