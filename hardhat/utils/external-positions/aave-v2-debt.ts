import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum AaveV2DebtPositionActionId {
  AddCollateralAssets = '0',
  RemoveCollateralAssets = '1',
  BorrowAsset = '2',
  RepayBorrowedAssets = '3',
  ClaimRewards = '4',
}

export function aaveV2DebtPositionAddCollateralArgs({
  aTokens,
  amounts,
}: {
  aTokens: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [aTokens, amounts]);
}

export function aaveV2DebtPositionBorrowArgs({ tokens, amounts }: { tokens: AddressLike[]; amounts: BigNumberish[] }) {
  return encodeArgs(['address[]', 'uint256[]'], [tokens, amounts]);
}

export function aaveV2DebtPositionClaimRewardsArgs({ assets }: { assets: AddressLike[] }) {
  return encodeArgs(['address[]'], [assets]);
}

export function aaveV2DebtPositionRemoveCollateralArgs({
  aTokens,
  amounts,
}: {
  aTokens: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [aTokens, amounts]);
}

export function aaveV2DebtPositionRepayBorrowArgs({
  tokens,
  amounts,
}: {
  tokens: AddressLike[];
  amounts: BigNumberish[];
}) {
  return encodeArgs(['address[]', 'uint256[]'], [tokens, amounts]);
}
