import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../..';

export enum ExternalPositionManagerActionId {
  CreateExternalPosition = '0',
  CallOnExternalPosition = '1',
  RemoveExternalPosition = '2',
  ReactivateExternalPosition = '3',
}

export enum ExternalPositionActionId {
  AddCollateralAssets = '0',
  RemoveCollateralAssets = '1',
  BorrowAsset = '2',
  RepayBorrowedAssets = '3',
}

export enum ExternalPositionProtocolId {
  CompoundDebtPosition = '0',
}

export function externalPositionActionArgs({
  assets,
  amounts,
  data,
}: {
  assets: AddressLike[];
  amounts: BigNumberish[];
  data: BytesLike;
}) {
  return encodeArgs(['address[]', 'uint256[]', 'bytes'], [assets, amounts, data]);
}

export function externalPositionCallArgs({
  externalPositionProxy = randomAddress(),
  actionId = ExternalPositionActionId.AddCollateralAssets,
  encodedCallArgs,
}: {
  externalPositionProxy?: AddressLike;
  actionId?: ExternalPositionActionId;
  encodedCallArgs: BytesLike;
}) {
  return encodeArgs(['address', 'uint256', 'bytes'], [externalPositionProxy, actionId, encodedCallArgs]);
}

export function externalPositionReactivateArgs({ externalPositionProxy }: { externalPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [externalPositionProxy]);
}

export function externalPositionRemoveArgs({ externalPositionProxy }: { externalPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [externalPositionProxy]);
}
