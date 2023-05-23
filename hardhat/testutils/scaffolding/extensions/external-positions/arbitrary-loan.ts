import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ArbitraryLoanPositionActionId,
  arbitraryLoanPositionCloseLoanArgs,
  arbitraryLoanPositionConfigureLoanArgs,
  arbitraryLoanPositionReconcileArgs,
  arbitraryLoanPositionUpdateBorrowableAmountArgs,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export function arbitraryLoanPositionCallOnAccountingModule({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  return callOnExternalPosition({
    actionArgs: '0x',
    actionId: ArbitraryLoanPositionActionId.CallOnAccountingModule,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function arbitraryLoanPositionCloseLoan({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  extraAssetsToSweep = [],
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  extraAssetsToSweep?: AddressLike[];
}) {
  const actionArgs = arbitraryLoanPositionCloseLoanArgs({
    extraAssetsToSweep,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ArbitraryLoanPositionActionId.CloseLoan,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function arbitraryLoanPositionConfigureLoan({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  borrower,
  loanAsset,
  amount,
  accountingModule,
  accountingModuleConfigData,
  description = '',
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  borrower: AddressLike;
  loanAsset: AddressLike;
  amount: BigNumberish;
  accountingModule: AddressLike;
  accountingModuleConfigData: BytesLike;
  description?: string;
}) {
  const actionArgs = arbitraryLoanPositionConfigureLoanArgs({
    borrower,
    loanAsset,
    amount,
    accountingModule,
    accountingModuleConfigData,
    description,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ArbitraryLoanPositionActionId.ConfigureLoan,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function arbitraryLoanPositionReconcile({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  extraAssetsToSweep = [],
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  extraAssetsToSweep?: AddressLike[];
}) {
  const actionArgs = arbitraryLoanPositionReconcileArgs({
    extraAssetsToSweep,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ArbitraryLoanPositionActionId.Reconcile,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function arbitraryLoanPositionUpdateBorrowableAmount({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  amountDelta,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  amountDelta: BigNumberish;
}) {
  const actionArgs = arbitraryLoanPositionUpdateBorrowableAmountArgs({
    amountDelta,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ArbitraryLoanPositionActionId.UpdateBorrowableAmount,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function createArbitraryLoanPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
}) {
  return createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.ArbitraryLoanPosition,
    signer,
  });
}
