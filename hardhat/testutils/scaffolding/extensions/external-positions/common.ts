import type { AddressLike, ContractReceipt } from '@enzymefinance/ethers';
import { extractEvent, resolveAddress } from '@enzymefinance/ethers';
import { ExternalPositionManager } from '@enzymefinance/protocol';

export function assertExternalPositionAssetsToReceive({
  receipt,
  assets,
}: {
  receipt: ContractReceipt<any>;
  assets: AddressLike[];
}) {
  const eventFragment = ExternalPositionManager.abi.getEvent('CallOnExternalPositionExecutedForFund');
  const events = extractEvent(receipt, eventFragment);

  expect(events.length).toBe(1);
  expect(events[0].args.assetsToReceive).toEqual(assets.map((asset) => resolveAddress(asset)));
}
