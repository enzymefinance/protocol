import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManager,
  VaultLib,
  compoundExternalPositionActionArgs,
  CompoundDebtPositionActionId,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';
import { callOnExternalPosition, createExternalPosition } from './actions';

export async function compoundDebtPositionAddCollateral({
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

  return callOnExternalPosition({
    signer: fundOwner,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.AddCollateralAssets,
    actionArgs,
  });
}

export async function compoundDebtPositionBorrow({
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

  return callOnExternalPosition({
    signer: fundOwner,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.BorrowAsset,
    actionArgs,
  });
}

export async function compoundDebtPositionClaimComp({
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

  return callOnExternalPosition({
    signer: fundOwner,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.ClaimComp,
    actionArgs,
  });
}

export async function compoundDebtPositionRemoveCollateral({
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

  return callOnExternalPosition({
    signer: fundOwner,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.RemoveCollateralAssets,
    actionArgs,
  });
}

export async function compoundDebtPositionRepayBorrow({
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

  return callOnExternalPosition({
    signer: fundOwner,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: CompoundDebtPositionActionId.RepayBorrowedAssets,
    actionArgs,
  });
}

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
