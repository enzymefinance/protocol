import type { ContractReceipt } from '@enzymefinance/ethers';
import { extractEvent } from '@enzymefinance/ethers';
import type { utils } from 'ethers';

export function assertEvent<TResult = any>(
  receipt: ContractReceipt<any>,
  event: string | utils.EventFragment,
  match?: TResult,
) {
  const events = extractEvent(receipt, event);
  expect(events.length).toBe(1);
  expect(receipt).toHaveEmittedWith(event, match);

  const args = events.shift()?.args;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return (args as unknown as typeof match)!;
}

export function assertNoEvent(receipt: ContractReceipt<any>, event: string | utils.EventFragment) {
  const events = extractEvent(receipt, event);
  expect(events.length).toBe(0);
}
