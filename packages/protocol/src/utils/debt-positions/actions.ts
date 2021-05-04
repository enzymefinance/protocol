import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../../../../protocol/src';

export enum DebtPositionManagerActionId {
  CreateDebtPosition,
  CallOnDebtPosition,
  RemoveDebtPosition,
}

export enum DebtPositionActionId {
  AddCollateralAssets,
  RemoveCollateralAssets,
  BorrowAsset,
  RepayBorrowedAssets,
}

export enum DebtPositionProtocolId {
  CompoundDebtPosition,
}

export function debtPositionActionArgs({
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

export function debtPositionCallArgs({
  debtPositionProxy = randomAddress(),
  protocol,
  actionId = 0,
  encodedCallArgs,
}: {
  debtPositionProxy?: AddressLike;
  protocol: Number;
  actionId?: Number;
  encodedCallArgs: BytesLike;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256', 'bytes'],
    [debtPositionProxy, protocol, actionId, encodedCallArgs],
  );
}

export function debtPositionRemoveArgs({ debtPositionProxy }: { debtPositionProxy: AddressLike }) {
  return encodeArgs(['address'], [debtPositionProxy]);
}
