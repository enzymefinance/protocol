import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManager,
  VaultLib,
  callOnExternalPositionArgs,
  compoundExternalPositionActionArgs,
  ExternalPositionManagerActionId,
  CompoundDebtPositionActionId,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';
import { createExternalPosition } from './actions';

// TODO: re-namespace all functions with `CompoundDebtPosition`

export async function createCompoundDebtPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
}) {
  return createExternalPosition({
    signer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.CompoundDebtPosition,
  });
}

export async function addCollateral({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
  assets,
  amounts,
  externalPositionProxy,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  cTokens: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = compoundExternalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = callOnExternalPositionArgs({
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.AddCollateralAssets,
    encodedCallArgs: actionArgs,
  });

  const addCollateralTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  return addCollateralTx;
}

export async function removeCollateral({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
  assets,
  amounts,
  externalPositionProxy,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
  cTokens: AddressLike[];
}) {
  const actionArgs = compoundExternalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = callOnExternalPositionArgs({
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.RemoveCollateralAssets,
    encodedCallArgs: actionArgs,
  });

  const removeCollateralTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  return removeCollateralTx;
}

export async function borrow({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
  externalPositionProxy,
  assets,
  amounts,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
  externalPositionProxy: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
  cTokens: AddressLike[];
}) {
  const actionArgs = compoundExternalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = callOnExternalPositionArgs({
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.BorrowAsset,
    encodedCallArgs: actionArgs,
  });

  const borrowTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  return borrowTx;
}

export async function claimComp({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = compoundExternalPositionActionArgs({
    assets: [],
    amounts: [],
    data: '0x',
  });

  const callArgs = callOnExternalPositionArgs({
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.ClaimComp,
    encodedCallArgs: actionArgs,
  });

  const claimCompTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  return claimCompTx;
}

export async function repayBorrow({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
  assets,
  amounts,
  externalPositionProxy,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
  cTokens: AddressLike[];
}) {
  const actionArgs = compoundExternalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = callOnExternalPositionArgs({
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.RepayBorrowedAssets,
    encodedCallArgs: actionArgs,
  });

  const repayTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  return repayTx;
}
