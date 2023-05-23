import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum LiquityDebtPositionActionId {
  OpenTrove = '0',
  AddCollateral = '1',
  RemoveCollateral = '2',
  Borrow = '3',
  Repay = '4',
  CloseTrove = '5',
}

export function liquityDebtPositionAddCollateralArgs({
  collateralAmount,
  upperHint,
  lowerHint,
}: {
  collateralAmount: BigNumberish;
  upperHint: AddressLike;
  lowerHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'address', 'address'], [collateralAmount, upperHint, lowerHint]);
}

export function liquityDebtPositionBorrowArgs({
  maxFeePercentage,
  lusdAmount,
  upperHint,
  lowerHint,
}: {
  maxFeePercentage: BigNumberish;
  lusdAmount: BigNumberish;
  upperHint: AddressLike;
  lowerHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'uint256', 'address', 'address'], [maxFeePercentage, lusdAmount, upperHint, lowerHint]);
}

export function liquityDebtPositionOpenTroveArgs({
  maxFeePercentage,
  collateralAmount,
  lusdAmount,
  upperHint,
  lowerHint,
}: {
  maxFeePercentage: BigNumberish;
  collateralAmount: BigNumberish;
  lusdAmount: BigNumberish;
  upperHint: AddressLike;
  lowerHint: AddressLike;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'address', 'address'],
    [maxFeePercentage, collateralAmount, lusdAmount, upperHint, lowerHint],
  );
}

export function liquityDebtPositionRemoveCollateralArgs({
  collateralAmount,
  upperHint,
  lowerHint,
}: {
  collateralAmount: BigNumberish;
  upperHint: AddressLike;
  lowerHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'address', 'address'], [collateralAmount, upperHint, lowerHint]);
}

export function liquityDebtPositionRepayBorrowArgs({
  lusdAmount,
  upperHint,
  lowerHint,
}: {
  lusdAmount: BigNumberish;
  upperHint: AddressLike;
  lowerHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'address', 'address'], [lusdAmount, upperHint, lowerHint]);
}
