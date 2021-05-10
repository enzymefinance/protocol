import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addTrackedAssetsToVaultArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  removeTrackedAssetsFromVaultArgs,
} from '@enzymefinance/protocol';

export function addTrackedAssetsToVault({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: AddressLike[];
}) {
  return comptrollerProxy
    .connect(signer)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.AddTrackedAssetsToVault,
      addTrackedAssetsToVaultArgs({ assets }),
    );
}

export function removeTrackedAssetsFromVault({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: AddressLike[];
}) {
  return comptrollerProxy
    .connect(signer)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.RemoveTrackedAssetsFromVault,
      removeTrackedAssetsFromVaultArgs({ assets }),
    );
}
