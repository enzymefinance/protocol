import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManagerActionId,
  ExternalPositionFactory,
  ExternalPositionManager,
  MockGenericExternalPositionLib,
  MockGenericExternalPositionParser,
  VaultLib,
} from '@enzymefinance/protocol/src';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';

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

  await externalPositionFactory.addNewPositionTypes(['TEST']);
  const typeId = (await vaultProxy.getActiveExternalPositions()).length;

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
    mockGenericExternalPositionLib,
    mockExternalPositionParser,
    externalPositionProxy,
    receipt,
  };
}
