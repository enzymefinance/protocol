import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  DebtPositionManager,
  VaultLib,
  debtPositionCallArgs,
  debtPositionActionArgs,
  debtPositionRemoveArgs,
  DebtPositionManagerActionId,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';

const protocol = 0;

export async function createDebtPosition({
  comptrollerProxy,
  debtPositionManager,
  fundOwner,
  protocol,
}: {
  comptrollerProxy: ComptrollerLib;
  debtPositionManager: DebtPositionManager;
  fundOwner: SignerWithAddress;
  protocol: Number;
}) {
  const callArgs = debtPositionCallArgs({ protocol, encodedCallArgs: '0x00' });

  const createDebtPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CreateDebtPosition, callArgs);

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
    debtPosition,
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({ protocol, encodedCallArgs: actionArgs });

  const addCollateralTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.AddCollateralAssets, callArgs);

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
    debtPosition,
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({ protocol, encodedCallArgs: actionArgs });

  const removeCollateralTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.RemoveCollateralAssets, callArgs);

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
    debtPosition,
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({ protocol, encodedCallArgs: actionArgs });

  const borrowTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.BorrowAsset, callArgs);

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
    debtPosition,
    assets,
    amounts,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  const callArgs = debtPositionCallArgs({ protocol, encodedCallArgs: actionArgs });

  const repayTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.RepayBorrowedAssets, callArgs);

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

  const callArgs = debtPositionCallArgs({ protocol, encodedCallArgs: actionArgs });

  const removeDebtPositionTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(debtPositionManager, DebtPositionManagerActionId.RemoveDebtPosition, callArgs);

  return removeDebtPositionTx;
}
