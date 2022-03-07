import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum AaveDebtPositionActionId {
  AddCollateralAssets = '0',
  RemoveCollateralAssets = '1',
  BorrowAsset = '2',
  RepayBorrowedAssets = '3',
  ClaimRewards = '4',
}

export function aaveDebtPositionAddCollateralArgs({
  aTokens,
  amounts,
}: {
  aTokens: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [aTokens, amounts]);
}

export function aaveDebtPositionBorrowArgs({ tokens, amounts }: { tokens: AddressLike[]; amounts: BigNumberish[] }) {
  return encodeArgs(['address[]', 'uint256[]'], [tokens, amounts]);
}

export function aaveDebtPositionClaimStkAaveArgs({ assets }: { assets: AddressLike[] }) {
  return encodeArgs(['address[]'], [assets]);
}

export function aaveDebtPositionRemoveCollateralArgs({
  aTokens,
  amounts,
}: {
  aTokens: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [aTokens, amounts]);
}

export function aaveDebtPositionRepayBorrowArgs({
  tokens,
  amounts,
}: {
  tokens: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [tokens, amounts]);
}
