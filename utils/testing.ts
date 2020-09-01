import { utils } from 'ethers';
import { extractEvent, ContractReceipt } from '@crestproject/crestproject';

export async function assertEvent<TResult = any>(
  tx: ContractReceipt<any> | Promise<ContractReceipt<any>>,
  event: string | utils.EventFragment,
  match?: TResult,
) {
  await expect(tx).resolves.toBeReceipt();

  const receipt = await tx;
  const events = extractEvent(receipt, event);
  expect(events.length).toBe(1);

  const args = events.shift()?.args;
  if (match != null) {
    expect(args).toMatchObject(match);
  }

  return (args as typeof match)!;
}
