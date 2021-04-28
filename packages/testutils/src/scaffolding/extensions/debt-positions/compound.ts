import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  DebtPositionManager,
  VaultLib,
  debtPositionCallArgs,
  debtPositionActionArgs,
  DebtPositionManagerActionId,
  DebtPositionActionId,
  debtPositionRemoveArgs,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';

const protocol = 0;

export async function createDebtPosition({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
}) {
  const createDebtPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CreateDebtPosition, '0x00');
  return createDebtPositionTx;
}

export async function addCollateral({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
  assets,
  amounts,
  debtPosition,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  cTokens: AddressLike[];
  amounts: BigNumberish[];
  debtPosition: AddressLike;
}) {
  const protocol = 0;

  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPosition,
    protocol,
    actionId: DebtPositionActionId.AddCollateralAssets,
    encodedCallArgs: actionArgs,
  });

  const addCollateralTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CallOnDebtPosition, callArgs);

  return addCollateralTx;
}

export async function removeCollateral({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
  assets,
  amounts,
  debtPosition,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  amounts: BigNumberish[];
  debtPosition: AddressLike;
  cTokens: AddressLike[];
}) {
  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPosition,
    protocol,
    actionId: DebtPositionActionId.RemoveCollateralAssets,
    encodedCallArgs: actionArgs,
  });

  const removeCollateralTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CallOnDebtPosition, callArgs);

  return removeCollateralTx;
}

export async function borrow({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
  debtPosition,
  assets,
  amounts,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  debtPosition: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
  cTokens: AddressLike[];
}) {
  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPosition,
    protocol,
    actionId: DebtPositionActionId.BorrowAsset,
    encodedCallArgs: actionArgs,
  });

  const borrowTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CallOnDebtPosition, callArgs);

  return borrowTx;
}

export async function repayBorrow({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
  assets,
  amounts,
  debtPosition,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  amounts: BigNumberish[];
  debtPosition: AddressLike;
  cTokens: AddressLike[];
}) {
  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPosition,
    protocol,
    actionId: DebtPositionActionId.RepayBorrowedAssets,
    encodedCallArgs: actionArgs,
  });

  const repayTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CallOnDebtPosition, callArgs);

  return repayTx;
}

export async function removeDebtPosition({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
  debtPosition,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  debtPosition: AddressLike;
}) {
  const actionArgs = debtPositionRemoveArgs({
    debtPosition,
  });

  const callArgs = debtPositionCallArgs({ debtPosition, protocol, encodedCallArgs: actionArgs });

  const removeDebtPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.RemoveDebtPosition, callArgs);

  return removeDebtPositionTx;
}
