import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../..';

export enum ExternalPositionManagerActionId {
  CreateExternalPosition,
  CallOnExternalPosition,
  RemoveExternalPosition,
}

export enum ExternalPositionActionId {
  AddCollateralAssets,
  RemoveCollateralAssets,
  BorrowAsset,
  RepayBorrowedAssets,
}

export enum ExternalPositionProtocolId {
  CompoundDebtPosition,
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
  actionId = 0,
  encodedCallArgs,
}: {
  externalPositionProxy?: AddressLike;
  actionId?: Number;
  encodedCallArgs: BytesLike;
}) {
  return encodeArgs(['address', 'uint256', 'bytes'], [externalPositionProxy, actionId, encodedCallArgs]);
}

export function externalPositionRemoveArgs({ externalPositionProxy }: { externalPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [externalPositionProxy]);
}
