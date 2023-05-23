import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionFactory, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  mockGenericExternalPositionActionArgs,
  MockGenericExternalPositionActionId,
  MockGenericExternalPositionLib,
  MockGenericExternalPositionParser,
  VaultLib,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function createMockExternalPosition({
  comptrollerProxy,
  externalPositionManager,
  externalPositionFactory,
  defaultActionAssetsToTransfer,
  defaultActionAmountsToTransfer,
  defaultActionAssetsToReceive,
  fundOwner,
  deployer,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionFactory: ExternalPositionFactory;
  defaultActionAssetsToTransfer: AddressLike[];
  defaultActionAmountsToTransfer: BigNumberish[];
  defaultActionAssetsToReceive: AddressLike[];
  fundOwner: SignerWithAddress;
  deployer: SignerWithAddress;
}) {
  const vaultProxy = new VaultLib(await comptrollerProxy.getVaultProxy(), deployer);
  const typeId = await externalPositionFactory.getPositionTypeCounter();

  await externalPositionFactory.addNewPositionTypes(['TEST']);

  const mockGenericExternalPositionLib = await MockGenericExternalPositionLib.deploy(deployer);
  const mockExternalPositionParser = await MockGenericExternalPositionParser.deploy(deployer);

  mockExternalPositionParser.setAssetsForAction(
    0,
    defaultActionAssetsToTransfer,
    defaultActionAmountsToTransfer,
    defaultActionAssetsToReceive,
  );

  await externalPositionManager.updateExternalPositionTypesInfo(
    [typeId],
    [mockGenericExternalPositionLib],
    [mockExternalPositionParser],
  );

  const receipt = await createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: typeId,
    signer: fundOwner,
  });

  const externalPositionProxy = (await vaultProxy.getActiveExternalPositions())[0];

  return {
    externalPositionProxy,
    mockExternalPositionParser,
    mockGenericExternalPositionLib,
    receipt,
    typeId,
  };
}

export async function mockExternalPositionAddDebtAssets({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  assets,
  amounts,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  const actionArgs = mockGenericExternalPositionActionArgs({
    amounts,
    assets,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MockGenericExternalPositionActionId.AddDebtAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mockExternalPositionAddManagedAssets({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  assets,
  amounts,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  const actionArgs = mockGenericExternalPositionActionArgs({
    amounts,
    assets,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MockGenericExternalPositionActionId.AddManagedAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mockExternalPositionRemoveDebtAssets({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  assets,
  amounts,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  const actionArgs = mockGenericExternalPositionActionArgs({
    amounts,
    assets,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MockGenericExternalPositionActionId.RemoveDebtAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mockExternalPositionRemoveManagedAssets({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  assets,
  amounts,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  const actionArgs = mockGenericExternalPositionActionArgs({
    amounts,
    assets,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MockGenericExternalPositionActionId.RemoveManagedAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}
