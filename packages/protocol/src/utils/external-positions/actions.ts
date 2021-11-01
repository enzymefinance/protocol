import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export enum ExternalPositionManagerActionId {
  CreateExternalPosition = '0',
  CallOnExternalPosition = '1',
  RemoveExternalPosition = '2',
  ReactivateExternalPosition = '3',
}

export enum CompoundDebtPositionActionId {
  AddCollateralAssets = '0',
  RemoveCollateralAssets = '1',
  BorrowAsset = '2',
  RepayBorrowedAssets = '3',
  ClaimComp = '4',
}

export enum MockGenericExternalPositionActionId {
  AddManagedAssets = '0',
  RemoveManagedAssets = '1',
  AddDebtAssets = '2',
  RemoveDebtAssets = '3',
}

export enum ExternalPositionProtocolId {
  CompoundDebtPosition = '0',
}

export function callOnExternalPositionArgs({
  externalPositionProxy = randomAddress(),
  actionId,
  actionArgs,
}: {
  externalPositionProxy?: AddressLike;
  actionId: BigNumberish;
  actionArgs: BytesLike;
}) {
  return encodeArgs(['address', 'uint256', 'bytes'], [externalPositionProxy, actionId, actionArgs]);
}

export function externalPositionReactivateArgs({ externalPositionProxy }: { externalPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [externalPositionProxy]);
}

export function externalPositionRemoveArgs({ externalPositionProxy }: { externalPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [externalPositionProxy]);
}

export function compoundExternalPositionActionArgs({
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

export function mockGenericExternalPositionActionArgs({
  assets,
  amounts,
}: {
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [assets, amounts]);
}
