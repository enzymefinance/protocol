import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';
import { utils } from 'ethers';

import { encodeArgs } from '../encoding';
import { calcAmountDueForScaledPerSecondRate, convertRateToScaledPerSecondRate } from '../rates';

export enum ArbitraryLoanPositionActionId {
  ConfigureLoan = '0',
  UpdateBorrowableAmount = '1',
  CallOnAccountingModule = '2',
  Reconcile = '3',
  CloseLoan = '4',
}

export function arbitraryLoanPositionCloseLoanArgs({ extraAssetsToSweep }: { extraAssetsToSweep: AddressLike[] }) {
  return encodeArgs(['address[]'], [extraAssetsToSweep]);
}

export function arbitraryLoanPositionConfigureLoanArgs({
  borrower,
  loanAsset,
  amount,
  accountingModule,
  accountingModuleConfigData,
  description,
}: {
  borrower: AddressLike;
  loanAsset: AddressLike;
  amount: BigNumberish;
  accountingModule: AddressLike;
  accountingModuleConfigData: BytesLike;
  description: string;
}) {
  return encodeArgs(
    ['address', 'address', 'uint256', 'address', 'bytes', 'bytes32'],
    [borrower, loanAsset, amount, accountingModule, accountingModuleConfigData, utils.formatBytes32String(description)],
  );
}

export function arbitraryLoanPositionReconcileArgs({ extraAssetsToSweep }: { extraAssetsToSweep: AddressLike[] }) {
  return encodeArgs(['address[]'], [extraAssetsToSweep]);
}

export function arbitraryLoanPositionUpdateBorrowableAmountArgs({ amountDelta }: { amountDelta: BigNumberish }) {
  return encodeArgs(['int256'], [amountDelta]);
}

// ACCOUNTING MODULES

export function arbitraryLoanInterestConvertRateToScaledPerSecondRate(rate: BigNumberish) {
  return convertRateToScaledPerSecondRate({ rate, adjustInflation: false });
}

export function arbitraryLoanScaledPerSecondInterestDue({
  scaledPerSecondRate,
  secondsSinceLastSettled,
  loanBalance,
}: {
  scaledPerSecondRate: BigNumberish;
  secondsSinceLastSettled: BigNumberish;
  loanBalance: BigNumberish;
}) {
  return calcAmountDueForScaledPerSecondRate({
    scaledPerSecondRate,
    totalAmount: loanBalance,
    secondsSinceLastSettled,
  });
}

// ArbitraryLoanFixedInterestModule

export enum ArbitraryLoanFixedInterestModuleRepaymentTrackingType {
  None = '0',
  PrincipalFirst = '1',
  InterestFirst = '2',
}

export function arbitraryLoanFixedInterestModuleConfigArgs({
  scaledPerSecondRatePreMaturity,
  scaledPerSecondRatePostMaturity,
  maturity,
  repaymentTrackingType,
  faceValueIsPrincipalOnly,
}: {
  scaledPerSecondRatePreMaturity: BigNumberish;
  scaledPerSecondRatePostMaturity: BigNumberish;
  maturity: BigNumberish;
  repaymentTrackingType: BigNumberish;
  faceValueIsPrincipalOnly: boolean;
}) {
  return encodeArgs(
    ['uint96', 'uint96', 'uint32', 'uint8', 'bool'],
    [
      scaledPerSecondRatePreMaturity,
      scaledPerSecondRatePostMaturity,
      maturity,
      repaymentTrackingType,
      faceValueIsPrincipalOnly,
    ],
  );
}

// ArbitraryLoanTotalNominalDeltaOracleModule

export function arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs({
  oracle,
  stalenessThreshold,
}: {
  oracle: AddressLike;
  stalenessThreshold: BigNumberish;
}) {
  return encodeArgs(['address', 'uint32'], [oracle, stalenessThreshold]);
}
