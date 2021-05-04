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
  debtPositionProxy,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  cTokens: AddressLike[];
  amounts: BigNumberish[];
  debtPositionProxy: AddressLike;
}) {
  const protocol = 0;

  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPositionProxy,
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
  debtPositionProxy,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  amounts: BigNumberish[];
  debtPositionProxy: AddressLike;
  cTokens: AddressLike[];
}) {
  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPositionProxy,
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
  debtPositionProxy,
  assets,
  amounts,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  debtPositionProxy: AddressLike;
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
    debtPositionProxy,
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
  debtPositionProxy,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  assets: AddressLike[];
  amounts: BigNumberish[];
  debtPositionProxy: AddressLike;
  cTokens: AddressLike[];
}) {
  const actionArgs = debtPositionActionArgs({
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({
    debtPositionProxy,
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
  debtPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  debtPositionProxy: AddressLike;
}) {
  const actionArgs = debtPositionRemoveArgs({
    debtPositionProxy,
  });

  const callArgs = debtPositionCallArgs({ debtPositionProxy, protocol, encodedCallArgs: actionArgs });

  const removeDebtPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.RemoveDebtPosition, callArgs);

  return removeDebtPositionTx;
}
