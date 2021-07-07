import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManager,
  VaultLib,
  externalPositionCallArgs,
  externalPositionActionArgs,
  ExternalPositionManagerActionId,
  ExternalPositionActionId,
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
  const actionArgs = externalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = externalPositionCallArgs({
    externalPositionProxy,
    actionId: ExternalPositionActionId.AddCollateralAssets,
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
  const actionArgs = externalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = externalPositionCallArgs({
    externalPositionProxy,
    actionId: ExternalPositionActionId.RemoveCollateralAssets,
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
  const actionArgs = externalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = externalPositionCallArgs({
    externalPositionProxy,
    actionId: ExternalPositionActionId.BorrowAsset,
    encodedCallArgs: actionArgs,
  });

  const borrowTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CallOnExternalPosition, callArgs);

  return borrowTx;
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
  const actionArgs = externalPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = externalPositionCallArgs({
    externalPositionProxy,
    actionId: ExternalPositionActionId.RepayBorrowedAssets,
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

  const callArgs = externalPositionCallArgs({ externalPositionProxy, encodedCallArgs: actionArgs });

  const removeExternalPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.RemoveExternalPosition, callArgs);

  return removeExternalPositionTx;
}
