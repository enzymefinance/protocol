import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager, VaultLib } from '@enzymefinance/protocol';
import {
  CompoundDebtPositionActionId,
  compoundExternalPositionActionArgs,
  encodeArgs,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

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
    amounts,
    assets,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: CompoundDebtPositionActionId.AddCollateralAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer: fundOwner,
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
    amounts,
    assets,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: CompoundDebtPositionActionId.BorrowAsset,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer: fundOwner,
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
    amounts: [],
    assets: [],
    data: '0x',
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: CompoundDebtPositionActionId.ClaimComp,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer: fundOwner,
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
    amounts,
    assets,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: CompoundDebtPositionActionId.RemoveCollateralAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer: fundOwner,
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
    amounts,
    assets,
    data: encodeArgs(['address[]'], [cTokens]),
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: CompoundDebtPositionActionId.RepayBorrowedAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer: fundOwner,
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
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.CompoundDebtPosition,
    signer,
  });
}
