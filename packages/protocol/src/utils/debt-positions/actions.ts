import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish, BytesLike } from 'ethers';
import { encodeArgs } from '../../../../protocol/src';

export enum DebtPositionManagerActionId {
  CreateDebtPosition,
  RemoveDebtPosition,
  AddCollateralAssets,
  RemoveCollateralAssets,
  BorrowAsset,
  RepayBorrowedAssets,
}

export enum DebtPositionProtocolId {
  CompoundDebtPosition,
}

export function debtPositionRemoveArgs({ debtPosition }: { debtPosition: AddressLike }) {
  return encodeArgs(['address'], [debtPosition]);
}

export function debtPositionCallArgs({ protocol, encodedCallArgs }: { protocol: Number; encodedCallArgs: BytesLike }) {
  return encodeArgs(['uint256', 'bytes'], [protocol, encodedCallArgs]);
}

export function debtPositionActionArgs({
  assets,
  amounts,
  debtPosition,
  data,
}: {
  debtPosition: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
  data: BytesLike;
}) {
  return encodeArgs(['address', 'address[]', 'uint256[]', 'bytes'], [debtPosition, assets, amounts, data]);
}
