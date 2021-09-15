import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManagerActionId,
  ExternalPositionFactory,
  ExternalPositionManager,
  mockGenericExternalPositionActionArgs,
  MockGenericExternalPositionActionId,
  MockGenericExternalPositionLib,
  MockGenericExternalPositionParser,
  VaultLib,
} from '@enzymefinance/protocol/src';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { callOnExternalPosition } from './actions';

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

  const receipt = await comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      externalPositionManager,
      ExternalPositionManagerActionId.CreateExternalPosition,
      encodeArgs(['uint256', 'bytes'], [typeId, '0x']),
    );

  const externalPositionProxy = (await vaultProxy.getActiveExternalPositions())[0];

  return {
    typeId,
    mockGenericExternalPositionLib,
    mockExternalPositionParser,
    externalPositionProxy,
    receipt,
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
    assets,
    amounts,
  });

  return callOnExternalPosition({
    signer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: MockGenericExternalPositionActionId.AddDebtAssets,
    actionArgs,
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
    assets,
    amounts,
  });

  return callOnExternalPosition({
    signer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: MockGenericExternalPositionActionId.AddManagedAssets,
    actionArgs,
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
    assets,
    amounts,
  });

  return callOnExternalPosition({
    signer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: MockGenericExternalPositionActionId.RemoveDebtAssets,
    actionArgs,
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
    assets,
    amounts,
  });

  return callOnExternalPosition({
    signer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    actionId: MockGenericExternalPositionActionId.RemoveManagedAssets,
    actionArgs,
  });
}
