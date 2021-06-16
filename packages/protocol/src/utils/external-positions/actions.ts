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
  protocol,
  actionId = 0,
  encodedCallArgs,
}: {
  externalPositionProxy?: AddressLike;
  protocol: Number;
  actionId?: Number;
  encodedCallArgs: BytesLike;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256', 'bytes'],
    [externalPositionProxy, protocol, actionId, encodedCallArgs],
  );
}

export function externalPositionRemoveArgs({ externalPositionProxy }: { externalPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [externalPositionProxy]);
}
