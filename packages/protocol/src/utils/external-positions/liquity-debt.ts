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
  lowerHint,
  upperHint,
}: {
  collateralAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'address', 'address'], [collateralAmount, lowerHint, upperHint]);
}

export function liquityDebtPositionBorrowArgs({
  maxFeePercentage,
  lusdAmount,
  lowerHint,
  upperHint,
}: {
  maxFeePercentage: BigNumberish;
  lusdAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'uint256', 'address', 'address'], [maxFeePercentage, lusdAmount, lowerHint, upperHint]);
}

export function liquityDebtPositionOpenTroveArgs({
  maxFeePercentage,
  collateralAmount,
  lusdAmount,
  lowerHint,
  upperHint,
}: {
  maxFeePercentage: BigNumberish;
  collateralAmount: BigNumberish;
  lusdAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
}) {
  return encodeArgs(
    ['uint256', 'uint256', 'uint256', 'address', 'address'],
    [maxFeePercentage, collateralAmount, lusdAmount, lowerHint, upperHint],
  );
}

export function liquityDebtPositionRemoveCollateralArgs({
  collateralAmount,
  lowerHint,
  upperHint,
}: {
  collateralAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'address', 'address'], [collateralAmount, lowerHint, upperHint]);
}

export function liquityDebtPositionRepayBorrowArgs({
  lusdAmount,
  lowerHint,
  upperHint,
}: {
  lusdAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
}) {
  return encodeArgs(['uint256', 'address', 'address'], [lusdAmount, lowerHint, upperHint]);
}
