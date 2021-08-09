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
  externalPositionRemoveArgs,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';

const protocol = 0;

export async function createExternalPosition({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
}) {
  const createExternalPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      externalPositionManager,
      ExternalPositionManagerActionId.CreateExternalPosition,
      encodeArgs(['uint256', 'bytes'], [protocol, '0x']),
    );
  return createExternalPositionTx;
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

export async function removeExternalPosition({
  comptrollerProxy,
  externalPositionManager,
  fundOwner,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  fundOwner: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = externalPositionRemoveArgs({
    externalPositionProxy,
  });

  const callArgs = callOnExternalPositionArgs({ externalPositionProxy, encodedCallArgs: actionArgs });

  const removeExternalPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.RemoveExternalPosition, callArgs);

  return removeExternalPositionTx;
}
