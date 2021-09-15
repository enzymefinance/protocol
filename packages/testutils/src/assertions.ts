import { ContractReceipt, ensureEvent, extractEvent, SendFunction } from '@enzymefinance/ethers';
import { utils } from 'ethers';

export function assertEvent<TResult = any>(
  receipt: ContractReceipt<SendFunction<any, any>>,
  event: string | utils.EventFragment,
  match?: TResult,
) {
  const fragment = ensureEvent(event, receipt.function.contract.abi);
  const events = extractEvent(receipt, fragment);

  if (!events.length) {
    throw new Error(`Receipt does not contain events matching the signature signature ${fragment.format()}`);
  }

  if (events.length > 1) {
    throw new Error(`Receipt contains multiple events matching the signature signature ${fragment.format()}`);
  }

  const args = events.shift()?.args;
  return (args as unknown as typeof match)!;
}

export function assertNoEvent(receipt: ContractReceipt<SendFunction<any, any>>, event: string | utils.EventFragment) {
  const fragment = ensureEvent(event, receipt.function.contract.abi);
  const events = extractEvent(receipt, event);

  if (events.length > 0) {
    throw new Error(`Receipt contains ${events.length} event matching the signature ${fragment.format()}`);
  }
}
